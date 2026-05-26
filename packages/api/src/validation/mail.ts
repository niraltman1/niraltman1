import { z } from 'zod';

export const generateReplySchema = z.object({
  emailId:   z.string().optional(),
  caseId:    z.coerce.number().int().positive(),
  tone:      z.enum(['formal', 'assertive', 'conciliatory']),
  emailBody: z.string().min(1).max(8000),
}).strict();
