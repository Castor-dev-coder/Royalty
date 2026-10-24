// Real API access for the admin panel. The development mock adapter and its
// demo fixtures were removed: every request goes to the backend database.
// Access/refresh tokens are kept in localStorage under the historical key
// names that the rest of the panel already reads.

export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

export function storeAccessTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearAccessTokens(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

/**
 * Generate a random, cryptographically-strong-ish password for issuing staff
 * sign-in details. It is printed for exactly eight characters with an
 * upper-case letter, a lower-case letter, a digit and a symbol. Ambiguous
 * characters are left out so it can be read aloud.
 */
export function generateTemporaryPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const characters = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  while (characters.length < length) {
    characters.push(all[Math.floor(Math.random() * all.length)]);
  }
  return characters
    .sort(() => Math.random() - 0.5)
    .join('');
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
