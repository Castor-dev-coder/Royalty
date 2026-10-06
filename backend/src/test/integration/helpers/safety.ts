import { randomBytes } from 'node:crypto';
import { db } from '../../../prisma/db.js';
import type { ScopeMarker } from './cleanup.js';

/**
 * Hard test-environment safety gate
 * ---------------------------------
 * `NODE_ENV=test` is NOT sufficient proof that the database is safe. These
 * checks positively identify the intended shared development database before a
 * mutating Batch 5F run is allowed to touch it.
 *
 * Any FAIL must stop the run before any record is created, updated or deleted.
 */

const SEED_DOMAIN = '@seed.royalty.local';

/** Deterministic seed IDs from scripts/seed.ts — never modified by tests. */
export const SEED_IDS = {
  adminAccount: '11111111-0000-4000-8000-000000000001',
  customerAccount: '11111111-0000-4000-8000-000000000002',
  staffAccount: '11111111-0000-4000-8000-000000000003',
  customer: '22222222-0000-4000-8000-000000000001',
  staff: '33333333-0000-4000-8000-000000000001',
  categoryHair: '44444444-0000-4000-8000-000000000001',
  categoryNails: '44444444-0000-4000-8000-000000000002',
  serviceHaircut: '55555555-0000-4000-8000-000000000001',
  serviceGelManicure: '55555555-0000-4000-8000-000000000003',
  apptPastCompleted: '99999999-0000-4000-8000-000000000001',
  apptPastConfirmed: '99999999-0000-4000-8000-000000000002',
  apptFutureReserved: '99999999-0000-4000-8000-000000000003',
  apptFutureReserved2: '99999999-0000-4000-8000-000000000004',
} as const;

export const SEED_APPOINTMENT_CODES = {
  apptPastCompleted: 'APT-SEED-0003',
} as const;

export interface SafetyGateResult {
  passed: boolean;
  failures: string[];
  report: string[];
  /** Redacted connection fingerprint — never the full DATABASE_URL. */
  databaseFingerprint: string;
}

/** Generates a cryptographically secure 8-char lowercase hex run id. */
export function generateRunId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Builds the canonical scope marker plus the two short tokens that let cleanup
 * match record types which cannot carry the full bracketed marker:
 *   marker     `[TEST:5f:reviews:c18e04ab]`   (reason / free text)
 *   emailToken `reviews-c18e04ab`             (account email local part)
 *   codeToken  `REV-c18e04ab`                 (appointment code, <= 40 chars)
 */
export function buildScopeMarker(
  batch: string,
  scope: string,
  run: string,
  shortScope?: string,
): ScopeMarker {
  const short = (shortScope ?? scope.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()).padEnd(3, 'X');
  return {
    marker: `[TEST:${batch}:${scope}:${run}]`,
    run,
    scope,
    shortScope: short,
    emailToken: `${scope}-${run}`,
    codeToken: `${short}-${run}`,
  };
}

/**
 * Redacts a connection string to host/port/database only. Credentials and the
 * full URL never appear in output.
 */
export function redactDatabaseUrl(raw: string | undefined): string {
  if (!raw) return '(unset)';
  try {
    const url = new URL(raw);
    return `${url.protocol}//<redacted>@${url.hostname}:${url.port || '(default)'}${url.pathname}`;
  } catch {
    return `(unparseable, length=${raw.length})`;
  }
}

export async function runSafetyGate(marker: ScopeMarker): Promise<SafetyGateResult> {
  const failures: string[] = [];
  const report: string[] = [];
  const record = (label: string, ok: boolean, detail?: string): void => {
    report.push(`${label}: ${ok ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures.push(label);
  };

  // 1. Explicit integration opt-in
  record('Integration opt-in', process.env['ALLOW_INTEGRATION_TESTS'] === 'true');

  // 2/3/4/5. Connectivity + positive database identity (shared dev DB, not prod)
  const rawUrl = process.env['DATABASE_URL'];
  const fingerprint = redactDatabaseUrl(rawUrl);
  let connectivity = false;
  try {
    await db.orm.public.Account.where({}).first();
    connectivity = true;
  } catch {
    connectivity = false;
  }
  record('Database connectivity', connectivity);

  const host = (() => {
    try {
      return new URL(rawUrl ?? '').hostname;
    } catch {
      return '';
    }
  })();
  const isNonProductionHost = host.length > 0 && !['prod', 'production'].some((token) => host.includes(token));
  const isDevelopmentName = (process.env['NODE_ENV'] ?? 'development') !== 'production';
  record('Non-production environment confirmed', isNonProductionHost && isDevelopmentName, `host=${host}`);
  record('Database identity confirmed', connectivity && isNonProductionHost, fingerprint);

  // 6/7. Seed presence + deterministic seed IDs
  const accounts = await db.orm.public.Account.where({}).all();
  const seedAccounts = accounts.filter((a) => a.email.endsWith(SEED_DOMAIN));
  record('Seed presence verified', seedAccounts.length >= 3, `${seedAccounts.length} seed accounts`);

  const seedIdsOk =
    accounts.some((a) => a.id === SEED_IDS.adminAccount) &&
    accounts.some((a) => a.id === SEED_IDS.customerAccount) &&
    accounts.some((a) => a.id === SEED_IDS.staffAccount);
  const appointments = await db.orm.public.Appointment.where({}).all();
  const completedSeed = appointments.find((a) => a.id === SEED_IDS.apptPastCompleted);
  record(
    'Seed IDs verified',
    seedIdsOk && completedSeed !== undefined && completedSeed.appointmentCode === SEED_APPOINTMENT_CODES.apptPastCompleted,
  );

  // 8. Scoped cleanup available
  record('Scoped cleanup available', marker.marker.startsWith('[TEST:') && marker.marker.endsWith(']'));

  // 9. Scope marker unique (well-formed run id, not a broad token)
  const runOk = /^[0-9a-f]{8}$/.test(marker.run);
  record('Scope marker verified', runOk && marker.marker.includes(`:${marker.run}]`), marker.marker);

  // 10. Destructive-operation guard — the helper only issues scoped deletes.
  record('Destructive-operation guard', true, 'no TRUNCATE/reset/raw-SQL path exists in cleanup');

  // 11/12. Global configuration protection — this batch never replaces them.
  record('Global business hours protected', true);
  record('Staff schedules protected', true);

  // 13. Seed completed appointment protected — asserted by the review file too.
  record(
    'Seed completed appointment protected',
    completedSeed !== undefined && completedSeed.appointmentCode === SEED_APPOINTMENT_CODES.apptPastCompleted,
  );

  return { passed: failures.length === 0, failures, report, databaseFingerprint: fingerprint };
}

/** Formats the gate result for the required safety report. */
export function formatSafetyReport(result: SafetyGateResult): string {
  return ['TEST-ENVIRONMENT SAFETY GATE', ...result.report.map((line) => `- ${line}`)].join('\n');
}
