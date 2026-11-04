import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/index.js';

export interface JwtPayload {
  sub: string;    // user ID
  email: string;
  role: string;
  /** rememberMe — refresh lifetime follows the cookie policy (7d vs 12h). */
  rm?: boolean;
  /** Unique token id (rotation/revocation address). */
  jti?: string;
}

export interface JwtToken extends JwtPayload {
  iat: number;
  exp: number;
}

const accessTokenExpiry = '15m';
const refreshTokenExpiry = '7d';
const sessionRefreshTokenExpiry = '12h';

export function createAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: accessTokenExpiry });
}

/**
 * Refresh tokens are STATELESS JWTs (not stored, not revocable server-side).
 * `options.rememberMe` sets the lifetime: true -> 7d (persistent cookie),
 * false -> 12h (session cookie). Omitting `options` keeps the legacy 7d
 * behavior for bearer-mode callers.
 */
export function createRefreshToken(payload: JwtPayload, options?: { rememberMe?: boolean }): string {
  const rememberMe = options?.rememberMe === true;
  const expiresIn = options === undefined ? refreshTokenExpiry : rememberMe ? refreshTokenExpiry : sessionRefreshTokenExpiry;
  // jti keeps every issued token unique, so rotation is observable even within
  // the same second and a future revocation list can address tokens by id.
  const body: JwtPayload = { ...payload, ...(options === undefined ? {} : { rm: rememberMe }), jti: randomUUID() };
  return jwt.sign(body, env.JWT_REFRESH_SECRET, { expiresIn });
}

export function verifyAccessToken(token: string): JwtToken {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtToken;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
