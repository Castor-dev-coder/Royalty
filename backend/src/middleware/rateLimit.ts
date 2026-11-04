// Small in-memory rate limiter for expensive endpoints (image uploads).
// Per authenticated user, sliding window, deliberately simple: the API runs as
// a single process and this only needs to stop accidental or abusive bursts.
import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from './auth.js'

interface Window {
  hits: number[]
}

export function rateLimit({ windowMs = 60_000, max = 10 }: { windowMs?: number; max?: number }) {
  const windows = new Map<string, Window>()

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const key = req.user?.userId ?? req.ip ?? 'anonymous'
    const now = Date.now()
    const window = windows.get(key) ?? { hits: [] }
    window.hits = window.hits.filter((at) => now - at < windowMs)
    if (window.hits.length >= max) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many uploads. Please wait a moment and try again.' },
      })
      return
    }
    window.hits.push(now)
    windows.set(key, window)
    next()
  }
}
