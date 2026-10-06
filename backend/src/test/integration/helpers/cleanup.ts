import { db } from '../../../prisma/db.js';

export const TEST_EMAIL_DOMAIN = '@test.royalty.local';
export const TEST_APPOINTMENT_CODE_PREFIX = 'APT-TEST-';
export const TEST_SERVICE_NAME_PREFIX = '[TEST]';
export const TEST_CATEGORY_NAME_PREFIX = '[TEST]';

export interface CleanupResult {
  appointmentServices: number;
  payments: number;
  reviews: number;
  scheduleRequests: number;
  staffSchedules: number;
  staffServices: number;
  appointments: number;
  services: number;
  serviceCategories: number;
  customers: number;
  staff: number;
  auditLogs: number;
  accounts: number;
}

/**
 * Exact scope-marker format (Batch 5F onward)
 * ------------------------------------------
 * `[TEST:<batch>:<scope>:<run>]`, e.g. `[TEST:5f:reviews:c18e04ab]`.
 *
 * A marker is matched by exact substring, never by a normalized/partial token,
 * so cleanup for one run can never reach another run of the same file:
 *   cleanup('[TEST:5f:reviews:c18e04ab]') must NOT match
 *   '[TEST:5f:reviews:91a4d2e7]'.
 *
 * Distinct from the looser Batch 5A-5E tokens ('batch5d'), which are still
 * accepted for those files' existing fixtures.
 *
 * Three identifier forms embed the same unique run id, because different record
 * types cannot carry the full bracketed marker:
 *   - `reason` / free text      -> full marker  `[TEST:5f:reviews:c18e04ab]`
 *   - account email local part  -> emailToken   `reviews-c18e04ab`
 *   - appointment code          -> codeToken    `REV-c18e04ab`
 * All three are checked, so cleanup reaches every record the run created while
 * remaining scoped to exactly this run.
 */
export interface ScopeMarker {
  /** Exact marker text, e.g. '[TEST:5f:reviews:c18e04ab]'. */
  marker: string;
  /** Cryptographically secure 8-char lowercase hex run id. */
  run: string;
  /** Human-readable label, e.g. 'reviews'. */
  scope: string;
  /** Short uppercase token for appointment codes, e.g. 'REV'. */
  shortScope: string;
  /** Email local-part token, e.g. 'reviews-c18e04ab'. */
  emailToken: string;
  /** Appointment-code token, e.g. 'REV-c18e04ab'. */
  codeToken: string;
}

/** Returns true when `identifier` contains the exact marker (case-sensitive). */
function containsMarker(identifier: string | null | undefined, marker: string): boolean {
  return typeof identifier === 'string' && identifier.includes(marker);
}

/** Every token that identifies a record as belonging to this run. */
function markerTokens(scope: ScopeMarker): string[] {
  return [scope.marker, scope.emailToken, scope.codeToken];
}

/** True when a free-text/identifier field carries any token for this run. */
function ownedByMarker(value: string | null | undefined, scope: ScopeMarker): boolean {
  return markerTokens(scope).some((token) => containsMarker(value, token));
}

/**
 * Reports remaining records still owned by `scope`, without deleting anything.
 * Callers use it to prove "Remaining: 0 / Orphans: 0" after cleanup.
 */
export interface ScopeRemainder {
  accounts: number;
  customers: number;
  staff: number;
  services: number;
  serviceCategories: number;
  appointments: number;
  reviews: number;
  scheduleRequests: number;
}

export async function countScopedRecords(scope: string | ScopeMarker): Promise<ScopeRemainder> {
  const isMarker = typeof scope !== 'string';
  const normalizedScope = normalizeIdentifier(typeof scope === 'string' ? scope : scope.marker);
  const owned = (value: string | null | undefined): boolean =>
    isMarker ? ownedByMarker(value, scope) : isOwnedBy(value ?? '', normalizedScope);

  const accounts = (await db.orm.public.Account.where({}).all()).filter((a) => owned(a.email));
  const accountIds = accounts.map((a) => a.id);

  const customers = (await db.orm.public.Customer.where({}).all()).filter((c) => accountIds.includes(c.accountId));
  const staff = (await db.orm.public.Staff.where({}).all()).filter((s) => accountIds.includes(s.accountId));
  const customerIds = customers.map((c) => c.id);
  const staffIds = staff.map((s) => s.id);

  const serviceCategories = (await db.orm.public.ServiceCategory.where({}).all()).filter((c) => owned(c.name));
  const services = (await db.orm.public.Service.where({}).all()).filter((s) => owned(s.name));
  const appointments = (await db.orm.public.Appointment.where({}).all()).filter(
    (a) => owned(a.appointmentCode) || customerIds.includes(a.customerId),
  );
  const appointmentIds = appointments.map((a) => a.id);

  const reviews = (await db.orm.public.Review.where({}).all()).filter(
    (r) => appointmentIds.includes(r.appointmentId) || customerIds.includes(r.customerId),
  );
  const scheduleRequests = (await db.orm.public.ScheduleRequest.where({}).all()).filter(
    (sr) => owned(sr.reason) || staffIds.includes(sr.staffId) || accountIds.includes(sr.reviewedBy ?? ''),
  );

  return {
    accounts: accounts.length,
    customers: customers.length,
    staff: staff.length,
    services: services.length,
    serviceCategories: serviceCategories.length,
    appointments: appointments.length,
    reviews: reviews.length,
    scheduleRequests: scheduleRequests.length,
  };
}

/**
 * Ownership model
 * ---------------
 * The Node test runner executes integration test FILES in parallel child
 * processes, so a shared cleanup helper must never treat another file's active
 * fixtures as its own. A previous version matched every `@test.royalty.local`
 * account, which let one file delete another file's test customer mid-run.
 *
 * Every caller therefore passes an explicit scope token (e.g. 'batch5d') and
 * cleanup only ever touches records carrying that token. Passing a scope is
 * mandatory, so no caller can accidentally request a broad, cross-file sweep.
 *
 * Matching normalizes the identifier — lowercased, non-alphanumerics stripped —
 * so one rule covers emails, names and appointment codes:
 *   'test-customer-batch5d@test.royalty.local' -> contains 'batch5d'
 *   '[TEST] Batch 5E Category'                 -> contains 'batch5e'
 *   'APT-TEST-BATCH5D-1A2B3C4D'                -> contains 'batch5d'
 */
function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isOwnedBy(identifier: string, normalizedScope: string): boolean {
  return normalizeIdentifier(identifier).includes(normalizedScope);
}

export async function cleanupTestRecords(scope: string | ScopeMarker): Promise<CleanupResult> {
  const isMarker = typeof scope !== 'string';
  const normalizedScope = normalizeIdentifier(typeof scope === 'string' ? scope : scope.marker);
  if (normalizedScope.length < 4) {
    throw new Error(
      `cleanupTestRecords requires an explicit scope token of at least 4 characters (received: ${normalizedScope})`,
    );
  }

  // Marker scopes match the exact run tokens; legacy Batch 5A-5E tokens match by
  // normalized containment. A marker scope must never fall back to the broad
  // normalized rule, or one run could delete another run of the same file.
  const owned = (value: string | null | undefined): boolean =>
    isMarker ? ownedByMarker(value, scope) : isOwnedBy(value ?? '', normalizedScope);

  const result: CleanupResult = {
    appointmentServices: 0,
    payments: 0,
    reviews: 0,
    scheduleRequests: 0,
    staffSchedules: 0,
    staffServices: 0,
    appointments: 0,
    services: 0,
    serviceCategories: 0,
    customers: 0,
    staff: 0,
    auditLogs: 0,
    accounts: 0,
  };

  // Step 1: Find test accounts
  const testAccounts = await db.orm.public.Account.where({}).all();
  const testAccountIds = testAccounts
    .filter((a) => owned(a.email))
    .map((a) => a.id);

  // No early return here: a file may own services/categories without owning any
  // account (Batch 5E uses the seed accounts), so those must still be collected.

  // Step 2: Find test customers and staff
  const testCustomers = await db.orm.public.Customer.where({}).all();
  const testCustomerIds = testCustomers
    .filter((c) => testAccountIds.includes(c.accountId))
    .map((c) => c.id);

  const testStaff = await db.orm.public.Staff.where({}).all();
  const testStaffIds = testStaff
    .filter((s) => testAccountIds.includes(s.accountId))
    .map((s) => s.id);

  // Step 3: Find test services and categories
  const testCategories = await db.orm.public.ServiceCategory.where({}).all();
  const testCategoryIds = testCategories
    .filter((c) => owned(c.name))
    .map((c) => c.id);

  const testServices = await db.orm.public.Service.where({}).all();
  const testServiceIds = testServices
    .filter((s) => owned(s.name))
    .map((s) => s.id);

  // Step 4: Find test appointments (by code prefix OR by test customer ownership)
  const testAppointments = await db.orm.public.Appointment.where({}).all();
  const testAppointmentIds = testAppointments
    .filter((a) => owned(a.appointmentCode) || testCustomerIds.includes(a.customerId))
    .map((a) => a.id);

  // Step 5: Delete in dependency order (children first)

  // 5a. appointment_services (depends on appointments, services)
  if (testAppointmentIds.length > 0 || testServiceIds.length > 0) {
    const appointmentServices = await db.orm.public.AppointmentService.where({}).all();
    const toDelete = appointmentServices.filter(
      (as) => testAppointmentIds.includes(as.appointmentId) || testServiceIds.includes(as.serviceId),
    );
    for (const as of toDelete) {
      await db.orm.public.AppointmentService.where({ id: as.id }).delete();
      result.appointmentServices++;
    }
  }

  // 5b. payments (depends on appointments)
  if (testAppointmentIds.length > 0) {
    const payments = await db.orm.public.Payment.where({}).all();
    const toDelete = payments.filter((p) => testAppointmentIds.includes(p.appointmentId));
    for (const p of toDelete) {
      await db.orm.public.Payment.where({ id: p.id }).delete();
      result.payments++;
    }
  }

  // 5c. reviews (depends on appointments, customers)
  if (testAppointmentIds.length > 0 || testCustomerIds.length > 0) {
    const reviews = await db.orm.public.Review.where({}).all();
    const toDelete = reviews.filter(
      (r) => testAppointmentIds.includes(r.appointmentId) || testCustomerIds.includes(r.customerId),
    );
    for (const r of toDelete) {
      await db.orm.public.Review.where({ id: r.id }).delete();
      result.reviews++;
    }
  }

  // 5d. schedule_requests (depends on staff, accounts)
  // Matched by the exact scope marker in `reason` OR by scope-owned staff/account,
  // so Batch 5F requests created with the seeded STAFF account are still removed.
  const requests = await db.orm.public.ScheduleRequest.where({}).all();
  const toDeleteRequests = requests.filter(
    (sr) => owned(sr.reason) || testStaffIds.includes(sr.staffId) || testAccountIds.includes(sr.reviewedBy ?? ''),
  );
  for (const sr of toDeleteRequests) {
    await db.orm.public.ScheduleRequest.where({ id: sr.id }).delete();
    result.scheduleRequests++;
  }

  // 5e. staff_schedules (depends on staff)
  if (testStaffIds.length > 0) {
    const schedules = await db.orm.public.StaffSchedule.where({}).all();
    const toDelete = schedules.filter((ss) => testStaffIds.includes(ss.staffId));
    for (const ss of toDelete) {
      await db.orm.public.StaffSchedule.where({ id: ss.id }).delete();
      result.staffSchedules++;
    }
  }

  // 5f. staff_services (depends on services, staff) — composite PK (staff_id, service_id)
  if (testServiceIds.length > 0 || testStaffIds.length > 0) {
    const assignments = await db.orm.public.StaffService.where({}).all();
    const toDelete = assignments.filter(
      (ss) => testServiceIds.includes(ss.serviceId) || testStaffIds.includes(ss.staffId),
    );
    for (const ss of toDelete) {
      await db.orm.public.StaffService.where({ staffId: ss.staffId, serviceId: ss.serviceId }).delete();
      result.staffServices++;
    }
  }

  // 5g. appointments (depends on customers, staff)
  if (testAppointmentIds.length > 0) {
    for (const id of testAppointmentIds) {
      await db.orm.public.Appointment.where({ id }).delete();
      result.appointments++;
    }
  }

  // 5h. services (depends on service_categories)
  if (testServiceIds.length > 0) {
    for (const id of testServiceIds) {
      await db.orm.public.Service.where({ id }).delete();
      result.services++;
    }
  }

  // 5i. service_categories (no FKs)
  if (testCategoryIds.length > 0) {
    for (const id of testCategoryIds) {
      await db.orm.public.ServiceCategory.where({ id }).delete();
      result.serviceCategories++;
    }
  }

  // 5j. customers (depends on accounts)
  if (testCustomerIds.length > 0) {
    for (const id of testCustomerIds) {
      await db.orm.public.Customer.where({ id }).delete();
      result.customers++;
    }
  }

  // 5k. staff (depends on accounts)
  if (testStaffIds.length > 0) {
    for (const id of testStaffIds) {
      await db.orm.public.Staff.where({ id }).delete();
      result.staff++;
    }
  }

  // 5l. audit_logs (depends on accounts)
  const auditLogs = await db.orm.public.AuditLog.where({}).all();
  const testAuditLogs = auditLogs.filter((al) => testAccountIds.includes(al.actorAccountId ?? ''));
  for (const al of testAuditLogs) {
    await db.orm.public.AuditLog.where({ id: al.id }).delete();
    result.auditLogs++;
  }

  // 5m. accounts (no FKs, delete last)
  for (const id of testAccountIds) {
    await db.orm.public.Account.where({ id }).delete();
    result.accounts++;
  }

  return result;
}
