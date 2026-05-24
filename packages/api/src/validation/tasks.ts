import { z } from 'zod';

const taskStatusValues  = ['pending', 'in_progress', 'checked', 'cancelled'] as const;
const taskPriorityValues = ['low', 'normal', 'high', 'critical'] as const;
const taskSourceValues  = ['manual', 'vacuum_protocol', 'action_plan', 'system'] as const;

export const createTaskSchema = z.object({
  title:       z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  status:      z.enum(taskStatusValues).optional(),
  priority:    z.enum(taskPriorityValues).optional(),
  dueDate:     z.string().datetime({ offset: true }).nullable().optional(),
  clientId:    z.number().int().positive().nullable().optional(),
  caseId:      z.number().int().positive().nullable().optional(),
  documentId:  z.number().int().positive().nullable().optional(),
  source:      z.enum(taskSourceValues).optional(),
}).strict();

export const updateTaskSchema = z.object({
  title:       z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  status:      z.enum(taskStatusValues).optional(),
  priority:    z.enum(taskPriorityValues).optional(),
  dueDate:     z.string().datetime({ offset: true }).nullable().optional(),
  caseId:      z.number().int().positive().nullable().optional(),
}).strict();

export const listTasksQuerySchema = z.object({
  status:   z.enum(taskStatusValues).optional(),
  clientId: z.coerce.number().int().positive().optional(),
  caseId:   z.coerce.number().int().positive().optional(),
  page:     z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
}).strict();
