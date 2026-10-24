// Refresh-token cookie for hybrid auth (access token in memory, refresh token
// in an httpOnly cookie). Posture is decided per request from the Origin:
//  - localhost dev (same registrable domain) -> SameSite=Lax, no Secure
//  - cross-site deployment (Vercel SPA + separate API host) -> SameSite=None;
//    Secure, which is the only cookie shape browsers accept cross-site
import type { Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'royalty_rt';

function isLocalhost(host: string): boolean {
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function sameSite(hostA: string, hostB: string): boolean {
  const stripPort = (host: string): string => host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const a = stripPort(hostA);
  const b = stripPort(hostB);
  return a === b || (isLocalhost(a) && isLocalhost(b));
}

interface CookiePosture {
  httpOnly: true;
  path: '/';
  secure: boolean;
  sameSite: 'lax' | 'none';
}

export function cookiePostureFor(req: Request): CookiePosture {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const backendHost = typeof req.headers.host === 'string' ? req.headers.host : '';
  let originHost = '';
  try {
    originHost = origin ? new URL(origin).host : '';
  } catch {
    originHost = '';
  }
  const crossSite = originHost !== '' && backendHost !== '' && !sameSite(originHost, backendHost);
  const secure = crossSite ? true : !(isLocalhost(originHost) || isLocalhost(backendHost));
  return { httpOnly: true, path: '/', secure, sameSite: crossSite ? 'none' : 'lax' };
}

/** Persistent (rememberMe, 7 days) or session cookie (no Expires/Max-Age). */
export function setRefreshCookie(req: Request, res: Response, token: string, rememberMe: boolean): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookiePostureFor(req),
    ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  });
}

export function clearRefreshCookie(req: Request, res: Response): void {
  res.cookie(REFRESH_COOKIE_NAME, '', { ...cookiePostureFor(req), maxAge: 0 });
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
