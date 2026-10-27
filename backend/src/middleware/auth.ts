import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed authorization header');
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);

    req.user = {
      userId: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attaches req.user when a valid bearer token is present, but never rejects:
 * public catalogue routes stay open to anonymous visitors while still seeing
 * the caller's real role when one authenticates (without this, every caller
 * silently fell back to 'CUSTOMER' and staff-only fields were hidden).
 */
export function optionalAuthenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifyAccessToken(authHeader.substring(7));
      req.user = { userId: decoded.sub, email: decoded.email, role: decoded.role };
    }
  } catch {
    // Anonymous or invalid token: proceed without a user.
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Authenticated but not allowed: 403 FORBIDDEN, not 401. A 401 here
      // makes clients silently retry a refresh like an expired session.
      throw new ForbiddenError(`Access denied. Required roles: ${allowedRoles.join(' or ')}`);
    }

    next();
  };
}
