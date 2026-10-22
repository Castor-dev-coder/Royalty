import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { ServiceService } from './service.service.js';

const serviceOne = '00000000-0000-4000-8000-000000000001';
const serviceTwo = '00000000-0000-4000-8000-000000000002';

function mockServiceLookups(context: { after: (fn: () => void) => void }, options: {
  staffByAccountId: Record<string, { id: string } | null>;
  assignmentsByStaffId: Record<string, Array<{ serviceId: string }>>;
}) {
  const staffWhere = mock.method(db.orm.public.Staff, 'where', (filter: { accountId?: string; id?: string }) => ({
    first: async () => {
      if (filter.accountId !== undefined) return options.staffByAccountId[filter.accountId] ?? null;
      return null;
    },
  }));
  const assignmentsWhere = mock.method(db.orm.public.StaffService, 'where', (filter: { staffId: string }) => ({
    all: async () => options.assignmentsByStaffId[filter.staffId] ?? [],
  }));
  const serviceWhere = mock.method(db.orm.public.Service, 'where', (filter: { id: string }) => ({
    first: async () => (filter.id === serviceOne
      ? { id: serviceOne, categoryId: 'category', name: 'Cut', description: null, price: 800, durationMinutes: 60, isActive: true }
      : { id: serviceTwo, categoryId: 'category', name: 'Color', description: null, price: 2400, durationMinutes: 150, isActive: true }),
  }));
  const categoryWhere = mock.method(db.orm.public.ServiceCategory, 'where', () => ({
    first: async () => ({ name: 'Hair' }),
  }));

  context.after(() => {
    staffWhere.mock.restore();
    assignmentsWhere.mock.restore();
    serviceWhere.mock.restore();
    categoryWhere.mock.restore();
  });
}

test('own service assignments resolve the staff row through the account link', async (context) => {
  mockServiceLookups(context, {
    staffByAccountId: { 'account-id': { id: 'staff-row-id' } },
    assignmentsByStaffId: { 'staff-row-id': [{ serviceId: serviceOne }, { serviceId: serviceTwo }] },
  });

  const services = await ServiceService.getServicesForOwnStaff('account-id');

  assert.deepEqual(services.map((service) => service.name), ['Cut', 'Color']);
  assert.equal(services[0].categoryName, 'Hair');
});

test('own service assignments are empty for a staff member without assignments', async (context) => {
  mockServiceLookups(context, {
    staffByAccountId: { 'account-id': { id: 'staff-row-id' } },
    assignmentsByStaffId: {},
  });

  const services = await ServiceService.getServicesForOwnStaff('account-id');

  assert.deepEqual(services, []);
});

test('own service assignments are not found for an account without a staff profile', async (context) => {
  mockServiceLookups(context, {
    staffByAccountId: { 'account-id': null },
    assignmentsByStaffId: {},
  });

  await assert.rejects(
    () => ServiceService.getServicesForOwnStaff('account-id'),
    /No staff profile found for this account/
  );
});
