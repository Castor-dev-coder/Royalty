import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { db } from '../../prisma/db.js';
import { AccountService } from './accounts.service.js';

/**
 * The rule under test: a NEW address has to be a Gmail address, and the
 * address an account already has is left alone.
 */

interface AccountRow {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const accountId = '00000000-0000-4000-8000-000000000001';

function accountRow(email: string): AccountRow {
  return {
    id: accountId,
    email,
    role: 'STAFF',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/**
 * Stand in for the account table.
 *
 * The lookup by address is answered with nothing, so the address is never
 * reported as already in use, and the update returns the row that was
 * written.
 */
function mockAccountTable(current: AccountRow) {
  let stored = current;
  const where = mock.method(db.orm.public.Account, 'where', (filter: Record<string, unknown>) => {
    if ('id' in filter) {
      return {
        first: async () => stored,
        update: async (data: Record<string, unknown>) => {
          stored = { ...stored, ...(data as Partial<AccountRow>) };
          return stored;
        },
      };
    }
    return {
      first: async () => null,
      update: async (data: Record<string, unknown>) => {
        stored = { ...stored, ...(data as Partial<AccountRow>) };
        return stored;
      },
    };
  });
  return { where, read: () => stored };
}

test('a new address has to be a Gmail address', async (context) => {
  const table = mockAccountTable(accountRow('staff@seed.royalty.local'));
  context.after(() => table.where.mock.restore());

  await assert.rejects(
    () => AccountService.updateOwnProfile(accountId, 'staff@example.test'),
    /Gmail address/,
  );
});

test('a Gmail address is accepted however its domain is written', async (context) => {
  const table = mockAccountTable(accountRow('staff@seed.royalty.local'));
  context.after(() => table.where.mock.restore());

  const updated = await AccountService.updateOwnProfile(accountId, 'New.Address@GMAIL.COM');
  assert.equal(updated.email, 'New.Address@GMAIL.COM');
});

test('the address an account already has is left alone', async (context) => {
  const table = mockAccountTable(accountRow('staff@seed.royalty.local'));
  context.after(() => table.where.mock.restore());

  // The request schema trims the address before it reaches the service,
  // so what arrives here is the address the account already has.
  const updated = await AccountService.updateOwnProfile(accountId, 'staff@seed.royalty.local');
  assert.equal(updated.email, 'staff@seed.royalty.local');
});

test('the same address written in a different case is still the same address', async (context) => {
  const table = mockAccountTable(accountRow('staff@seed.royalty.local'));
  context.after(() => table.where.mock.restore());

  const updated = await AccountService.updateOwnProfile(accountId, 'STAFF@SEED.ROYALTY.LOCAL');
  assert.equal(updated.email, 'STAFF@SEED.ROYALTY.LOCAL');
});

test('a change to a different address still has to be a Gmail address', async (context) => {
  const table = mockAccountTable(accountRow('staff@seed.royalty.local'));
  context.after(() => table.where.mock.restore());

  await assert.rejects(
    () => AccountService.updateOwnProfile(accountId, 'someone@example.com'),
    /Gmail address/,
  );
  // The stored address is untouched.
  assert.equal(table.read().email, 'staff@seed.royalty.local');
});

test('an account with no address may set a Gmail one', async (context) => {
  const table = mockAccountTable(accountRow(''));
  context.after(() => table.where.mock.restore());

  const updated = await AccountService.updateOwnProfile(accountId, 'new.address@gmail.com');
  assert.equal(updated.email, 'new.address@gmail.com');
});
