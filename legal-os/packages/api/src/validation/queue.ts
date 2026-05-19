import { z } from 'zod';

export const requeueParamSchema = z.object({
  id: z.string().min(1),
});

export const listQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
