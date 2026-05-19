import { z } from 'zod';

const anchorValues    = ['filing', 'previous', 'court_order'] as const;
const priorityValues  = ['low', 'normal', 'high', 'critical']  as const;
const statusValues    = ['draft', 'active', 'deprecated']       as const;

export const milestoneSchema = z.object({
  titleHe:     z.string().min(1).max(200),
  titleEn:     z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  dayOffset:   z.number().int().min(0).nullable().optional(),
  anchor:      z.enum(anchorValues).optional(),
  isMandatory: z.boolean().optional(),
  taskPriority: z.enum(priorityValues).optional(),
});

export const learnSchema = z.object({
  caseType:   z.string().min(1).max(100),
  legalBasis: z.string().min(1).max(500),
  sourceText: z.string().min(10).max(50_000),
  sourceUrl:  z.string().url().nullable().optional(),
}).strict();

export const saveTemplateSchema = z.object({
  caseType:    z.string().min(1).max(100),
  nameHe:      z.string().min(1).max(300),
  nameEn:      z.string().max(300).nullable().optional(),
  legalBasis:  z.string().max(500).nullable().optional(),
  sourceUrl:   z.string().url().nullable().optional(),
  sourceText:  z.string().max(50_000).nullable().optional(),
  aiGenerated: z.boolean().optional(),
  milestones:  z.array(milestoneSchema).min(1).max(50),
}).strict();

export const applyTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const updateProcedureSchema = z.object({
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status:     z.enum(['active', 'completed', 'suspended']).optional(),
  notes:      z.string().max(2000).nullable().optional(),
}).strict();

export const listTemplatesQuerySchema = z.object({
  status: z.enum(statusValues).optional(),
}).strict();
