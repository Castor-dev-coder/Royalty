import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import type { NextFunction, Response } from 'express';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');

const [
  { staffRouter },
  { schedulesRouter },
  { servicesRouter },
  { StaffService },
  { updateOwnStaffController },
  { updateOwnStaffProfileSchema },
] = await Promise.all([
  import('./staff.js'),
  import('./schedules.js'),
  import('./services.js'),
  import('../modules/staff/staff.service.js'),
  import('../modules/staff/staff.controller.js'),
  import('../modules/staff/staff.schemas.js'),
]);

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

function routeIndex(router: unknown, method: string, path: string): number {
  const stack = (router as { stack: RouterLayer[] }).stack;
  return stack.findIndex((layer) => layer.route?.path === path && layer.route.methods[method]);
}

test('staff self routes precede parameterized staff routes', () => {
  assert.ok(routeIndex(staffRouter, 'get', '/me') < routeIndex(staffRouter, 'get', '/:id'));
  assert.ok(routeIndex(staffRouter, 'patch', '/me') < routeIndex(staffRouter, 'patch', '/:id'));
});

test('schedule self routes precede parameterized routes', () => {
  assert.ok(routeIndex(schedulesRouter, 'get', '/staff/me') < routeIndex(schedulesRouter, 'get', '/staff/:id'));
  assert.ok(routeIndex(schedulesRouter, 'get', '/requests/me') < routeIndex(schedulesRouter, 'get', '/requests/:id'));
});

test('service self route precedes the parameterized staff service route', () => {
  assert.ok(routeIndex(servicesRouter, 'get', '/staff/me/services') < routeIndex(servicesRouter, 'get', '/staff/:id/services'));
});

test('PATCH /staff/me updates the authenticated account profile without a route ID', async (context) => {
  const accountId = 'account-id';
  const staff = {
    id: 'staff-id',
    accountId,
    firstName: 'Riley',
    lastName: 'Staff',
    phone: '09175551100',
    primaryRole: 'Stylist',
    employmentType: 'FULL_TIME' as const,
    workStatus: 'ON_DUTY' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  let receivedAccountId = '';
  const update = mock.method(StaffService, 'updateOwnProfile', async (receivedId: string, data: { phone?: string }) => {
    receivedAccountId = receivedId;
    return { ...staff, phone: data.phone ?? staff.phone };
  });
  context.after(() => update.mock.restore());

  let response: unknown;
  let forwardedError: unknown;
  const req = {
    params: {},
    body: { phone: '0917-555-1101' },
    // The middleware validates the body and puts the result here, so the
    // controller reads the checked number rather than the raw one.
    validatedData: updateOwnStaffProfileSchema.parse({ phone: '0917-555-1101' }),
    user: { userId: accountId, email: 'staff@example.com', role: 'STAFF' },
  };
  const res = { json(value: unknown) { response = value; return this; } };
  const next = ((error?: unknown) => { forwardedError = error; }) as NextFunction;

  await updateOwnStaffController(req as never, res as unknown as Response, next);

  assert.equal(forwardedError, undefined);
  assert.equal(receivedAccountId, accountId);
  // The number is stored in one form, whatever way it was written.
  assert.deepEqual(response, { data: { ...staff, phone: '09175551101' } });
});