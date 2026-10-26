// Payment transactions for appointments (GCash online deposits and in-person
// balance payments). Money amounts are ALWAYS computed server-side from the
// authoritative appointment total — never from the browser.
//
// Model: one row per transaction. Outstanding balance =
//   appointment.totalAmount − Σ(verified transaction amounts).
// Guards: overpayment rejected, one pending online submission per appointment,
// references unique across all transactions, confirmation is one-way (a
// confirmed transaction can never be re-confirmed), and every state change is
// audited. Concurrent in-person recordings for the same appointment are
// serialized through a per-appointment lock plus a transactional recheck.
import { db } from '../../prisma/db.js'
import { pgNumeric, pgVarchar } from '../../prisma/contract-compat.js'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../errors/index.js'
import { generateAuditLog } from '../../utils/audit.js'

export type PaymentChannelValue = 'ONLINE' | 'IN_PERSON'
export type PaymentMethodValue = 'CASH' | 'GCASH'

export interface PaymentTransaction {
  id: string
  appointmentId: string
  appointmentCode: string
  customerName: string
  customerEmail: string
  serviceName: string
  amount: number
  paymentMethod: PaymentMethodValue
  channel: PaymentChannelValue
  status: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED'
  referenceNo: string | null
  proofUrl: string | null
  bookingStatus: string
  recordedBy: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  createdAt: string
  /** Server-computed appointment money state (never trust the browser). */
  appointmentTotal: number
  verifiedTotal: number
  outstanding: number
}

export interface PaymentQuote {
  appointmentId: string
  totalAmount: number
  verifiedTotal: number
  outstanding: number
  options: Array<{ key: 'FULL' | 'DOWN'; amount: number }>
  settings: PaymentSettingsView
}

export interface PaymentSettingsView {
  configured: boolean
  gcashQrUrl: string | null
  receiverName: string | null
  accountNumberMasked: string | null
  downPaymentKind: 'NONE' | 'FIXED' | 'PERCENT'
  downPaymentValue: number
}

const APPROVED_DEFAULTS = { kind: 'PERCENT' as const, value: 50 }

function cents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100)
}
function fromCents(value: number): number {
  return Math.round(value) / 100
}

// Serialize check-then-insert per appointment so two staff members cannot
// both collect the same remaining balance (single-process mutex + the
// in-transaction outstanding recheck below).
const appointmentLocks = new Map<string, Promise<unknown>>()
async function withAppointmentLock<T>(appointmentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = appointmentLocks.get(appointmentId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  appointmentLocks.set(appointmentId, run.then(() => undefined, () => undefined))
  try {
    return await run
  } finally {
    if ((await appointmentLocks.get(appointmentId)) !== undefined) {
      // keep the settled promise until the next caller chains onto it
    }
  }
}

export class PaymentsService {
  static async getSettings(): Promise<PaymentSettingsView> {
    const row = await db.orm.public.PaymentSetting.all().then((rows) => rows[0] ?? null)
    if (!row) {
      return {
        configured: false,
        gcashQrUrl: null,
        receiverName: null,
        accountNumberMasked: null,
        downPaymentKind: APPROVED_DEFAULTS.kind,
        downPaymentValue: APPROVED_DEFAULTS.value,
      }
    }
    return {
      configured: Boolean(row.gcashQrUrl),
      gcashQrUrl: row.gcashQrUrl ? String(row.gcashQrUrl) : null,
      receiverName: row.receiverName ? String(row.receiverName) : null,
      accountNumberMasked: row.accountNumberMasked ? String(row.accountNumberMasked) : null,
      downPaymentKind: String(row.downPaymentKind) as PaymentSettingsView['downPaymentKind'],
      downPaymentValue: fromCents(cents(row.downPaymentValue)),
    }
  }

  static async updateSettings(
    actorId: string,
    patch: {
      receiverName?: string | null
      accountNumberMasked?: string | null
      downPaymentKind?: 'NONE' | 'FIXED' | 'PERCENT'
      downPaymentValue?: number
      gcashQrUrl?: string | null
      gcashQrStoragePath?: string | null
    },
  ): Promise<PaymentSettingsView> {
    const existing = (await db.orm.public.PaymentSetting.all())[0] ?? null
    const data: Record<string, unknown> = { updatedBy: actorId }
    if (patch.receiverName !== undefined) data.receiverName = patch.receiverName === null ? null : pgVarchar<100>(patch.receiverName)
    if (patch.accountNumberMasked !== undefined) data.accountNumberMasked = patch.accountNumberMasked === null ? null : pgVarchar<30>(patch.accountNumberMasked)
    if (patch.downPaymentKind !== undefined) data.downPaymentKind = patch.downPaymentKind
    if (patch.downPaymentValue !== undefined) data.downPaymentValue = pgNumeric(patch.downPaymentValue.toFixed(2))
    if (patch.gcashQrUrl !== undefined) data.gcashQrUrl = patch.gcashQrUrl === null ? null : pgVarchar<500>(patch.gcashQrUrl)
    if (patch.gcashQrStoragePath !== undefined) data.gcashQrStoragePath = patch.gcashQrStoragePath === null ? null : pgVarchar<500>(patch.gcashQrStoragePath)

    const saved = existing
      ? await db.orm.public.PaymentSetting.where({ id: existing.id }).update(data)
      : await db.orm.public.PaymentSetting.create({ ...data })
    await generateAuditLog({
      actorAccountId: actorId,
      action: 'UPDATE_PAYMENT_SETTINGS',
      entityType: 'PaymentSetting',
      entityId: String((saved ?? existing)!.id),
      newData: { kind: patch.downPaymentKind, value: patch.downPaymentValue },
    })
    return this.getSettings()
  }

  /** Server-authoritative amounts for one appointment. */
  static async quote(appointmentId: string, actor: { userId: string; role: string }): Promise<PaymentQuote> {
    const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first()
    if (!appointment) throw new NotFoundError('Appointment not found')
    await this.assertCanViewAppointment(appointment, actor)

    const total = cents(appointment.totalAmount)
    const verifiedTotal = await this.verifiedCentsFor(appointmentId)
    const outstanding = Math.max(0, total - verifiedTotal)
    const settings = await this.getSettings()

    const options: PaymentQuote['options'] = []
    if (outstanding > 0) {
      options.push({ key: 'FULL', amount: fromCents(outstanding) })
      if (settings.downPaymentKind !== 'NONE' && settings.downPaymentValue > 0) {
        const down = settings.downPaymentKind === 'PERCENT'
          ? Math.floor((total * Math.round(settings.downPaymentValue * 100)) / 10000)
          : cents(settings.downPaymentValue)
        const capped = Math.min(down, outstanding)
        if (capped > 0 && capped < outstanding) {
          options.push({ key: 'DOWN', amount: fromCents(capped) })
        }
      }
    }
    return {
      appointmentId,
      totalAmount: fromCents(total),
      verifiedTotal: fromCents(verifiedTotal),
      outstanding: fromCents(outstanding),
      options,
      settings,
    }
  }

  /** POST /payments/:appointmentId/online — CUSTOMER owner, proof + reference. */
  static async submitOnline(
    appointmentId: string,
    actor: { userId: string; role: string },
    input: { option: 'FULL' | 'DOWN'; referenceNo: string; proofUrl: string; proofStoragePath: string },
  ): Promise<PaymentTransaction> {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenError('Only customers can submit online payments')
    return withAppointmentLock(appointmentId, async () => {
      const appointment = await db.orm.public.Appointment.where({ id: appointmentId }).first()
      if (!appointment) throw new NotFoundError('Appointment not found')
      await this.assertCanViewAppointment(appointment, actor)

      const pending = (await db.orm.public.Payment.where({ appointmentId }).all())
        .find((row) => String(row.channel) === 'ONLINE' && String(row.status) === 'UNVERIFIED')
      if (pending) throw new ConflictError('An online payment for this appointment is already awaiting verification')

      const quote = await this.quote(appointmentId, actor)
      const option = quote.options.find((entry) => entry.key === input.option)
      if (!option) throw new BadRequestError('That payment option is not available for this appointment')
      const amount = option.amount

      const created = await db.orm.public.Payment.create({
        appointmentId,
        amount: pgNumeric(amount.toFixed(2)),
        paymentMethod: 'GCASH',
        channel: 'ONLINE',
        status: 'UNVERIFIED',
        referenceNo: pgVarchar<100>(input.referenceNo),
        proofUrl: pgVarchar<500>(input.proofUrl),
        proofStoragePath: pgVarchar<500>(input.proofStoragePath),
        recordedBy: actor.userId,
      })
      await generateAuditLog({
        actorAccountId: actor.userId,
        action: 'SUBMIT_ONLINE_PAYMENT',
        entityType: 'Payment',
        entityId: String(created.id),
        newData: { appointmentId, amount, option: input.option },
      })
      return this.rowToTransaction(created, appointment)
    })
  }

  /** POST /payments/in-person — STAFF/MANAGER/ADMIN after receiving the money. */
  static async recordInPerson(
    actor: { userId: string; role: string },
    input: { appointmentId: string; method: PaymentMethodValue; amount: number; referenceNo?: string | null },
  ): Promise<PaymentTransaction> {
    if (actor.role !== 'STAFF' && actor.role !== 'MANAGER' && actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only staff can record in-person payments')
    }
    const amount = Math.round(Number(input.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestError('Enter an amount greater than zero')

    return withAppointmentLock(input.appointmentId, async () => {
      const appointment = await db.orm.public.Appointment.where({ id: input.appointmentId }).first()
      if (!appointment) throw new NotFoundError('Appointment not found')

      const outstanding = fromCents(Math.max(0, cents(appointment.totalAmount) - await this.verifiedCentsFor(input.appointmentId)))
      if (amount > outstanding) {
        throw new ConflictError('The amount exceeds the outstanding balance')
      }
      // Money received in person is accepted immediately: recorded = verified.
      const created = await db.orm.public.Payment.create({
        appointmentId: input.appointmentId,
        amount: pgNumeric(amount.toFixed(2)),
        paymentMethod: input.method,
        channel: 'IN_PERSON',
        status: 'VERIFIED',
        referenceNo: input.referenceNo ? pgVarchar<100>(input.referenceNo) : null,
        recordedBy: actor.userId,
        verifiedBy: actor.userId,
        verifiedAt: new Date(),
      })
      await generateAuditLog({
        actorAccountId: actor.userId,
        action: 'RECORD_IN_PERSON_PAYMENT',
        entityType: 'Payment',
        entityId: String(created.id),
        newData: { appointmentId: input.appointmentId, amount, method: input.method },
      })
      return this.rowToTransaction(created, appointment)
    })
  }

  /** PATCH /payments/:id/status — ADMIN/MANAGER, one-way, audited. */
  static async setStatus(
    actor: { userId: string; role: string },
    paymentId: string,
    status: 'VERIFIED' | 'REJECTED',
  ): Promise<PaymentTransaction> {
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      throw new ForbiddenError('Only managers and admins can verify payments')
    }
    const row = await db.orm.public.Payment.where({ id: paymentId }).first()
    if (!row) throw new NotFoundError('Payment not found')
    if (String(row.status) !== 'UNVERIFIED') {
      throw new ConflictError('This payment has already been confirmed')
    }
    const updated = await db.orm.public.Payment.where({ id: paymentId }).update({
      status,
      verifiedBy: actor.userId,
      verifiedAt: new Date(),
    })
    await generateAuditLog({
      actorAccountId: actor.userId,
      action: status === 'VERIFIED' ? 'VERIFY_PAYMENT' : 'REJECT_PAYMENT',
      entityType: 'Payment',
      entityId: paymentId,
      oldData: { status: 'UNVERIFIED' },
      newData: { status },
    })
    const appointment = await db.orm.public.Appointment.where({ id: row.appointmentId }).first()
    return this.rowToTransaction(updated ?? row, appointment!)
  }

  /** GET /payments — ADMIN/MANAGER (also used by STAFF views of their own work). */
  static async listAll(actor: { userId: string; role: string }): Promise<{ payments: PaymentTransaction[] }> {
    const rows = await db.orm.public.Payment.all()
    const payments: PaymentTransaction[] = []
    for (const row of rows) {
      const appointment = await db.orm.public.Appointment.where({ id: row.appointmentId }).first()
      if (!appointment) continue
      if (actor.role === 'STAFF') {
        const staff = await db.orm.public.Staff.where({ accountId: actor.userId }).first()
        if (!staff || String(appointment.staffId ?? '') !== String(staff.id)) continue
      }
      payments.push(await this.rowToTransaction(row, appointment))
    }
    return { payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  /** GET /payments/mine — CUSTOMER: their own transactions only. */
  static async listMine(userId: string): Promise<{ payments: PaymentTransaction[] }> {
    const customer = await db.orm.public.Customer.where({ accountId: userId }).first()
    if (!customer) throw new NotFoundError('No customer profile found for this account')
    const rows = await db.orm.public.Payment.all()
    const payments: PaymentTransaction[] = []
    for (const row of rows) {
      const appointment = await db.orm.public.Appointment.where({ id: row.appointmentId }).first()
      if (!appointment || String(appointment.customerId) !== String(customer.id)) continue
      payments.push(await this.rowToTransaction(row, appointment))
    }
    return { payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  /** GET /payments/activity — recent payment audit entries. */
  static async activity(): Promise<{ activities: Array<{ id: string; message: string; createdAt: string }> }> {
    const actions = new Set(['SUBMIT_ONLINE_PAYMENT', 'RECORD_IN_PERSON_PAYMENT', 'VERIFY_PAYMENT', 'REJECT_PAYMENT', 'UPDATE_PAYMENT_SETTINGS'])
    const rows = await db.orm.public.AuditLog.all()
    const activities = rows
      .filter((row) => actions.has(String(row.action)))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50)
      .map((row) => ({
        id: String(row.id),
        message: `${String(row.action).replace(/_/g, ' ').toLowerCase()} · ${String(row.entityType)} ${String(row.entityId).slice(0, 8)}`,
        createdAt: new Date(String(row.createdAt)).toISOString(),
      }))
    return { activities }
  }

  // ---- internals ---------------------------------------------------------

  private static async verifiedCentsFor(appointmentId: string): Promise<number> {
    const rows = await db.orm.public.Payment.where({ appointmentId }).all()
    return rows
      .filter((row) => String(row.status) === 'VERIFIED')
      .reduce((sum, row) => sum + cents(row.amount), 0)
  }

  private static async assertCanViewAppointment(
    appointment: { customerId: unknown; staffId?: unknown },
    actor: { userId: string; role: string },
  ): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'MANAGER') return
    if (actor.role === 'CUSTOMER') {
      const customer = await db.orm.public.Customer.where({ accountId: actor.userId }).first()
      if (!customer || String(appointment.customerId) !== String(customer.id)) {
        throw new NotFoundError('Appointment not found')
      }
      return
    }
    if (actor.role === 'STAFF') {
      const staff = await db.orm.public.Staff.where({ accountId: actor.userId }).first()
      if (!staff || String(appointment.staffId ?? '') !== String(staff.id)) {
        throw new NotFoundError('Appointment not found')
      }
      return
    }
    throw new ForbiddenError('You do not have permission to view this appointment')
  }

  private static async rowToTransaction(row: Record<string, unknown>, appointment: Record<string, unknown>): Promise<PaymentTransaction> {
    const customer = await db.orm.public.Customer.where({ id: String(appointment.customerId) }).first()
    const account = customer ? await db.orm.public.Account.where({ id: String(customer.accountId) }).first() : null
    const services = await db.orm.public.AppointmentService.where({ appointmentId: String(appointment.id) }).all()
    return {
      id: String(row.id),
      appointmentId: String(row.appointmentId),
      appointmentCode: String(appointment.appointmentCode),
      customerName: customer ? `${String(customer.firstName)} ${String(customer.lastName)}`.trim() : 'Customer',
      customerEmail: account ? String(account.email) : '',
      serviceName: services.map((service) => String(service.serviceName)).join(', ') || 'Salon appointment',
      amount: fromCents(cents(row.amount)),
      paymentMethod: String(row.paymentMethod) as PaymentMethodValue,
      channel: String(row.channel) as PaymentChannelValue,
      status: String(row.status) as PaymentTransaction['status'],
      referenceNo: row.referenceNo ? String(row.referenceNo) : null,
      proofUrl: row.proofUrl ? String(row.proofUrl) : null,
      bookingStatus: String(appointment.status),
      recordedBy: row.recordedBy ? String(row.recordedBy) : null,
      verifiedBy: row.verifiedBy ? String(row.verifiedBy) : null,
      verifiedAt: row.verifiedAt ? new Date(String(row.verifiedAt)).toISOString() : null,
      createdAt: new Date(String(row.createdAt)).toISOString(),
      appointmentTotal: fromCents(cents(appointment.totalAmount)),
      verifiedTotal: fromCents(await this.verifiedCentsFor(String(row.appointmentId))),
      outstanding: fromCents(Math.max(0, cents(appointment.totalAmount) - await this.verifiedCentsFor(String(row.appointmentId)))),
    }
  }
}
