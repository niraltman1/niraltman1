import { z } from 'zod';

const caseTypeEnum   = z.enum(['civil', 'criminal', 'family', 'labour', 'administrative']);
const caseStatusEnum = z.enum(['open', 'closed', 'suspended', 'archived']);

export const createCaseSchema = z.object({
  caseNumber:    z.string().min(1),
  caseType:      caseTypeEnum.optional(),
  procedureType: z.string().optional(),
  titleHe:       z.string().min(1),
  titleEn:       z.string().optional(),
  clientId:      z.number().int().positive(),
  courtName:     z.string().optional(),
  openedDate:    z.string().optional(),
  status:        caseStatusEnum.optional(),
  notes:         z.string().optional(),
}).strict();

export const updateCaseSchema = z.object({
  caseType:     caseTypeEnum.optional(),
  titleHe:      z.string().min(1).optional(),
  titleEn:      z.string().optional(),
  courtName:    z.string().optional(),
  openedDate:   z.string().optional(),
  closedDate:   z.string().optional(),
  status:       caseStatusEnum.optional(),
  notes:        z.string().optional(),
}).strict();
