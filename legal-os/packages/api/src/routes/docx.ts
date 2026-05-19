import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { generateDocx } from '../utils/docx-generator.js';
import { NotFoundError } from '../errors/api-error.js';

const FIRM_NAME = process.env['FIRM_NAME'] ?? 'אלטמן משרד עורכי דין';

const powerOfAttorneySchema = z.object({
  clientId:        z.number().int().positive(),
  caseId:          z.number().int().positive().optional(),
  lawyerName:      z.string().default('עו"ד נירה אלטמן'),
  lawyerBarNumber: z.string().default(''),
  signDate:        z.string().optional(),
}).strict();

const feeAgreementSchema = z.object({
  clientId:     z.number().int().positive(),
  caseId:       z.number().int().positive().optional(),
  lawyerName:   z.string().default('עו"ד נירה אלטמן'),
  lawyerBarNumber: z.string().default(''),
  feeAmount:    z.string().default('0'),
  feeCurrency:  z.string().default('₪'),
  successBonus: z.string().default('0'),
  signDate:     z.string().optional(),
}).strict();

function todayHe(): string {
  return new Date().toLocaleDateString('he-IL');
}

export function docxRouter(repos: Repos): Router {
  const router = Router();

  /**
   * POST /api/docx/power-of-attorney
   * Generates a Power of Attorney (ייפוי כוח) .docx for a client.
   */
  router.post('/power-of-attorney', validate(powerOfAttorneySchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof powerOfAttorneySchema>;

    const client = repos.clients.findById(body.clientId);
    if (!client) throw new NotFoundError('Client');

    let caseNumber = '';
    let caseDescription = '';
    if (body.caseId) {
      const c = repos.cases.findById(body.caseId);
      if (c) {
        caseNumber      = c.caseNumber;
        caseDescription = c.titleHe ?? '';
      }
    }

    const docBuffer = generateDocx('power_of_attorney', {
      clientNameHe:    client.nameHe,
      clientIdNumber:  client.idNumber ?? '',
      clientAddress:   client.addressHe ?? '',
      lawyerName:      body.lawyerName,
      lawyerBarNumber: body.lawyerBarNumber,
      caseNumber,
      caseDescription,
      signDate:        body.signDate ?? todayHe(),
      firmName:        FIRM_NAME,
    });

    const filename = `ייפוי_כוח_${client.nameHe.replace(/\s+/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(docBuffer);
  }));

  /**
   * POST /api/docx/fee-agreement
   * Generates a Fee Agreement (הסכם שכר טרחה) .docx for a client.
   */
  router.post('/fee-agreement', validate(feeAgreementSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof feeAgreementSchema>;

    const client = repos.clients.findById(body.clientId);
    if (!client) throw new NotFoundError('Client');

    let caseType  = '';
    let courtName = '';
    if (body.caseId) {
      const c = repos.cases.findById(body.caseId);
      if (c) {
        caseType  = c.caseType ?? '';
        courtName = c.courtName ?? '';
      }
    }

    const docBuffer = generateDocx('fee_agreement', {
      clientNameHe:    client.nameHe,
      clientIdNumber:  client.idNumber ?? '',
      lawyerName:      body.lawyerName,
      lawyerBarNumber: body.lawyerBarNumber,
      caseType,
      feeAmount:       body.feeAmount,
      feeCurrency:     body.feeCurrency,
      successBonus:    body.successBonus,
      signDate:        body.signDate ?? todayHe(),
      firmName:        FIRM_NAME,
      courtName,
    });

    const filename = `הסכם_שכ"ט_${client.nameHe.replace(/\s+/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(docBuffer);
  }));

  return router;
}
