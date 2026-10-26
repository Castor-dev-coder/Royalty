import type { NextFunction, Request, Response } from 'express';
import { GoogleAuthService } from './google.service.js';
import { setRefreshCookie } from '../../lib/refresh-cookie.js';

/**
 * POST /auth/google — Google Identity sign-in (customer app only).
 * Body: { idToken, rememberMe? } (cookie-mode refresh, mirroring login).
 */
export async function googleSignInController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { idToken, rememberMe } = (req.body ?? {}) as { idToken?: string; rememberMe?: boolean };
    if (typeof idToken !== 'string' || idToken.length === 0) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A Google ID token is required.' } });
      return;
    }
    const remember = rememberMe !== false;
    const result = await GoogleAuthService.signIn(idToken, { rememberMe: remember });
    // Hybrid auth: refresh token lives in the httpOnly cookie (same posture
    // as password login). The access token goes to memory in the SPA.
    setRefreshCookie(req, res, result.refreshToken, remember);
    res.status(result.created ? 201 : 200).json({
      data: { id: result.id, email: result.email, role: result.role, accessToken: result.accessToken, created: result.created },
    });
  } catch (error) {
    next(error);
  }
}
