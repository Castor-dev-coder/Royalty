// Request validation middleware using Zod schemas
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../errors/index.js';

export function validateRequest<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw new BadRequestError('Validation failed', errors);
      }
      // Attach validated data to request for downstream use
      ;(req as Request & { validatedData: T }).validatedData = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Helper to validate query parameters
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw new BadRequestError('Query validation failed', errors);
      }
      ;(req as Request & { validatedQuery: T }).validatedQuery = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Helper to validate URL parameters
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw new BadRequestError('Params validation failed', errors);
      }
      ;(req as Request & { validatedParams: T }).validatedParams = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}
