import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Conditional JSON responses: a stable strong ETag over the serialized body,
 * `If-None-Match` honoured with 304 (no body), and `no-cache` so clients
 * revalidate on every poll. Pollers that get a 304 keep their current state.
 */
export function jsonWithEtag(req: Request, res: Response, body: unknown): void {
  const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  const ifNoneMatch = req.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string') {
    const candidates = ifNoneMatch.split(',').map((value) => value.trim().replace(/^W\//, ''));
    if (candidates.includes(etag.replace(/^W\//, ''))) {
      res.status(304).end();
      return;
    }
  }
  res.json(body);
}
