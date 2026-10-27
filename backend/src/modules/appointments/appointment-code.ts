// Customer-facing appointment codes: APT- + exactly five numeric digits.
// Legacy rows keep their long APT-<UUID> codes and both formats resolve;
// the internal UUID primary key is untouched.
import { randomInt } from 'node:crypto';

export function generateAppointmentCode(): string {
  return `APT-${String(randomInt(0, 100000)).padStart(5, '0')}`;
}

/**
 * Canonical form for comparison: trimmed, uppercased, spaces removed; bare
 * five-digit input gains the APT- prefix. Legacy APT-<UUID> values pass
 * through unchanged (uppercased), so they keep resolving exactly.
 */
export function normalizeAppointmentCode(raw: string): string {
  let cleaned = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  // 'APT 12345' and 'APT12345' both mean the hyphenated form.
  if (/^APT\d{5}$/.test(cleaned)) cleaned = `APT-${cleaned.slice(3)}`;
  return /^\d{5}$/.test(cleaned) ? `APT-${cleaned}` : cleaned;
}

/** True for the storage-layer unique violation on the code column. */
export function isUniqueCodeViolation(error: unknown): boolean {
  const candidate = error as { sqlState?: unknown; code?: unknown; constraint?: unknown } | null;
  return candidate?.sqlState === '23505'
    || candidate?.code === '23505'
    || String(candidate?.constraint ?? '') === 'appointments_appointment_code_key';
}

/**
 * Runs `attempt(code)` with fresh digits until it succeeds. The unique
 * constraint appointments_appointment_code_key is the race-safe backstop —
 * a collision re-runs the whole attempt (transaction), never a read-then-write
 * guess. Non-collision errors and exhausted retries rethrow.
 */
export async function createWithUniqueAppointmentCode(
  attempt: (appointmentCode: string) => Promise<void>,
  maxAttempts = 5,
): Promise<void> {
  for (let run = 1; ; run++) {
    try {
      await attempt(generateAppointmentCode());
      return;
    } catch (error) {
      if (run >= maxAttempts || !isUniqueCodeViolation(error)) throw error;
    }
  }
}
