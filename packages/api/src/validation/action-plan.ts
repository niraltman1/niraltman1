import { z } from 'zod';

const planIdsSchema = z.array(z.string().min(1)).min(1);

export const approveSchema = z.object({
  planIds: planIdsSchema,
}).strict();

export const rejectSchema = z.object({
  planIds: planIdsSchema,
}).strict();

export const signSchema = z.object({
  planIds: planIdsSchema,
}).strict();

export const listActionPlanQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED']).optional(),
  limit:  z.coerce.number().int().min(1).max(1000).optional(),
});
