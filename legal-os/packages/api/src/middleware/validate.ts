import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors/api-error.js';

export function validate(
  schema: ZodSchema,
  target: 'body' | 'query' = 'body',
): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(new ValidationError(result.error.errors));
    }
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
