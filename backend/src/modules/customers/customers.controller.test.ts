import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { NextFunction, Response } from 'express';

process.env.JWT_SECRET ??= 'routes-order-test-secret';
process.env.JWT_REFRESH_SECRET ??= 'routes-order-test-refresh-secret';

const [{ createCustomerController }, { CustomerService }, { createCustomerSchema }] = await Promise.all([
  import('./customers.controller.js'),
  import('./customers.service.js'),
  import('./customers.schemas.js'),
]);

test('the create customer controller stores the number in the checked form', async (context) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  let received: { firstName?: string; lastName?: string; phone?: string } | undefined;
  const create = mock.method(
    CustomerService,
    'create',
    async (data: { firstName?: string; lastName?: string; phone?: string }) => {
      received = data;
      return { id: 'customer-id' };
    },
  );
  context.after(() => create.mock.restore());

  let response: unknown;
  let forwardedError: unknown;
  const req = {
    params: {},
    body: { accountId, firstName: 'Juan Dela Cruz', lastName: 'Dela Cruz Jr.', phone: '0917-555-1100' },
    // The middleware validates the body and puts the result here, so the
    // controller reads the checked values rather than the raw ones.
    validatedData: createCustomerSchema.parse({
      accountId,
      firstName: 'Juan Dela Cruz',
      lastName: 'Dela Cruz Jr.',
      phone: '0917-555-1100',
    }),
    user: { userId: 'admin-id', email: 'admin@seed.royalty.local', role: 'ADMIN' },
  };
  const res = {
    status(code: number) { return this; },
    json(value: unknown) { response = value; return this; },
  };
  const next = ((error?: unknown) => { forwardedError = error; }) as NextFunction;

  await createCustomerController(req as never, res as unknown as Response, next);

  assert.equal(forwardedError, undefined);
  assert.equal(received?.phone, '09175551100');
  assert.equal(received?.lastName, 'Dela Cruz Jr.');
  assert.deepEqual(response, { data: { id: 'customer-id' } });
});

test('a customer number that is not a mobile number is refused at the boundary', () => {
  const result = createCustomerSchema.safeParse({
    accountId: '00000000-0000-4000-8000-000000000001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    phone: '555-0100',
  });
  assert.equal(result.success, false);
});
