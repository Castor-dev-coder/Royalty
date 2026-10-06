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

function isTestEmail(email: string): boolean {
  return email.endsWith(TEST_EMAIL_DOMAIN);
}

function isTestAppointmentCode(code: string): boolean {
  return code.startsWith(TEST_APPOINTMENT_CODE_PREFIX);
}

function isTestServiceName(name: string): boolean {
  return name.startsWith(TEST_SERVICE_NAME_PREFIX);
}

function isTestCategoryName(name: string): boolean {
  return name.startsWith(TEST_CATEGORY_NAME_PREFIX);
}

export async function cleanupTestRecords(): Promise<CleanupResult> {
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
    .filter((a) => isTestEmail(a.email))
    .map((a) => a.id);

  if (testAccountIds.length === 0) {
    return result;
  }

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
    .filter((c) => isTestCategoryName(c.name))
    .map((c) => c.id);

  const testServices = await db.orm.public.Service.where({}).all();
  const testServiceIds = testServices
    .filter((s) => isTestServiceName(s.name))
    .map((s) => s.id);

  // Step 4: Find test appointments
  const testAppointments = await db.orm.public.Appointment.where({}).all();
  const testAppointmentIds = testAppointments
    .filter((a) => isTestAppointmentCode(a.appointmentCode))
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
  if (testStaffIds.length > 0 || testAccountIds.length > 0) {
    const requests = await db.orm.public.ScheduleRequest.where({}).all();
    const toDelete = requests.filter(
      (sr) => testStaffIds.includes(sr.staffId) || testAccountIds.includes(sr.reviewedBy ?? ''),
    );
    for (const sr of toDelete) {
      await db.orm.public.ScheduleRequest.where({ id: sr.id }).delete();
      result.scheduleRequests++;
    }
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
