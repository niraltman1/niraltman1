import { z } from 'zod';

export const paginationSchema = z.object({
  page:     z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
