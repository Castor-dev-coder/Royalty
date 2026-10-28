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
import * as storage from '../images/storage.js'
import { toTemporalInstant } from '../../utils/date-time.js'

/** Trim, uppercase and strip inner spaces: ' a b c123 ' -> 'ABC123'. */
export function normalizeReference(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

/** Postgres unique_violation (23505) from the ORM or the raw driver. */
function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate?.code === '23505' || /unique|23505/i.test(String(candidate?.message ?? ''))
}

export type PaymentChannelValue = 'ONLINE' | 'IN_PERSON'
export type PaymentMethodValue = 'CASH' | 'GCASH' | 'MAYA'
export type PaymentStatusValue = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED'

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
  status: PaymentStatusValue
  referenceNo: string | null
  /** 'MANUAL' (human-recorded) or 'MAYA' (provider-confirmed). */
  provider: string
  /** Maya references (null for manual rows). */
  providerCheckoutId: string | null
  providerPaymentId: string | null
  /** Payment plan for Maya rows: FULL or DOWN; null for manual rows. */
  plan: 'FULL' | 'DOWN' | null
  /** True when a proof image is stored; the path/URL itself is never exposed. */
  hasProof: boolean
  bookingStatus: string
  recordedBy: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  createdAt: string
  /** Seconds left on the payment hold (server clock); null when no hold. */
  holdSecondsRemaining: number | null
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

// The one server-side deposit setting: new deposits are
// round(total x DEPOSIT_PERCENT / 100) in integer centavos. The
// payment_settings row can switch the policy (NONE/FIXED/PERCENT) but the
// PERCENT rate always comes from here — existing payment rows are never
// recomputed; balances always use actual verified payments.
export const DEPOSIT_PERCENT = 40

const APPROVED_DEFAULTS = { kind: 'PERCENT' as const, value: DEPOSIT_PERCENT }

export function cents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100)
}
export function fromCents(value: number): number {
  return Math.round(value) / 100
}

// Serialize check-then-insert per appointment so two staff members cannot
// both collect the same remaining balance (single-process mutex + the
// in-transaction outstanding recheck below).
const appointmentLocks = new Map<string, Promise<unknown>>()
export async function withAppointmentLock<T>(appointmentId: string, fn: () => Promise<T>): Promise<T> {
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

/** Money counted as received (VERIFIED / PAID) summed over payment rows. */
function settledCentsFromRows(rows: ReadonlyArray<Record<string, unknown>>): number {
  return rows.reduce((sum, row) => {
    const status = String(row.status)
    return status === 'VERIFIED' || status === 'PAID' ? sum + cents(row.amount) : sum
  }, 0)
}

/** settledCentsFromRows grouped per appointment id (list paths). */
function settledCentsByAppointment(rows: ReadonlyArray<Record<string, unknown>>): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const status = String(row.status)
    if (status !== 'VERIFIED' && status !== 'PAID') continue
    const key = String(row.appointmentId)
    totals.set(key, (totals.get(key) ?? 0) + cents(row.amount))
  }
  return totals
}

// ---- display settings cache --------------------------------------------
// PaymentSetting is a single row of admin-written, rarely changing reference
// data (QR display fields and the deposit policy) and every write to it goes
// through PaymentsService.updateSettings below. Display reads (the settings
// panel, quote screens) may be served from this short-lived in-process cache
// so each payment screen is not charged a full network round-trip; updates
// invalidate it and a TTL bounds any staleness from out-of-band database
// writes. MONEY PATHS NEVER READ THE CACHE: submitOnline computes amounts
// from getSettings() live, so authorization always sees current rows. On any
// miss or read failure the code falls through to a live query and serves the
// database's answer — never a stale or fabricated value.
const SETTINGS_CACHE_TTL_MS = 30_000
let settingsCache: { value: PaymentSettingsView; expiresAt: number } | null = null

export function invalidateSettingsCache(): void {
  settingsCache = null
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
      // PERCENT always reports the server setting; the row value serves FIXED.
      downPaymentValue:
        String(row.downPaymentKind) === 'PERCENT' ? DEPOSIT_PERCENT : fromCents(cents(row.downPaymentValue)),
    }
  }

  /** Cached settings for display paths only (see the cache rules above). */
  static async getSettingsCached(): Promise<PaymentSettingsView> {
    if (process.env.NODE_ENV === 'test') return this.getSettings()
    const now = Date.now()
    const cached = settingsCache
    if (cached && now < cached.expiresAt) return cached.value
    try {
      const value = await this.getSettings()
      settingsCache = { value, expiresAt: now + SETTINGS_CACHE_TTL_MS }
      return value
    } catch (error) {
      // A read we could not complete is never cached; the next caller
      // retries live and serves the database's answer or the real error.
      invalidateSettingsCache()
      throw error
    }
  }

  /**
   * Startup warm-up for the settings cache. Failure only leaves the cache
   * empty — every read then falls back to a live query, so an unreachable
   * database at boot can never leave stale or wrong values in service.
   */
  static async warmSettingsCache(): Promise<void> {
    try {
      await this.getSettingsCached()
    } catch {
      // Cache stays empty; requests fall back to live reads.
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
    // The only writer of PaymentSetting: invalidate the display cache so the
    // next read reflects this save (the fresh return below is already live).
    invalidateSettingsCache()
    return this.getSettings()
  }

  /** Server-authoritative amounts for one appointment. */
  static async quote(appointmentId: string, actor: { userId: string; role: string }): Promise<PaymentQuote> {
    // The three reads are independent (each keys off the appointment id or
    // is one-row reference data), so they run in parallel instead of as a
    // three-round-trip chain. Visibility is checked right after, exactly as
    // before; a missing appointment still answers 404 first.
    const [appointment, verifiedTotal, settings] = await Promise.all([
      db.orm.public.Appointment.where({ id: appointmentId }).first(),
      this.settledCentsFor(appointmentId),
      this.getSettingsCached(),
    ])
    if (!appointment) throw new NotFoundError('Appointment not found')
    await this.assertCanViewAppointment(appointment, actor)
    return this.quoteFrom(appointmentId, appointment, verifiedTotal, settings)
  }

  /**
   * Pure quote math, one copy shared by display and money paths. The
   * caller always supplies live money rows; `settings` is cached for
   * display quotes and read live for submissions.
   */
  private static quoteFrom(
    appointmentId: string,
    appointment: Record<string, unknown>,
    verifiedTotal: number,
    settings: PaymentSettingsView,
  ): PaymentQuote {
    const total = cents(appointment.totalAmount)
    const outstanding = Math.max(0, total - verifiedTotal)
    const options: PaymentQuote['options'] = []
    if (outstanding > 0) {
      options.push({ key: 'FULL', amount: fromCents(outstanding) })
      // The deposit option exists only before a deposit exists (per the
      // approved UX rule): once anything is verified, only FULL remains.
      if (verifiedTotal === 0 && settings.downPaymentKind !== 'NONE' && settings.downPaymentValue > 0) {
        // Integer centavos, no floats: deposit = round(total x percent / 100).
        const down = settings.downPaymentKind === 'PERCENT'
          ? Math.round((total * DEPOSIT_PERCENT) / 100)
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
    input: { option: 'FULL' | 'DOWN'; referenceNo: string; proofStoragePath: string },
  ): Promise<PaymentTransaction> {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenError('Only customers can submit online payments')
    return withAppointmentLock(appointmentId, async () => {
      // Independent reads run in parallel; the guards below throw in the
      // same order as before (missing appointment, then visibility, then
      // the pending guard, then the option guard).
      const [appointment, paymentRows, settings] = await Promise.all([
        db.orm.public.Appointment.where({ id: appointmentId }).first(),
        db.orm.public.Payment.where({ appointmentId }).all(),
        // Money path: live settings, never the display cache.
        this.getSettings(),
      ])
      if (!appointment) throw new NotFoundError('Appointment not found')
      await this.assertCanViewAppointment(appointment, actor)

      const pending = paymentRows
        .find((row) => String(row.channel) === 'ONLINE' && String(row.status) === 'UNVERIFIED')
      if (pending) throw new ConflictError('An online payment for this appointment is already awaiting verification')

      // Same quote math as the display endpoint, computed from the rows and
      // live settings already fetched. The created row is UNVERIFIED, so it
      // never counts toward the settled total and the pre-insert value stays
      // exact for the returned transaction.
      const settledCents = settledCentsFromRows(paymentRows)
      const quote = this.quoteFrom(appointmentId, appointment, settledCents, settings)
      const option = quote.options.find((entry) => entry.key === input.option)
      if (!option) throw new BadRequestError('That payment option is not available for this appointment')
      const amount = option.amount

      // Only the object path is stored — never a public URL. `proof_url` holds
      // the same path value so the live `online_payment_requires_proof` check
      // (reference AND proof present for ONLINE rows) keeps holding without a
      // schema change; it is not a URL.
      let created: Record<string, unknown>
      try {
        created = await db.orm.public.Payment.create({
          appointmentId,
          amount: pgNumeric(amount.toFixed(2)),
          paymentMethod: 'GCASH',
          channel: 'ONLINE',
          status: 'UNVERIFIED',
          referenceNo: pgVarchar<100>(normalizeReference(input.referenceNo)),
          proofUrl: pgVarchar<500>(input.proofStoragePath),
          proofStoragePath: pgVarchar<500>(input.proofStoragePath),
          recordedBy: actor.userId,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('That payment reference has already been used.')
        }
        throw error
      }
      await generateAuditLog({
        actorAccountId: actor.userId,
        action: 'SUBMIT_ONLINE_PAYMENT',
        entityType: 'Payment',
        entityId: String(created.id),
        newData: { appointmentId, amount, option: input.option },
      })
      return this.rowToTransaction(created, appointment, settledCents)
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

      const outstanding = fromCents(Math.max(0, cents(appointment.totalAmount) - await this.settledCentsFor(input.appointmentId)))
      if (amount > outstanding) {
        throw new ConflictError('The amount exceeds the outstanding balance')
      }
      // Money received in person is accepted immediately: recorded = verified.
      let created: Record<string, unknown>
      try {
        created = await db.orm.public.Payment.create({
          appointmentId: input.appointmentId,
          amount: pgNumeric(amount.toFixed(2)),
          paymentMethod: input.method,
          channel: 'IN_PERSON',
          status: 'VERIFIED',
          referenceNo: input.referenceNo ? pgVarchar<100>(normalizeReference(input.referenceNo)) : null,
          recordedBy: actor.userId,
          verifiedBy: actor.userId,
          // Temporal codec: timestamptz columns take Temporal.Instant, not Date.
          verifiedAt: toTemporalInstant(new Date()),
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('That payment reference has already been used.')
        }
        throw error
      }
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
      // Temporal codec: timestamptz columns take Temporal.Instant, not Date.
      verifiedAt: toTemporalInstant(new Date()),
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
    if (rows.length === 0) return { payments: [] }

    // STAFF see only their own appointments; one staff lookup for the whole
    // list instead of one per payment row.
    let staffId: string | null = null
    if (actor.role === 'STAFF') {
      const staff = await db.orm.public.Staff.where({ accountId: actor.userId }).first()
      if (!staff) return { payments: [] }
      staffId = String(staff.id)
    }

    // Batched reads: one IN query per related table instead of 6-7 queries
    // per payment row. Each batch fetches exactly the rows the response
    // needs (the ids collected from the visible rows).
    const appointmentIds = [...new Set(rows.map((row) => String(row.appointmentId)))]
    const appointments = await this.batchWhereIn(db.orm.public.Appointment, 'id', appointmentIds)
    const appointmentById = new Map(appointments.map((appointment) => [String(appointment.id), appointment]))

    const kept: Array<{ row: Record<string, unknown>; appointment: Record<string, unknown> }> = []
    for (const row of rows) {
      const appointment = appointmentById.get(String(row.appointmentId))
      if (!appointment) continue
      if (actor.role === 'STAFF' && String(appointment.staffId ?? '') !== staffId) continue
      kept.push({ row, appointment })
    }

    const customerIds = [...new Set(kept.map(({ appointment }) => String(appointment.customerId)))]
    const keptAppointmentIds = [...new Set(kept.map(({ appointment }) => String(appointment.id)))]
    const [customers, serviceRows] = await Promise.all([
      this.batchWhereIn(db.orm.public.Customer, 'id', customerIds),
      this.batchWhereIn(db.orm.public.AppointmentService, 'appointmentId', keptAppointmentIds),
    ])
    const accountIds = [...new Set(customers.map((customer) => String(customer.accountId)))]
    const accounts = await this.batchWhereIn(db.orm.public.Account, 'id', accountIds)
    const customerById = new Map(customers.map((customer) => [String(customer.id), customer]))
    const accountById = new Map(accounts.map((account) => [String(account.id), account]))
    const serviceNamesByAppointment = new Map<string, string[]>()
    for (const service of serviceRows) {
      const key = String(service.appointmentId)
      const names = serviceNamesByAppointment.get(key) ?? []
      names.push(String(service.serviceName))
      serviceNamesByAppointment.set(key, names)
    }

    // rows is every payment row, so summing it per appointment reproduces
    // settledCentsFor exactly — zero extra reads.
    const settledByAppointment = settledCentsByAppointment(rows)

    const payments: PaymentTransaction[] = []
    for (const { row, appointment } of kept) {
      const customer = customerById.get(String(appointment.customerId)) ?? null
      payments.push(this.buildTransaction(row, appointment, {
        customer,
        account: customer ? accountById.get(String(customer.accountId)) ?? null : null,
        serviceNames: serviceNamesByAppointment.get(String(appointment.id)) ?? [],
        settledCents: settledByAppointment.get(String(row.appointmentId)) ?? 0,
      }))
    }
    return { payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  /** GET /payments/mine — CUSTOMER: their own transactions only. */
  static async listMine(userId: string): Promise<{ payments: PaymentTransaction[] }> {
    const customer = await db.orm.public.Customer.where({ accountId: userId }).first()
    if (!customer) throw new NotFoundError('No customer profile found for this account')
    const rows = await db.orm.public.Payment.all()
    if (rows.length === 0) return { payments: [] }

    // Batched reads: one IN query per related table instead of 6-7 queries
    // per payment row. Visibility keeps the old rule — the appointment must
    // belong to this customer — applied to the batched appointment rows.
    const appointmentIds = [...new Set(rows.map((row) => String(row.appointmentId)))]
    const appointments = await this.batchWhereIn(db.orm.public.Appointment, 'id', appointmentIds)
    const appointmentById = new Map(appointments.map((appointment) => [String(appointment.id), appointment]))

    const kept: Array<{ row: Record<string, unknown>; appointment: Record<string, unknown> }> = []
    for (const row of rows) {
      const appointment = appointmentById.get(String(row.appointmentId))
      if (!appointment || String(appointment.customerId) !== String(customer.id)) continue
      kept.push({ row, appointment })
    }
    if (kept.length === 0) return { payments: [] }

    const [account, serviceRows] = await Promise.all([
      db.orm.public.Account.where({ id: String(customer.accountId) }).first(),
      this.batchWhereIn(
        db.orm.public.AppointmentService,
        'appointmentId',
        [...new Set(kept.map(({ appointment }) => String(appointment.id)))],
      ),
    ])
    const serviceNamesByAppointment = new Map<string, string[]>()
    for (const service of serviceRows) {
      const key = String(service.appointmentId)
      const names = serviceNamesByAppointment.get(key) ?? []
      names.push(String(service.serviceName))
      serviceNamesByAppointment.set(key, names)
    }

    // rows is every payment row, so summing it per appointment reproduces
    // settledCentsFor exactly — zero extra reads.
    const settledByAppointment = settledCentsByAppointment(rows)

    const payments: PaymentTransaction[] = []
    for (const { row, appointment } of kept) {
      // Every kept appointment belongs to this customer (the filter above),
      // so the per-row customer lookup collapses to the row already fetched.
      payments.push(this.buildTransaction(row, appointment, {
        customer,
        account: account ?? null,
        serviceNames: serviceNamesByAppointment.get(String(appointment.id)) ?? [],
        settledCents: settledByAppointment.get(String(row.appointmentId)) ?? 0,
      }))
    }
    return { payments: payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  /** GET /payments/activity — recent payment audit entries. */
  static async activity(): Promise<{ activities: Array<{ id: string; message: string; createdAt: string }> }> {
    const actions = ['SUBMIT_ONLINE_PAYMENT', 'RECORD_IN_PERSON_PAYMENT', 'VERIFY_PAYMENT', 'REJECT_PAYMENT', 'UPDATE_PAYMENT_SETTINGS']
    // Filtered, ordered and capped in the database: only the 50 rows the
    // response shows cross the network instead of the whole audit table
    // (295+ rows and growing). Same entries and order as the old in-memory
    // filter → sort → slice(50).
    type AuditQuery = {
      where: (filter: (m: Record<string, unknown>) => unknown) => {
        orderBy: (order: (r: Record<string, unknown>) => unknown) => {
          limit: (count: number) => { all: () => Promise<Array<Record<string, unknown>>> }
        }
      }
    }
    const rows = await (db.orm.public.AuditLog as unknown as AuditQuery)
      .where((m) => (m['action'] as unknown as { in: (values: readonly string[]) => unknown }).in(actions))
      .orderBy((r) => (r['createdAt'] as unknown as { desc: () => unknown }).desc())
      .limit(50)
      .all()
    const activities = rows.map((row) => ({
      id: String(row.id),
      message: `${String(row.action).replace(/_/g, ' ').toLowerCase()} · ${String(row.entityType)} ${String(row.entityId).slice(0, 8)}`,
      createdAt: new Date(String(row.createdAt)).toISOString(),
    }))
    return { activities }
  }

  /**
   * Short-lived signed read URL for one payment proof. The owning customer,
   * MANAGER and ADMIN only (STAFF excluded), after the server-side role check.
   */
  static async proofSignedUrl(paymentId: string, actor: { userId: string; role: string }): Promise<string> {
    const row = await db.orm.public.Payment.where({ id: paymentId }).first()
    if (!row) throw new NotFoundError('Payment not found')
    const appointment = await db.orm.public.Appointment.where({ id: String(row.appointmentId) }).first()
    if (!appointment) throw new NotFoundError('Appointment not found')
    if (actor.role === 'STAFF') throw new ForbiddenError('Payment proofs are not available to staff accounts')
    await this.assertCanViewAppointment(appointment, actor)
    const path = String(row.proofStoragePath ?? row.proofUrl ?? '')
    if (!path) throw new NotFoundError('No proof is stored for this payment')
    return storage.signedProofUrl(path)
  }

  // ---- internals ---------------------------------------------------------

  /**
   * Batched lookup: one `IN` query for N ids instead of N single-row reads.
   * The ORM exposes list membership only through the function-form filter
   * (`m.field.in([...])`), so the narrow structural cast lives here; the
   * form is runtime-verified against the real database.
   */
  private static async batchWhereIn(
    table: unknown,
    field: string,
    ids: readonly string[],
  ): Promise<Array<Record<string, unknown>>> {
    if (ids.length === 0) return []
    type Whereable = {
      where: (filter: (m: Record<string, unknown>) => unknown) => { all: () => Promise<Array<Record<string, unknown>>> }
    }
    return (table as Whereable)
      .where((m) => (m[field] as unknown as { in: (values: readonly string[]) => unknown }).in(ids))
      .all()
  }

  /**
   * Money counted as received: VERIFIED (human-confirmed in-person/manual
   * rows) and PAID (Maya provider-confirmed rows). The balance rule is
   * total − settled.
   */
  static async settledCentsFor(appointmentId: string): Promise<number> {
    const rows = await db.orm.public.Payment.where({ appointmentId }).all()
    return rows
      .filter((row) => String(row.status) === 'VERIFIED' || String(row.status) === 'PAID')
      .reduce((sum, row) => sum + cents(row.amount), 0)
  }

  static async assertCanViewAppointment(
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

  private static async rowToTransaction(
    row: Record<string, unknown>,
    appointment: Record<string, unknown>,
    settledCents?: number,
  ): Promise<PaymentTransaction> {
    // Independent reads run in parallel (the account lookup depends on the
    // customer row). The settled total is computed ONCE — the old shape
    // queried it twice per row, once for verifiedTotal and once for
    // outstanding. A caller that already holds a current settled total
    // (from rows it just fetched) passes it in and no re-read happens;
    // callers whose own insert is counted (in-person VERIFIED rows) leave
    // it undefined and get a live post-insert read, as before.
    const [customer, services, settled] = await Promise.all([
      db.orm.public.Customer.where({ id: String(appointment.customerId) }).first(),
      db.orm.public.AppointmentService.where({ appointmentId: String(appointment.id) }).all(),
      settledCents === undefined ? this.settledCentsFor(String(row.appointmentId)) : Promise.resolve(settledCents),
    ])
    const account = customer ? await db.orm.public.Account.where({ id: String(customer.accountId) }).first() : null
    return this.buildTransaction(row, appointment, {
      customer,
      account,
      serviceNames: services.map((service) => String(service.serviceName)),
      settledCents: settled,
    })
  }

  /** Pure row -> view mapping shared by the single-row and list paths. */
  private static buildTransaction(
    row: Record<string, unknown>,
    appointment: Record<string, unknown>,
    ctx: {
      customer: Record<string, unknown> | null
      account: Record<string, unknown> | null
      serviceNames: string[]
      settledCents: number
    },
  ): PaymentTransaction {
    const { customer, account, serviceNames, settledCents } = ctx
    return {
      id: String(row.id),
      appointmentId: String(row.appointmentId),
      appointmentCode: String(appointment.appointmentCode),
      customerName: customer ? `${String(customer.firstName)} ${String(customer.lastName)}`.trim() : 'Customer',
      customerEmail: account ? String(account.email) : '',
      serviceName: serviceNames.join(', ') || 'Salon appointment',
      amount: fromCents(cents(row.amount)),
      paymentMethod: String(row.paymentMethod) as PaymentMethodValue,
      channel: String(row.channel) as PaymentChannelValue,
      status: String(row.status) as PaymentTransaction['status'],
      referenceNo: row.referenceNo ? String(row.referenceNo) : null,
      provider: String(row.provider ?? 'MANUAL'),
      providerCheckoutId: row.providerCheckoutId ? String(row.providerCheckoutId) : null,
      providerPaymentId: row.providerPaymentId ? String(row.providerPaymentId) : null,
      plan: String(row.provider ?? 'MANUAL') === 'MAYA'
        ? (cents(row.amount) < cents(appointment.totalAmount) ? 'DOWN' : 'FULL')
        : null,
      hasProof: Boolean(row.proofStoragePath ?? row.proofUrl),
      bookingStatus: String(appointment.status),
      recordedBy: row.recordedBy ? String(row.recordedBy) : null,
      verifiedBy: row.verifiedBy ? String(row.verifiedBy) : null,
      verifiedAt: row.verifiedAt ? new Date(String(row.verifiedAt)).toISOString() : null,
      createdAt: new Date(String(row.createdAt)).toISOString(),
      holdSecondsRemaining: (() => {
        const hold = appointment.holdExpiresAt ? new Date(String(appointment.holdExpiresAt)) : null
        if (!hold || String(appointment.status) !== 'RESERVED') return null
        return Math.max(0, Math.ceil((hold.getTime() - Date.now()) / 1000))
      })(),
      appointmentTotal: fromCents(cents(appointment.totalAmount)),
      verifiedTotal: fromCents(settledCents),
      outstanding: fromCents(Math.max(0, cents(appointment.totalAmount) - settledCents)),
    }
  }
}
