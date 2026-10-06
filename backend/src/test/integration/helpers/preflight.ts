import { db } from '../../../prisma/db.js';

export interface PreflightCheck {
  passed: boolean;
  reason: string;
}

const REQUIRED_ENV_VAR = 'ALLOW_INTEGRATION_TESTS';

export async function runPreflightChecks(): Promise<PreflightCheck> {
  // Check 1: Explicit opt-in environment variable
  if (process.env[REQUIRED_ENV_VAR] !== 'true') {
    return {
      passed: false,
      reason: `Integration tests require ${REQUIRED_ENV_VAR}=true in the environment. This prevents accidental execution against an unintended database.`,
    };
  }

  // Check 2: Database connectivity
  try {
    await db.orm.public.Account.where({}).first();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      reason: `Database connectivity check failed: ${message}`,
    };
  }

  // Check 3: Verify seed data is present (sanity check that we're on the dev DB)
  const seedAccount = await db.orm.public.Account.where({}).all();
  const hasSeedAccounts = seedAccount.some((a) => a.email.endsWith('@seed.royalty.local'));
  if (!hasSeedAccounts) {
    return {
      passed: false,
      reason: 'Seed accounts not found. Integration tests must run against the seeded development database.',
    };
  }

  return { passed: true, reason: 'All preflight checks passed' };
}
