// Customer-facing appointment codes: APT- + five digits on new rows; legacy
// rows keep APT-<UUID>. Comparison normalizes case, whitespace, and the
// optional APT- prefix so '12345', 'apt-12345' and 'APT-12345' resolve to the
// same appointment — never partially.

export function normalizeAppointmentCode(raw: string): string {
  let cleaned = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  // 'APT 12345' and 'APT12345' both mean the hyphenated form.
  if (/^APT\d{5}$/.test(cleaned)) cleaned = `APT-${cleaned.slice(3)}`;
  return /^\d{5}$/.test(cleaned) ? `APT-${cleaned}` : cleaned;
}

/** Exact match after normalization; empty input never matches. */
export function codesMatch(a: string, b: string): boolean {
  const left = normalizeAppointmentCode(a);
  return left.length > 0 && left === normalizeAppointmentCode(b);
}

/**
 * Search filter: an exact normalized code match wins outright; otherwise a
 * substring scan keeps partial typing useful for both code formats.
 */
export function codeMatchesSearch(code: string, rawSearch: string): boolean {
  const search = normalizeAppointmentCode(rawSearch);
  if (!search) return false;
  return normalizeAppointmentCode(code) === search || code.toUpperCase().includes(search);
}
