// CSRF guard for cookie-credentialed endpoints (/auth/refresh, /auth/logout).
// The X-Requested-With header cannot be set cross-site without a CORS
// preflight, and the Origin must belong to the configured allowlist.
import type { Request } from 'express';
import { allowedOrigins } from './cors.js';
import { ForbiddenError } from '../errors/index.js';

export function assertCsrf(req: Request): void {
  const requestedWith = req.headers['x-requested-with'];
  if (typeof requestedWith !== 'string' || requestedWith.trim() === '') {
    throw new ForbiddenError('CSRF check failed: missing X-Requested-With header');
  }
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !allowedOrigins().includes(origin)) {
    throw new ForbiddenError('CSRF check failed: request origin is not allowed');
  }
}
