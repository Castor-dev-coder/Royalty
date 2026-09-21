// Express error-handling middleware
import { Request, Response, NextFunction } from 'express';
import { ApiError, InternalError } from '../errors/index.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle known ApiError instances
  if (err instanceof ApiError) {
    const response: { error: { code: string; message: string; details?: unknown } } = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err.details && process.env.NODE_ENV === 'development') {
      response.error.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unexpected errors
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : (err instanceof Error ? err.message : String(err)),
    },
  });
}

// 404 handler for unmatched routes
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${_req.method} ${_req.path} not found`,
    },
  });
}
