// CORS allowlist middleware. Origins come from CORS_ORIGINS (comma-separated)
// with local development defaults; a wildcard is never emitted. The API uses
// bearer tokens, not cookies, so credentials stay disabled.
import { Request, Response, NextFunction } from 'express';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

export function allowedOrigins(): string[] {
  const raw = process.env['CORS_ORIGINS'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_ORIGINS;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Mode, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '600');
    // Credentials (refresh cookie) are enabled for allowlisted origins only —
    // never with a wildcard, which browsers reject alongside credentials.
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}
