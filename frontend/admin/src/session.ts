/**
 * Role-aware session state for the admin and staff areas.
 *
 * The JWT is the only credential the browser keeps; the role stored here is a
 * convenience copy used to decide which area of the interface to render. It is
 * never used to grant access: every privileged read and write is authorized by
 * the API, which derives the role from the token it verifies.
 */

export type AccountRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'CUSTOMER';

export interface AccountSession {
  id: string;
  email: string;
  role: AccountRole;
}

const SESSION_KEY = 'royalty.admin.session.v1';

const ROLES: readonly AccountRole[] = ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'];

function isRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function readAccountSession(): AccountSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountSession>;
    if (!isRole(parsed.role)) return null;
    return {
      id: typeof parsed.id === 'string' ? parsed.id : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

export function storeAccountSession(session: AccountSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // A browser that refuses storage still works for the current page load.
  }
}

export function clearAccountSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage failures; the tokens are cleared separately.
  }
}

/**
 * Normalize a login response into a session.
 *
 * The live API answers with a flat account, while the development mock nests
 * the account under "account". Both are accepted so the interface works
 * against either adapter.
 */
export function readLoginSession(payload: unknown): AccountSession | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const nested = (record.account && typeof record.account === 'object' ? record.account : {}) as Record<string, unknown>;
  const role = record.role ?? nested.role;
  if (!isRole(role)) return null;
  return {
    id: typeof (record.id ?? nested.id) === 'string' ? (record.id ?? nested.id) as string : '',
    email: typeof (record.email ?? nested.email) === 'string' ? (record.email ?? nested.email) as string : '',
    role,
  };
}

/**
 * Read the role carried by a JWT without verifying its signature.
 *
 * Purpose: a browser that still holds a token from an earlier session has no
 * stored role, and the interface needs one to choose the right area. The value
 * is used for routing only. The API remains the sole authority on access, so a
 * tampered or stale role here cannot widen what the session may do.
 */
export function readRoleFromToken(token: string | null): AccountRole | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1])))) as { role?: unknown };
    return isRole(payload.role) ? payload.role : null;
  } catch {
    return null;
  }
}

/** The session for the current page load, or null when nobody is signed in. */
export function currentSession(accessToken: string | null): AccountSession | null {
  const stored = readAccountSession();
  if (stored) return stored;
  const role = readRoleFromToken(accessToken);
  if (!role) return null;
  return { id: '', email: '', role };
}
