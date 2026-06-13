import { z } from 'zod';

const idTypeEnum = z.enum(['personal', 'company', 'passport', 'other']);

export const createClientSchema = z.object({
  nameHe:    z.string().min(1),
  nameEn:    z.string().nullish(),
  idNumber:  z.string().nullish(),
  idType:    idTypeEnum.optional(),
  phone:     z.string().nullish(),
  email:     z.string().email().nullish(),
  addressHe: z.string().nullish(),
  notes:     z.string().nullish(),
}).strict();

export const updateClientSchema = z.object({
  nameHe:    z.string().min(1).optional(),
  nameEn:    z.string().nullish(),
  idNumber:  z.string().nullish(),
  idType:    idTypeEnum.optional(),
  phone:     z.string().nullish(),
  email:     z.string().email().nullish(),
  addressHe: z.string().nullish(),
  notes:     z.string().nullish(),
  isActive:  z.boolean().optional(),
}).strict();
