import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Conditional JSON responses: a stable strong ETag over the serialized body,
 * `If-None-Match` honoured with 304 (no body), and `no-cache` so clients
 * revalidate on every poll. Pollers that get a 304 keep their current state.
 */
/**
 * Marks a response as shared-cacheable public catalogue data (services,
 * categories, the team roster, opening hours, the public gallery): fresh for
 * `maxAge` seconds, then served stale for at most `staleWhileRevalidate`
 * seconds while a background revalidation runs. The app-wide default is
 * `no-store`, so only routes that opt in here are ever cacheable.
 */
export function publicCache(res: Response, maxAge = 60, staleWhileRevalidate = 600): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
}

/** Route middleware form of {@link publicCache} with default timings. */
export function publicCacheMiddleware(_req: Request, res: Response, next: () => void): void {
  publicCache(res);
  next();
}

export function jsonWithEtag(req: Request, res: Response, body: unknown): void {
  const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
  res.setHeader('ETag', etag);
  // An explicit policy (see publicCache) wins; otherwise revalidate on use.
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache');
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
