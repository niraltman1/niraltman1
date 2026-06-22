import { z } from 'zod';
import { ValidationError } from '../errors/api-error.js';

/**
 * Parse and validate `data` against `schema`, throwing ValidationError on failure.
 * Use for body, query, or params validation outside the validate() middleware.
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError(result.error.errors);
  return result.data;
}

// ── Shared primitive schemas ──────────────────────────────────────────────────

export const positiveIntParam = z.coerce.number().int().positive();

export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
