import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { assertCsrf } from '../../middleware/csrf.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../lib/refresh-cookie.js';
import { UnauthorizedError } from '../../errors/index.js';
import type { RegisterRequest, RefreshTokenRequest } from '../../schemas/index.js';

const COOKIE_MODE = 'cookie';

/** Cookie mode = explicit X-Auth-Mode: cookie header, or a refresh cookie. */
function isCookieMode(req: Request): boolean {
  return req.headers['x-auth-mode'] === COOKIE_MODE || readRefreshCookie(req) !== null;
}

export async function registerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, firstName, lastName, gender, phone } =
      (req as Request & { validatedData: RegisterRequest }).validatedData;
    const result = await AuthService.register(email, password, { firstName, lastName, gender, phone });
    if (req.headers['x-auth-mode'] === COOKIE_MODE) {
      // Same hybrid posture as login: session refresh cookie, no token in body.
      setRefreshCookie(req, res, result.refreshToken, false);
      res.status(201).json({
        data: { id: result.id, email: result.email, role: result.role, accessToken: result.accessToken },
      });
      return;
    }
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, rememberMe } = req.body;
    const cookieMode = req.headers['x-auth-mode'] === COOKIE_MODE;
    const remember = rememberMe === true;
    const result = await AuthService.login(email, password, cookieMode ? { rememberMe: remember } : undefined);
    if (cookieMode) {
      // Hybrid auth: the refresh token lives in an httpOnly cookie and is
      // never sent in the body. rememberMe -> persistent 7-day cookie + 7d
      // token; otherwise a session cookie + 12h token.
      setRefreshCookie(req, res, result.refreshToken, remember);
      res.json({
        data: { id: result.id, email: result.email, role: result.role, accessToken: result.accessToken },
      });
      return;
    }
    // Bearer mode (admin) — unchanged: both tokens in the body, no cookie.
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function refreshController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (isCookieMode(req)) {
      // Cookie-credentialed endpoint: CSRF guard first, then rotate.
      assertCsrf(req);
      const cookie = readRefreshCookie(req);
      if (!cookie) throw new UnauthorizedError('Missing refresh token');
      const result = await AuthService.refreshToken(cookie);
      setRefreshCookie(req, res, result.refreshToken, result.rememberMe);
      res.json({ data: { accessToken: result.accessToken } });
      return;
    }
    const { refreshToken } = {
      ...(req.body ?? {}),
      ...((req as Request & { validatedData?: RefreshTokenRequest }).validatedData ?? {}),
    };
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new UnauthorizedError('Missing refresh token');
    }
    const result = await AuthService.refreshToken(refreshToken);
    res.json({ data: { accessToken: result.accessToken, refreshToken: result.refreshToken } });
  } catch (error) {
    next(error);
  }
}

export async function logoutController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertCsrf(req);
    clearRefreshCookie(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
