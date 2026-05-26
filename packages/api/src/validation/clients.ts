import { z } from 'zod';

const idTypeEnum = z.enum(['personal', 'company', 'passport', 'other']);

export const createClientSchema = z.object({
  nameHe:    z.string().min(1),
  nameEn:    z.string().optional(),
  idNumber:  z.string().optional(),
  idType:    idTypeEnum.optional(),
  phone:     z.string().optional(),
  email:     z.string().email().optional(),
  addressHe: z.string().optional(),
  notes:     z.string().optional(),
}).strict();

export const updateClientSchema = z.object({
  nameHe:    z.string().min(1).optional(),
  nameEn:    z.string().optional(),
  idNumber:  z.string().optional(),
  idType:    idTypeEnum.optional(),
  phone:     z.string().optional(),
  email:     z.string().email().optional(),
  addressHe: z.string().optional(),
  notes:     z.string().optional(),
  isActive:  z.boolean().optional(),
}).strict();
