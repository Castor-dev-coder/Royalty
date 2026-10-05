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