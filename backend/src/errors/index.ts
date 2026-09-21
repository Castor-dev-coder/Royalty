// Centralized error classes for the API

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Access denied') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export class InternalError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message);
    this.name = 'InternalError';
  }
}
