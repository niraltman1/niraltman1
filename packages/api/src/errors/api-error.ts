import { ErrorCode } from './codes.js';
import type { ZodIssue } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = 'Resource') {
    super(404, ErrorCode.NOT_FOUND, `${resource} not found`);
  }
}

export class ValidationError extends ApiError {
  constructor(issues: ZodIssue[] | string) {
    const message =
      typeof issues === 'string'
        ? issues
        : issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const details = typeof issues === 'string' ? undefined : issues;
    super(422, ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, ErrorCode.CONFLICT, message);
  }
}

export class IntegrityError extends ApiError {
  constructor(message: string) {
    super(500, ErrorCode.INTEGRITY_ERROR, message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, ErrorCode.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}
