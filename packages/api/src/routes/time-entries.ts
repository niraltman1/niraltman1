import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';

const createSchema = z.object({
  caseId:        z.number().int().positive(),
  descriptionHe: z.string().min(1),
  entryDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours:         z.number().positive(),
  rate:          z.number().nonnegative().optional(),
  billable:      z.boolean().optional(),
  notes:         z.string().optional(),
}).strict();

const patchSchema = z.object({
  descriptionHe: z.string().min(1).optional(),
  entryDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hours:         z.number().positive().optional(),
  rate:          z.number().nonnegative().optional(),
  billable:      z.boolean().optional(),
  notes:         z.string().optional(),
}).strict();

const querySchema = z.object({
  caseId: z.coerce.number().int().positive().optional(),
}).strict();

interface TimeEntryRow {
  id:             number;
  case_id:        number;
  description_he: string;
  entry_date:     string;
  hours:          number;
  rate:           number;
  billable:       0 | 1;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
}

export function timeEntriesRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/time-entries?caseId=N
  router.get('/', validate(querySchema, 'query'), asyncHandler(async (req, res) => {
    const { caseId } = req.query as unknown as { caseId?: string };

    const rows = (caseId
      ? repos.db.prepare('SELECT * FROM TimeEntries WHERE case_id = ? ORDER BY entry_date DESC, id DESC')
          .all(Number(caseId))
      : repos.db.prepare('SELECT * FROM TimeEntries ORDER BY entry_date DESC, id DESC')
          .all()
    ) as TimeEntryRow[];

    const billableHours = rows.filter((r) => r.billable === 1).reduce((s, r) => s + r.hours, 0);
    const totalHours    = rows.reduce((s, r) => s + r.hours, 0);
    const totalAmount   = rows.filter((r) => r.billable === 1).reduce((s, r) => s + r.hours * r.rate, 0);

    ok(res, { entries: rows, summary: { totalHours, billableHours, totalAmount } });
  }));

  // POST /api/time-entries
  router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;

    if (!repos.cases.findById(b.caseId)) { fail(res, 'NOT_FOUND', 'תיק לא נמצא', 404); return; }

    const result = repos.db.prepare(`
      INSERT INTO TimeEntries (case_id, description_he, entry_date, hours, rate, billable, notes)
      VALUES (@caseId, @descriptionHe, @entryDate, @hours, @rate, @billable, @notes)
    `).run({
      caseId:        b.caseId,
      descriptionHe: b.descriptionHe,
      entryDate:     b.entryDate,
      hours:         b.hours,
      rate:          b.rate ?? 0,
      billable:      b.billable === false ? 0 : 1,
      notes:         b.notes ?? null,
    });

    const created = repos.db.prepare('SELECT * FROM TimeEntries WHERE id = ?')
      .get(result.lastInsertRowid) as TimeEntryRow;
    ok(res, created, 201);
  }));

  // PATCH /api/time-entries/:id
  router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    const b  = req.body as z.infer<typeof patchSchema>;

    const existing = repos.db.prepare('SELECT * FROM TimeEntries WHERE id = ?')
      .get(id) as TimeEntryRow | undefined;
    if (!existing) { fail(res, 'NOT_FOUND', 'לא נמצא', 404); return; }

    const parts: string[] = [];
    const params: Record<string, unknown> = { id };

    if (b.descriptionHe !== undefined) { parts.push('description_he = @descriptionHe'); params['descriptionHe'] = b.descriptionHe; }
    if (b.entryDate     !== undefined) { parts.push('entry_date = @entryDate');         params['entryDate']     = b.entryDate; }
    if (b.hours         !== undefined) { parts.push('hours = @hours');                  params['hours']         = b.hours; }
    if (b.rate          !== undefined) { parts.push('rate = @rate');                    params['rate']          = b.rate; }
    if (b.billable      !== undefined) { parts.push('billable = @billable');            params['billable']      = b.billable ? 1 : 0; }
    if (b.notes         !== undefined) { parts.push('notes = @notes');                  params['notes']         = b.notes; }

    if (parts.length === 0) { ok(res, existing); return; }

    parts.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    repos.db.prepare(`UPDATE TimeEntries SET ${parts.join(', ')} WHERE id = @id`).run(params);

    const updated = repos.db.prepare('SELECT * FROM TimeEntries WHERE id = ?').get(id) as TimeEntryRow;
    ok(res, updated);
  }));

  // DELETE /api/time-entries/:id
  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    const existing = repos.db.prepare('SELECT id FROM TimeEntries WHERE id = ?').get(id);
    if (!existing) { fail(res, 'NOT_FOUND', 'לא נמצא', 404); return; }

    repos.db.prepare('DELETE FROM TimeEntries WHERE id = ?').run(id);
    ok(res, { deleted: true });
  }));

  return router;
}
