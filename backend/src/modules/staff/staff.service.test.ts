import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { StaffService } from './staff.service.js';

const serviceOne = '00000000-0000-4000-8000-000000000001';
const serviceTwo = '00000000-0000-4000-8000-000000000002';

test('staff discovery returns only ON_DUTY staff assigned to every active service', async (context) => {
  const staffRows = [
    { id: 'staff-eligible', firstName: 'Alex', lastName: 'A', primaryRole: 'Stylist', workStatus: 'ON_DUTY' },
    { id: 'staff-off-duty', firstName: 'Blair', lastName: 'B', primaryRole: 'Nail Tech', workStatus: 'DAY_OFF' },
  ];
  const services = new Map([
    [serviceOne, { id: serviceOne, categoryId: 'category', name: 'Cut', isActive: true }],
    [serviceTwo, { id: serviceTwo, categoryId: 'category', name: 'Color', isActive: true }],
  ]);
  const serviceAssignments = new Map([
    [serviceOne, ['staff-eligible', 'staff-off-duty', 'staff-partial']],
    [serviceTwo, ['staff-eligible', 'staff-off-duty']],
  ]);
  const serviceWhere = mock.method(db.orm.public.Service, 'where', (filter: { id: string }) => ({
    first: async () => services.get(filter.id) ?? null,
  }));
  const categoryWhere = mock.method(db.orm.public.ServiceCategory, 'where', () => ({
    first: async () => ({ isActive: true }),
  }));
  const assignmentsWhere = mock.method(db.orm.public.StaffService, 'where', (filter: { serviceId: string }) => ({
    all: async () => (serviceAssignments.get(filter.serviceId) ?? []).map((staffId) => ({ staffId })),
  }));
  const staffWhere = mock.method(db.orm.public.Staff, 'where', (filter: { id: string }) => ({
    first: async () => staffRows.find((staff) => staff.id === filter.id) ?? null,
  }));

  context.after(() => {
    serviceWhere.mock.restore();
    categoryWhere.mock.restore();
    assignmentsWhere.mock.restore();
    staffWhere.mock.restore();
  });

  const staff = await StaffService.listEligibleForServices([serviceOne, serviceTwo]);
  assert.deepEqual(staff, [{
    id: 'staff-eligible', firstName: 'Alex', lastName: 'A', primaryRole: 'Stylist',
  }]);
});

test('staff profile read compares the staff account link, not the staff row ID', async (context) => {
  const accountId = 'account-id';
  const staff = {
    id: 'staff-row-id', accountId, firstName: 'Riley', lastName: 'Staff', phone: null,
    primaryRole: 'Stylist', employmentType: 'FULL_TIME' as const, workStatus: 'ON_DUTY' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const staffWhere = mock.method(db.orm.public.Staff, 'where', () => ({ first: async () => staff }));
  context.after(() => staffWhere.mock.restore());

  // Own profile is readable even though staff.id differs from the account ID.
  const own = await StaffService.getById('staff-row-id', accountId, 'STAFF');
  assert.equal(own.id, 'staff-row-id');

  // Another staff member's profile stays forbidden.
  await assert.rejects(
    () => StaffService.getById('staff-row-id', 'other-account', 'STAFF'),
    /permission to view this staff member/
  );

  // Admins and managers may read any profile.
  await StaffService.getById('staff-row-id', 'other-account', 'ADMIN');
  await StaffService.getById('staff-row-id', 'other-account', 'MANAGER');
});

test('self profile update resolves and writes the staff row by authenticated account ID', async (context) => {
  const accountId = 'account-id';
  const staff = {
    id: 'staff-id', accountId, firstName: 'Riley', lastName: 'Staff', phone: '555-0100',
    primaryRole: 'Stylist', employmentType: 'FULL_TIME' as const, workStatus: 'ON_DUTY' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const whereFilters: Array<{ accountId?: string; id?: string }> = [];
  const staffWhere = mock.method(db.orm.public.Staff, 'where', (filter: { accountId?: string; id?: string }) => {
    whereFilters.push(filter);
    if (filter.accountId === accountId) return { first: async () => staff };
    return { update: async (data: { phone?: string }) => ({ ...staff, ...data }) };
  });
  const auditCreate = mock.method(db.orm.public.AuditLog, 'create', async () => ({} as never));
  context.after(() => {
    staffWhere.mock.restore();
    auditCreate.mock.restore();
  });

  const updated = await StaffService.updateOwnProfile(accountId, { phone: '555-0101' });
  assert.deepEqual(whereFilters, [{ accountId }, { id: staff.id }]);
  assert.equal(updated.id, staff.id);
  assert.equal(updated.phone, '555-0101');
});