import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';

const CONTACT_ROLES = [
  'opposing_counsel', 'prosecutor', 'witness',
  'police', 'court_clerk', 'expert', 'family', 'other',
] as const;

const createContactSchema = z.object({
  nameHe:       z.string().min(1),
  nameEn:       z.string().nullish(),
  role:         z.enum(CONTACT_ROLES).optional(),
  phone:        z.string().nullish(),
  email:        z.string().email().nullish(),
  organization: z.string().nullish(),
  idNumber:     z.string().nullish(),
  notes:        z.string().nullish(),
}).strict();

const updateContactSchema = createContactSchema.partial().strict();

const linkSchema = z.object({
  contactId:  z.number().int().positive(),
  roleInCase: z.string().nullish(),
}).strict();

export function contactsRouter(repos: Repos): Router {
  const router = Router();
  const { contacts } = repos;

  router.get('/', asyncHandler((req, res) => {
    const q     = (req.query['q'] as string | undefined)?.trim();
    const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
    const items = q ? contacts.search(q, limit) : contacts.list(limit);
    ok(res, items);
  }));

  router.post('/', validate(createContactSchema), asyncHandler((req, res) => {
    const contact = contacts.create(req.body);
    ok(res, contact, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const contact = contacts.findById(Number(req.params['id']));
    if (!contact) throw new NotFoundError('contact');
    ok(res, contact);
  }));

  router.patch('/:id', validate(updateContactSchema), asyncHandler((req, res) => {
    const contact = contacts.update(Number(req.params['id']), req.body);
    if (!contact) throw new NotFoundError('contact');
    ok(res, contact);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const existing = contacts.findById(Number(req.params['id']));
    if (!existing) throw new NotFoundError('contact');
    contacts.delete(Number(req.params['id']));
    ok(res, { deleted: true });
  }));

  router.get('/:id/cases', asyncHandler((req, res) => {
    const existing = contacts.findById(Number(req.params['id']));
    if (!existing) throw new NotFoundError('contact');
    const cases = contacts.getCasesForContact(Number(req.params['id']));
    ok(res, cases);
  }));

  // ── Case ↔ Contact link endpoints (mounted at /api/cases/:caseId/contacts) ──
  // These are also accessible here for completeness
  router.post('/link/:caseId', validate(linkSchema), asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    const { contactId, roleInCase } = req.body as z.infer<typeof linkSchema>;
    contacts.linkToCase(caseId, contactId, roleInCase);
    ok(res, { linked: true });
  }));

  router.delete('/link/:caseId/:contactId', asyncHandler((req, res) => {
    contacts.unlinkFromCase(Number(req.params['caseId']), Number(req.params['contactId']));
    ok(res, { unlinked: true });
  }));

  return router;
}
