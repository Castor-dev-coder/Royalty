// Service status persistence (§7): PATCH isActive suspends and re-activates a
// service without ever erasing its associations (appointment/payment/review
// links survive), the customer-facing listing only ever shows active services
// in active categories while ADMIN/MANAGER see everything, and booking a
// deactivated service is refused. Fake ORM: rule tests, not database tests.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://route-test:***@127.0.0.1:5/route-test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [{ db }, { ServiceService }, { NotFoundError }] = await Promise.all([
  import('../../prisma/db.js'),
  import('./service.service.js'),
  import('../../errors/index.js'),
]);

type Row = Record<string, unknown> & { id?: string };
const world: Record<string, Row[]> = {
  Account: [], Service: [], ServiceCategory: [], StaffService: [], Appointment: [],
  AppointmentService: [], Payment: [], Review: [], AuditLog: [],
};
let seq = 1;

function table(name: string) {
  const chainFor = (filter: Record<string, unknown>) => {
    const match = () => world[name].filter((row) => Object.entries(filter).every(([k, v]) => row[k] === v));
    const chain = {
      first: async () => match()[0] ?? null,
      all: async () => match(),
      update: async (patch: Record<string, unknown>) => {
        const row = match()[0];
        if (!row) return null;
        Object.assign(row, patch);
        return row;
      },
      delete: async () => {
        world[name] = world[name].filter((row) => !match().includes(row));
      },
      aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => match().length }),
      orderBy: () => chain,
      offset: () => chain,
      limit: () => chain,
    };
    return chain;
  };
  return {
    where: (filter: Record<string, unknown>) => chainFor(filter),
    orderBy: () => chainFor({}),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: String(data.id ?? `row-${seq++}`) } as Row;
      world[name].push(row);
      return row;
    },
    all: async () => world[name],
    aggregate: async (fn: (a: { count: () => number }) => { total: number }) => fn({ count: () => world[name].length }),
  };
}

(db as unknown as { orm: unknown }).orm = {
  public: {
    Account: table('Account'),
    Service: table('Service'),
    ServiceCategory: table('ServiceCategory'),
    StaffService: table('StaffService'),
    Appointment: table('Appointment'),
    AppointmentService: table('AppointmentService'),
    Payment: table('Payment'),
    Review: table('Review'),
    AuditLog: table('AuditLog'),
  },
};

const ADMIN_ID = 'account-admin-1';
const MANAGER_ID = 'account-manager-1';
const SVC = 'svc-1';
const SVC_INACTIVE = 'svc-2';
const SVC_HIDDEN_CATEGORY = 'svc-3';
const APT = 'apt-1';

function seedWorld(): void {
  world.Account = [
    { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE', isSystem: false },
    { id: MANAGER_ID, email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', isSystem: false },
  ];
  world.ServiceCategory = [
    { id: 'cat-1', name: 'Hair', isActive: true },
    { id: 'cat-2', name: 'Retired', isActive: false },
  ];
  world.Service = [
    { id: SVC, categoryId: 'cat-1', name: 'Haircut', description: null, price: 450, durationMinutes: 60, isActive: true },
    { id: SVC_INACTIVE, categoryId: 'cat-1', name: 'Old Promo', description: null, price: 100, durationMinutes: 30, isActive: false },
    { id: SVC_HIDDEN_CATEGORY, categoryId: 'cat-2', name: 'Archived Style', description: null, price: 100, durationMinutes: 30, isActive: true },
  ];
  world.StaffService = [{ id: 'ss-1', staffId: 'staff-1', serviceId: SVC }];
  world.Appointment = [{ id: APT, appointmentCode: 'APT-00001', customerId: 'cust-1', staffId: 'staff-1', status: 'COMPLETED' }];
  world.AppointmentService = [{ id: 'as-1', appointmentId: APT, serviceId: SVC, serviceName: 'Haircut', price: 450, durationMinutes: 60 }];
  world.Payment = [{ id: 'pay-1', appointmentId: APT, amount: 450, status: 'VERIFIED' }];
  world.Review = [{ id: 'rev-1', appointmentId: APT, customerId: 'cust-1', rating: 5 }];
  world.AuditLog = [];
}

test('suspend persists isActive and erases no associations', async () => {
  seedWorld();
  const updated = await ServiceService.updateService(SVC, { isActive: false }, MANAGER_ID);
  assert.equal(updated.isActive, false);
  assert.equal(world.Service.find((row) => row.id === SVC)?.isActive, false);

  // Appointments, payments, reviews and staff links all survive deactivation.
  assert.equal(world.AppointmentService.filter((row) => row.serviceId === SVC).length, 1);
  assert.equal(world.AppointmentService[0].appointmentId, APT);
  assert.equal(world.Appointment.length, 1);
  assert.equal(world.Payment.length, 1);
  assert.equal(world.Payment[0].appointmentId, APT);
  assert.equal(world.Review.length, 1);
  assert.equal(world.Review[0].appointmentId, APT);
  assert.equal(world.StaffService.filter((row) => row.serviceId === SVC).length, 1);
});

test('the customer listing shows only active services in active categories', async () => {
  seedWorld();
  await ServiceService.updateService(SVC, { isActive: false }, ADMIN_ID);

  const customerView = await ServiceService.listServices('CUSTOMER');
  // Both the suspended service and the service in the inactive category are
  // hidden from customers; nothing is left visible in this fixture.
  assert.deepEqual(customerView.map((service) => service.id), []);
  assert.equal(customerView.some((service) => service.id === SVC_INACTIVE), false);
  assert.equal(customerView.some((service) => service.id === SVC_HIDDEN_CATEGORY), false);

  const adminView = await ServiceService.listServices('ADMIN');
  assert.equal(adminView.length, 3);
  const managerView = await ServiceService.listServices('MANAGER');
  assert.equal(managerView.length, 3);
});

test('the customer listing still shows other active services alongside hidden ones', async () => {
  seedWorld();
  const customerView = await ServiceService.listServices('CUSTOMER');
  assert.deepEqual(customerView.map((service) => service.id), [SVC]);
  assert.equal(customerView[0].isActive, true);
});

test('a deactivated service 404s for customers but stays visible to admins', async () => {
  seedWorld();
  await assert.rejects(
    () => ServiceService.getServiceById(SVC_INACTIVE, 'CUSTOMER'),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundError);
      assert.equal((error as { statusCode: number }).statusCode, 404);
      return true;
    },
  );
  const adminView = await ServiceService.getServiceById(SVC_INACTIVE, 'ADMIN');
  assert.equal(adminView.isActive, false);
});

test('a service in an inactive category 404s for customers', async () => {
  seedWorld();
  await assert.rejects(() => ServiceService.getServiceById(SVC_HIDDEN_CATEGORY, 'CUSTOMER'), NotFoundError);
});

test('reactivation restores customer visibility', async () => {
  seedWorld();
  await ServiceService.updateService(SVC, { isActive: false }, ADMIN_ID);
  assert.deepEqual((await ServiceService.listServices('CUSTOMER')).map((service) => service.id), []);

  const restored = await ServiceService.updateService(SVC, { isActive: true }, ADMIN_ID);
  assert.equal(restored.isActive, true);
  assert.deepEqual((await ServiceService.listServices('CUSTOMER')).map((service) => service.id), [SVC]);
  const fetched = await ServiceService.getServiceById(SVC, 'CUSTOMER');
  assert.equal(fetched.isActive, true);
});

test('deactivation is an update, never a delete: the row and its history remain', async () => {
  seedWorld();
  await ServiceService.updateService(SVC, { isActive: false }, ADMIN_ID);
  await ServiceService.updateService(SVC, { isActive: true }, ADMIN_ID);
  assert.equal(world.Service.filter((row) => row.id === SVC).length, 1);
  assert.equal(world.AppointmentService.length, 1);
  assert.equal(world.Payment.length, 1);
  assert.equal(world.Review.length, 1);
});
