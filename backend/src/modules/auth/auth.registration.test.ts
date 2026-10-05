import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { registerSchema } from '../../schemas/index.js';

process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET ??= randomBytes(32).toString('hex');
const { AuthService } = await import('./auth.service.js');

const registration = {
  email: 'customer@example.com',
  password: 'correct-horse-battery',
  firstName: 'Riley',
  lastName: 'Customer',
};

type TransactionCallback = Parameters<typeof db.transaction>[0];

test('public registration strips privileged role fields', () => {
  for (const role of ['ADMIN', 'MANAGER', 'STAFF']) {
    const parsed = registerSchema.safeParse({ ...registration, role });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal('role' in parsed.data, false);
  }
});

test('registration atomically creates a CUSTOMER account and profile', async (context) => {
  const accountId = '00000000-0000-4000-8000-000000000001';
  const account = {
    id: accountId,
    email: registration.email,
    role: 'CUSTOMER',
    status: 'ACTIVE',
  };
  const accountInputs: Array<{ email: string; passwordHash: string; role: 'CUSTOMER'; status: 'ACTIVE' }> = [];
  const customerInputs: Array<{ accountId: string; firstName: string; lastName: string; gender: string | null; phone: string | null }> = [];
  const accountCreate = mock.fn(async (input: typeof accountInputs[number]) => {
    accountInputs.push(input);
    return account;
  });
  const customerCreate = mock.fn(async (input: typeof customerInputs[number]) => {
    customerInputs.push(input);
    return { id: 'customer-id' };
  });
  const accountWhere = mock.method(db.orm.public.Account, 'where', () => ({ first: async () => null }));
  const transaction = mock.method(db, 'transaction', async (callback: TransactionCallback) => callback({
    orm: {
      public: {
        Account: { create: accountCreate },
        Customer: { create: customerCreate },
      },
    },
  } as unknown as Parameters<TransactionCallback>[0]));

  context.after(() => {
    accountWhere.mock.restore();
    transaction.mock.restore();
  });

  const result = await AuthService.register(registration.email, registration.password, {
    firstName: registration.firstName,
    lastName: registration.lastName,
  });

  assert.equal(result.role, 'CUSTOMER');
  assert.equal(accountCreate.mock.calls.length, 1);
  assert.equal(accountInputs[0]?.role, 'CUSTOMER');
  assert.deepEqual(customerInputs[0], {
    accountId,
    firstName: registration.firstName,
    lastName: registration.lastName,
    gender: null,
    phone: null,
  });
  assert.equal(transaction.mock.calls.length, 1);
});