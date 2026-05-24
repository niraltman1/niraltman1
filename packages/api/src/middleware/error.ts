import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../errors/api-error.js';
import { ErrorCode } from '../errors/codes.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const isDev = process.env['NODE_ENV'] !== 'production';

  // Auto-map SQLite UNIQUE violations → 409 Conflict
  if (err?.message?.includes('UNIQUE constraint failed')) {
    res.status(409).json({
      success: false,
      error: { code: ErrorCode.CONFLICT, message: 'Resource already exists' },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
        ...(isDev && { stack: err.stack }),
      },
    });
    return;
  }

  const message = isDev ? String(err?.message ?? err) : 'Internal server error';
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message,
      ...(isDev && { stack: err?.stack }),
    },
  });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: ErrorCode.NOT_FOUND, message: 'Route not found' },
  });
};
