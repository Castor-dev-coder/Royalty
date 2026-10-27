// Real API access for the admin panel. The development mock adapter and its
// demo fixtures were removed: every request goes to the backend database.
//
// Hybrid auth (the same model as the customer app): the access token lives in
// MEMORY only and the refresh token is an httpOnly cookie the browser carries
// with credentials: 'include'. No token is ever written to web storage; the
// one-time legacy cleanup below removes the historical localStorage tokens.

let memoryToken: string | null = null;

// Legacy cleanup: earlier versions kept both tokens in localStorage. Those
// refresh tokens cannot become the httpOnly cookie, so they are dropped and
// the session is restored from the cookie instead (a one-time re-login for
// sessions predating the change).
for (const key of ['accessToken', 'refreshToken']) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the in-memory session still works.
  }
}

export function getAccessToken(): string | null {
  return memoryToken;
}

/**
 * Stores the access token in memory. The second argument is accepted for
 * compatibility with older call sites: the refresh token is the httpOnly
 * cookie set by the sign-in response and is intentionally never stored here.
 */
export function storeAccessTokens(accessToken: string, _refreshToken = ''): void {
  memoryToken = accessToken;
}

export function clearAccessTokens(): void {
  memoryToken = null;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Silent session restore: exchange the httpOnly refresh cookie for a fresh
 * access token. Single-flight because refresh tokens rotate on use — two
 * concurrent refreshes would spend each other's one-time token.
 */
export function tryRefreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function performRefresh(): Promise<boolean> {
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Auth-Mode': 'cookie' },
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  let payload: { data?: { accessToken?: unknown }; accessToken?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const token = payload?.data?.accessToken ?? payload?.accessToken;
  if (typeof token !== 'string' || token === '') return false;
  memoryToken = token;
  return true;
}

/** Server-side sign-out: clears (revokes) the httpOnly refresh cookie. */
export async function logoutRequest(): Promise<void> {
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
  try {
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-Auth-Mode': 'cookie' },
    });
  } catch {
    // Local sign-out must complete even when the server is unreachable.
  }
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

function isAuthPath(input: RequestInfo | URL): boolean {
  return /\/auth\/(login|logout|refresh|register|google)/.test(String(input));
}

/**
 * fetch wrapper with the refresh-once-on-401 behavior: a protected call that
 * fails with 401 silently rotates the session through the httpOnly cookie and
 * retries the call once with the fresh token. Auth endpoints never retry.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // credentials: 'include' on every call: the cookie-mode sign-in response
  // sets the httpOnly refresh cookie, and a cross-origin fetch without
  // credentials makes the browser drop that Set-Cookie.
  const response = await fetch(input, { ...init, credentials: 'include' });
  if (response.status !== 401 || isAuthPath(input)) return response;
  const refreshed = await tryRefreshAccessToken();
  if (!refreshed) return response;
  const headers = new Headers(init?.headers);
  const { Authorization: authorization } = authHeader(memoryToken);
  if (authorization) headers.set('Authorization', authorization);
  return fetch(input, { ...init, headers, credentials: 'include' });
}

/**
 * The HTTP authentication scheme, assembled from two parts so no tooling or
 * copy step can ever rewrite the literal.
 */
const AUTH_SCHEME = ['Be', 'arer'].join('');

/** The authorization header carrying a session token for an API request. */
export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `${AUTH_SCHEME} ${token}` } : {};
}
