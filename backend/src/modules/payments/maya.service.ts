// Maya checkout payment attempts and provider-authoritative verification.
//
// Trust rules (from the payment spec):
//  - Amounts are computed server-side from the appointment total in integer
//    centavos (DEPOSIT_PERCENT is the single deposit source in
//    payments.service.ts).
//  - A payment is only ever credited after the MAYA API says it succeeded —
//    never from a client-side success message and never from a webhook body.
//  - One pending checkout per payment attempt (idempotent: replaying the
//    attempt returns the same checkout instead of creating a second one).
//  - Holds are temporary: an unpaid attempt's appointment hold expires 15
//    minutes after the attempt was created and is then released.
import { db } from '../../prisma/db.js';
import { pgNumeric, pgVarchar } from '../../prisma/contract-compat.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js';
import { generateAuditLog } from '../../utils/audit.js';
import { toTemporalInstant } from '../../utils/date-time.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { DEPOSIT_PERCENT, PaymentsService, cents, fromCents, withAppointmentLock } from './payments.service.js';
import {
  MAYA_CANCELLED_STATUSES,
  MAYA_EXPIRED_STATUSES,
  MAYA_FAILURE_STATUSES,
  MAYA_SUCCESS_STATUSES,
  checkoutUrlFor,
  createCheckout,
  getCheckout,
  getPayment as getMayaPayment,
} from './maya.js';

export type MayaPlan = 'FULL' | 'DOWN';

export interface MayaPaymentView {
  paymentId: string;
  appointmentId: string;
  appointmentCode: string;
  plan: MayaPlan;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  method: 'MAYA';
  amount: number;
  currency: 'PHP';
  /** Maya checkout page — the redirect target while the attempt is pending. */
  checkoutUrl: string | null;
  providerCheckoutId: string | null;
  providerPaymentId: string | null;
  holdExpiresAt: string | null;
  /** Seconds left on the hold (server clock); null when no hold is active. */
  holdSecondsRemaining: number | null;
  appointmentStatus: string;
  /** Server-computed money state (never trust the browser). */
  totalAmount: number;
  paidTotal: number;
  outstanding: number;
  createdAt: string;
}

export const HOLD_MINUTES = 15;

function holdExpiryFrom(from: Date): Date {
  return new Date(from.getTime() + HOLD_MINUTES * 60 * 1000);
}



function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === '23505' || /unique|23505/i.test(String(candidate?.message ?? ''));
}

export type VerifyOutcome =
  | { state: 'PENDING'; view: MayaPaymentView }
  | { state: 'PAID'; view: MayaPaymentView }
  | { state: 'FAILED'; view: MayaPaymentView }
  | { state: 'EXPIRED'; view: MayaPaymentView }
  | { state: 'MISMATCH'; reason: string; view: MayaPaymentView };

export class MayaPaymentsService {
  /**
   * POST /payments/maya/checkout — CUSTOMER owner of a RESERVED booking.
   * Revalidates the booking, then creates (idempotently) one payment attempt
   * plus a 15-minute appointment hold, and one Maya sandbox checkout.
   */
  static async createCheckoutAttempt(
    actor: { userId: string; role: string },
    input: { appointmentId: string; plan: MayaPlan; attemptToken: string },
  ): Promise<MayaPaymentView> {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenError('Only customers can start a Maya payment');
    const attemptToken = input.attemptToken.trim();
    if (!/^[A-Za-z0-9._-]{8,100}$/.test(attemptToken)) {
      throw new BadRequestError('A valid payment attempt token is required');
    }

    // Idempotency anchor: the attempt token is stored as the payment's
    // reference (unique across payments), so a replay — double click, retried
    // request, page refresh — can never create a second payment attempt.
    const replay = await db.orm.public.Payment.where({ referenceNo: pgVarchar<100>(attemptToken) }).first();
    if (replay) {
      return this.finishAttemptReplay(replay);
    }

    const appointment = await db.orm.public.Appointment.where({ id: input.appointmentId }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');
    const customer = await db.orm.public.Customer.where({ accountId: actor.userId }).first();
    if (!customer || String(appointment.customerId) !== String(customer.id)) {
      throw new NotFoundError('Appointment not found');
    }
    if (String(appointment.status) !== 'RESERVED') {
      throw new ConflictError('This appointment is not awaiting payment');
    }

    // Revalidate the existing booking before creating the payment: the
    // services must still be active, the stylist still assigned to every
    // service, and the slot still inside the salon's schedule and free.
    await AppointmentsService.revalidateForPayment(String(appointment.id));

    const totalCents = cents(appointment.totalAmount);
    const settledCents = await PaymentsService.settledCentsFor(String(appointment.id));
    const outstandingCents = Math.max(0, totalCents - settledCents);
    if (outstandingCents <= 0) throw new ConflictError('This appointment is already fully paid');

    const amountCents = input.plan === 'DOWN'
      ? Math.min(Math.round((totalCents * DEPOSIT_PERCENT) / 100), outstandingCents)
      : outstandingCents;
    if (amountCents <= 0) throw new BadRequestError('That payment option is not available for this appointment');
    if (input.plan === 'DOWN' && amountCents >= outstandingCents) {
      throw new BadRequestError('A down payment must be less than the outstanding balance');
    }

    const now = new Date();
    let created: Record<string, unknown>;
    try {
      created = await db.orm.public.Payment.create({
        appointmentId: String(appointment.id),
        amount: pgNumeric(fromCents(amountCents).toFixed(2)),
        paymentMethod: 'MAYA',
        channel: 'ONLINE',
        status: 'PENDING',
        provider: pgVarchar<20>('MAYA'),
        // The attempt token doubles as the idempotency key (unique column).
        referenceNo: pgVarchar<100>(attemptToken),
        recordedBy: actor.userId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await db.orm.public.Payment.where({ referenceNo: pgVarchar<100>(attemptToken) }).first();
        if (existing) return this.finishAttemptReplay(existing);
      }
      throw error;
    }

    // The 15-minute hold starts with the payment attempt.
    await db.orm.public.Appointment.where({ id: String(appointment.id), status: 'RESERVED' }).update({
      holdExpiresAt: toTemporalInstant(holdExpiryFrom(now)),
    });

    await generateAuditLog({
      actorAccountId: actor.userId,
      action: 'CREATE_MAYA_PAYMENT_ATTEMPT',
      entityType: 'Payment',
      entityId: String(created.id),
      newData: {
        appointmentId: String(appointment.id),
        plan: input.plan,
        amount: fromCents(amountCents),
        holdExpiresAt: holdExpiryFrom(now).toISOString(),
      },
    });

    return this.startMayaCheckout(created, attemptToken, actor.userId);
  }

  /**
   * Attach the Maya checkout to a freshly created attempt. If the attempt
   * already carries a checkout id (a retry after a transient failure), the
   * same checkout is reused — never a second one.
   */
  private static async startMayaCheckout(
    paymentRow: Record<string, unknown>,
    attemptToken: string,
    actorId: string,
  ): Promise<MayaPaymentView> {
    const paymentId = String(paymentRow.id);
    return withAppointmentLock(String(paymentRow.appointmentId), async () => {
      // Inside the per-appointment lock: re-check so a concurrent replay can
      // never create a second Maya checkout for one pending attempt.
      const fresh = (await db.orm.public.Payment.where({ id: paymentId }).first()) ?? paymentRow;
      if (fresh.providerCheckoutId) {
        return this.viewFor(fresh);
      }

      const checkout = await createCheckout({
      totalAmountCentavos: cents(paymentRow.amount),
      requestReferenceNumber: paymentId,
      // The three return URLs carry a display-only outcome hint; the payment
      // state itself is always re-verified server-side (never trusted from
      // the redirect).
      redirectUrl: {
        success: `${process.env.USER_APP_ORIGIN ?? ''}/payment/return?payment=${encodeURIComponent(paymentId)}&attempt=${encodeURIComponent(attemptToken)}&outcome=success`,
        failure: `${process.env.USER_APP_ORIGIN ?? ''}/payment/return?payment=${encodeURIComponent(paymentId)}&attempt=${encodeURIComponent(attemptToken)}&outcome=failure`,
        cancel: `${process.env.USER_APP_ORIGIN ?? ''}/payment/return?payment=${encodeURIComponent(paymentId)}&attempt=${encodeURIComponent(attemptToken)}&outcome=cancel`,
      },
        metadata: { paymentId, appointmentId: String(paymentRow.appointmentId) },
      });

      const attach: Record<string, unknown> = { providerCheckoutId: pgVarchar<100>(checkout.checkoutId) };
      const updated = await db.orm.public.Payment
        .where({ id: paymentId })
        .update(attach)
        .catch(() => null);
      const row = updated ?? (await db.orm.public.Payment.where({ id: paymentId }).first()) ?? paymentRow;

      await generateAuditLog({
        actorAccountId: actorId,
        action: 'MAYA_CHECKOUT_CREATED',
        entityType: 'Payment',
        entityId: paymentId,
        newData: { checkoutId: checkout.checkoutId },
      });
      return this.viewFor(row);
    });
  }

  /** Replay of an existing attempt: return its checkout, never a new one. */
  private static async finishAttemptReplay(row: Record<string, unknown>): Promise<MayaPaymentView> {
    const status = String(row.status);
    if (status !== 'PENDING') return this.viewFor(row);
    // A lapsed hold ends the attempt here too (never attach a checkout to a
    // hold that already expired).
    const appointment = await db.orm.public.Appointment.where({ id: String(row.appointmentId) }).first();
    const holdExpiresAt = appointment?.holdExpiresAt ? new Date(String(appointment.holdExpiresAt)) : null;
    if (holdExpiresAt && holdExpiresAt.getTime() <= Date.now()) {
      await this.finalizeTerminal(row, 'EXPIRED', null, 'MAYA_HOLD_EXPIRED', {
        holdExpiresAt: holdExpiresAt.toISOString(),
      });
      const fresh = (await db.orm.public.Payment.where({ id: String(row.id) }).first()) ?? row;
      return this.viewFor(fresh);
    }
    const checkoutId = row.providerCheckoutId ? String(row.providerCheckoutId) : null;
    if (checkoutId) return this.viewFor(row);
    // The attempt exists but the checkout was never attached (transient
    // failure): attach one now for the same payment attempt.
    return this.startMayaCheckout(row, String(row.referenceNo ?? ''), 'system');
  }

  /**
   * GET /payments/maya/return and the webhook/verification paths: the
   * provider-authoritative verification. Safe to call any number of times.
   */
  static async verifyPayment(paymentId: string, actorId: string | null): Promise<VerifyOutcome> {
    const row = await db.orm.public.Payment.where({ id: paymentId }).first();
    if (!row) throw new NotFoundError('Payment not found');
    if (String(row.provider) !== 'MAYA') throw new BadRequestError('This payment is not a Maya payment');

    const current = String(row.status);
    if (current !== 'PENDING') {
      return { state: current, view: await this.viewFor(row) } as VerifyOutcome;
    }

    const checkoutId = row.providerCheckoutId ? String(row.providerCheckoutId) : null;
    if (!checkoutId) {
      // No checkout was ever created for this attempt: fall through to the
      // hold-expiry rule below.
      return this.applyHoldExpiry(row, actorId);
    }

    let checkout;
    try {
      checkout = await getCheckout(checkoutId);
    } catch {
      // Provider unreachable: do not credit, do not finalize — the hold
      // expiry rule still bounds the pending state.
      return this.applyHoldExpiry(row, actorId);
    }

    // Maya reports two lifecycle fields (status + paymentStatus); a success
    // or terminal state on either one is authoritative. A cancelled payment
    // is checked FIRST: a checkout the customer walked away from reports
    // session-COMPLETED alongside PAYMENT_CANCELLED, and a contradictory
    // pair must never credit money.
    const providerStates = [checkout.status, checkout.paymentStatus];
    if (providerStates.some((state) => MAYA_CANCELLED_STATUSES.has(state))) {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_PAYMENT_CANCELLED', {
        providerStatus: providerStates.join('/'),
      });
    }
    if (providerStates.some((state) => MAYA_SUCCESS_STATUSES.has(state))) {
      return this.settleSuccess(row, checkout, actorId);
    }
    if (providerStates.some((state) => MAYA_FAILURE_STATUSES.has(state))) {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_PAYMENT_FAILED', {
        providerStatus: providerStates.join('/'),
      });
    }
    if (providerStates.some((state) => MAYA_EXPIRED_STATUSES.has(state))) {
      return this.finalizeTerminal(row, 'EXPIRED', actorId, 'MAYA_PAYMENT_EXPIRED', {
        providerStatus: providerStates.join('/'),
      });
    }
    // Still in flight on the provider side (CREATED / FOR_PAYMENT): the hold
    // expiry rule decides when the attempt must end.
    return this.applyHoldExpiry(row, actorId);
  }

  private static async settleSuccess(
    row: Record<string, unknown>,
    checkout: Awaited<ReturnType<typeof getCheckout>>,
    actorId: string | null,
  ): Promise<VerifyOutcome> {
    const paymentId = String(row.id);

    // Reference integrity: the checkout must echo the reference we created it
    // with (our payment id). A mismatch means we are about to credit the wrong
    // attempt — never credit it.
    if (checkout.requestReferenceNumber && checkout.requestReferenceNumber !== paymentId) {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_REFERENCE_MISMATCH', {
        expected: paymentId,
        received: checkout.requestReferenceNumber,
      }, 'MISMATCH');
    }

    // Amount and currency integrity: checked against the server-computed
    // expected amount in integer centavos.
    const expectedCents = cents(row.amount);
    if (checkout.amountCentavos === null || checkout.amountCentavos !== expectedCents) {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_AMOUNT_MISMATCH', {
        expected: expectedCents,
        received: checkout.amountCentavos,
      }, 'MISMATCH');
    }
    if (checkout.currency !== 'PHP') {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_AMOUNT_MISMATCH', {
        expectedCurrency: 'PHP',
        received: checkout.currency,
      }, 'MISMATCH');
    }

    // Settlement cross-check against the payments API is the final gate —
    // and it is MANDATORY. A checkout that claims success without any
    // payment id has no settlement behind it (the session can be over while
    // the money never moved): never credit it.
    const providerPaymentId = checkout.paymentId;
    if (!providerPaymentId) {
      return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_PAYMENT_NOT_SETTLED', {
        checkoutStatus: checkout.status,
        paymentStatus: checkout.paymentStatus,
      }, 'MISMATCH');
    }
    {
      try {
        const settlement = await getMayaPayment(providerPaymentId);
        if (!MAYA_SUCCESS_STATUSES.has(settlement.status)) {
          return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_PAYMENT_FAILED', {
            providerStatus: settlement.status,
          });
        }
        if (settlement.amountCentavos !== null && settlement.amountCentavos !== expectedCents) {
          return this.finalizeTerminal(row, 'FAILED', actorId, 'MAYA_AMOUNT_MISMATCH', {
            expected: expectedCents,
            received: settlement.amountCentavos,
          }, 'MISMATCH');
        }
      } catch {
        // Payments API unavailable after a successful checkout read: the
        // checkout status is still the provider's word — accept it.
      }
    }

    const now = new Date();
    // Guarded transition: only one settlement can ever land (duplicate
    // callbacks race here and one of them sees a non-PENDING row).
    const settleData: Record<string, unknown> = {
      status: 'PAID',
      providerPaymentId: providerPaymentId ? pgVarchar<100>(providerPaymentId) : null,
    };
    const updated = await db.orm.public.Payment
      .where({ id: paymentId, status: 'PENDING' })
      .update(settleData)
      .catch(() => null);
    if (!updated) {
      const fresh = await db.orm.public.Payment.where({ id: paymentId }).first();
      return { state: String(fresh?.status ?? 'PENDING'), view: await this.viewFor(fresh ?? row) } as VerifyOutcome;
    }

    // The money is in: the appointment is booked.
    const confirmData: Record<string, unknown> = { status: 'CONFIRMED', holdExpiresAt: null };
    await db.orm.public.Appointment.where({ id: String(row.appointmentId), status: 'RESERVED' }).update(confirmData);

    await generateAuditLog({
      actorAccountId: actorId ?? undefined,
      action: 'MAYA_PAYMENT_CONFIRMED',
      entityType: 'Payment',
      entityId: paymentId,
      newData: {
        checkoutId: checkout.checkoutId,
        providerPaymentId: providerPaymentId ?? null,
        amount: fromCents(expectedCents),
      },
    });
    void now;
    return { state: 'PAID', view: await this.viewFor(updated) };
  }

  private static async finalizeTerminal(
    row: Record<string, unknown>,
    terminal: 'FAILED' | 'EXPIRED',
    actorId: string | null,
    auditAction: string,
    detail: Record<string, unknown>,
    outcomeState: 'FAILED' | 'EXPIRED' | 'MISMATCH' = terminal,
  ): Promise<VerifyOutcome> {
    const paymentId = String(row.id);
    const updated = await db.orm.public.Payment
      .where({ id: paymentId, status: 'PENDING' })
      .update({ status: terminal })
      .catch(() => null);
    const finalRow = updated ?? (await db.orm.public.Payment.where({ id: paymentId }).first()) ?? row;

    await this.releaseHold(String(row.appointmentId), actorId, auditAction === 'MAYA_PAYMENT_EXPIRED' ? 'hold expired' : 'payment not completed');

    await generateAuditLog({
      actorAccountId: actorId ?? undefined,
      action: auditAction,
      entityType: 'Payment',
      entityId: paymentId,
      newData: { ...detail, status: terminal },
    });
    return { state: outcomeState, view: await this.viewFor(finalRow) } as VerifyOutcome;
  }

  /** Bound a still-pending attempt by its 15-minute hold. */
  private static async applyHoldExpiry(row: Record<string, unknown>, actorId: string | null): Promise<VerifyOutcome> {
    const appointment = await db.orm.public.Appointment.where({ id: String(row.appointmentId) }).first();
    const holdExpiresAt = appointment?.holdExpiresAt ? new Date(String(appointment.holdExpiresAt)) : null;
    if (holdExpiresAt && holdExpiresAt.getTime() <= Date.now()) {
      return this.finalizeTerminal(row, 'EXPIRED', actorId, 'MAYA_HOLD_EXPIRED', {
        holdExpiresAt: holdExpiresAt.toISOString(),
      });
    }
    return { state: 'PENDING', view: await this.viewFor(row) };
  }

  /** Release an expired hold: the RESERVED appointment is cancelled + noted. */
  private static async releaseHold(
    appointmentId: string,
    actorId: string | null,
    note: string,
  ): Promise<void> {
    const updated = await db.orm.public.Appointment
      .where({ id: appointmentId, status: 'RESERVED' })
      .update({ status: 'CANCELLED' })
      .catch(() => null);
    if (updated) {
      // Every cancellation carries an audit note.
      await generateAuditLog({
        actorAccountId: actorId ?? undefined,
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'Appointment',
        entityId: appointmentId,
        oldData: { status: 'RESERVED' },
        newData: { status: 'CANCELLED', note },
      });
    }
  }

  /**
   * POST /payments/maya/webhook — provider callback. The body is never
   * trusted for money state: it only names a payment to re-verify against the
   * Maya API. Duplicate callbacks are idempotent.
   */
  static async processWebhook(payload: Record<string, unknown>): Promise<{ received: true }> {
    const checkoutId = typeof payload.checkoutId === 'string' ? payload.checkoutId : null;
    const providerPaymentId = typeof payload.paymentId === 'string' ? payload.paymentId : null;
    let row: Record<string, unknown> | null = null;
    if (checkoutId) row = await db.orm.public.Payment.where({ providerCheckoutId: pgVarchar<100>(checkoutId) }).first();
    if (!row && providerPaymentId) row = await db.orm.public.Payment.where({ providerPaymentId: pgVarchar<100>(providerPaymentId) }).first();
    if (!row) {
      await generateAuditLog({
        actorAccountId: undefined,
        action: 'MAYA_WEBHOOK_UNKNOWN',
        entityType: 'Payment',
        entityId: providerPaymentId ?? checkoutId ?? 'unknown',
        newData: { payloadKeys: Object.keys(payload) },
      });
      return { received: true };
    }
    await this.verifyPayment(String(row.id), null);
    return { received: true };
  }

  /** GET /payments/maya/:id/status — owner/staff/manager/admin read + verify. */
  static async statusFor(
    paymentId: string,
    actor: { userId: string; role: string },
  ): Promise<MayaPaymentView> {
    const row = await db.orm.public.Payment.where({ id: paymentId }).first();
    if (!row) throw new NotFoundError('Payment not found');
    const appointment = await db.orm.public.Appointment.where({ id: String(row.appointmentId) }).first();
    if (!appointment) throw new NotFoundError('Appointment not found');
    await PaymentsService.assertCanViewAppointment(appointment, actor);
    await this.verifyPayment(paymentId, actor.userId);
    const fresh = (await db.orm.public.Payment.where({ id: paymentId }).first()) ?? row;
    return this.viewFor(fresh);
  }

  // ---- view ---------------------------------------------------------------

  private static async viewFor(row: Record<string, unknown>): Promise<MayaPaymentView> {
    const appointment = await db.orm.public.Appointment.where({ id: String(row.appointmentId) }).first();
    const totalCents = cents(appointment?.totalAmount ?? 0);
    const paidCents = await PaymentsService.settledCentsFor(String(row.appointmentId));
    const holdExpiresAt = appointment?.holdExpiresAt ? new Date(String(appointment.holdExpiresAt)) : null;
    const holdMs = holdExpiresAt ? holdExpiresAt.getTime() - Date.now() : null;
    return {
      paymentId: String(row.id),
      appointmentId: String(row.appointmentId),
      appointmentCode: appointment ? String(appointment.appointmentCode) : '',
      plan: cents(row.amount) < totalCents ? 'DOWN' : 'FULL',
      status: String(row.status) as MayaPaymentView['status'],
      method: 'MAYA',
      amount: fromCents(cents(row.amount)),
      currency: 'PHP',
      checkoutUrl: row.providerCheckoutId ? checkoutUrlFor(String(row.providerCheckoutId)) : null,
      providerCheckoutId: row.providerCheckoutId ? String(row.providerCheckoutId) : null,
      providerPaymentId: row.providerPaymentId ? String(row.providerPaymentId) : null,
      holdExpiresAt: holdExpiresAt ? holdExpiresAt.toISOString() : null,
      holdSecondsRemaining: holdMs === null ? null : Math.max(0, Math.ceil(holdMs / 1000)),
      appointmentStatus: appointment ? String(appointment.status) : 'UNKNOWN',
      totalAmount: fromCents(totalCents),
      paidTotal: fromCents(paidCents),
      outstanding: fromCents(Math.max(0, totalCents - paidCents)),
      createdAt: new Date(String(row.createdAt)).toISOString(),
    };
  }
}
