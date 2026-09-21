import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../errors/index.js';

export interface JwtPayload {
  sub: string;    // user ID
  email: string;
  role: string;
}

export interface JwtToken extends JwtPayload {
  iat: number;
  exp: number;
}

const accessTokenExpiry = '15m';
const refreshTokenExpiry = '7d';

export function createAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: accessTokenExpiry });
}

export function createRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: refreshTokenExpiry });
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
