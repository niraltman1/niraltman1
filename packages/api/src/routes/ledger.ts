import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';

const createSchema = z.object({
  clientId:      z.number().int().positive(),
  descriptionHe: z.string().min(1),
  totalAmount:   z.number().nonnegative(),
  dueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidAmount:    z.number().nonnegative().optional(),
  invoiceNumber: z.string().optional(),
  receiptNumber: z.string().optional(),
  morningDocUrl: z.string().url().optional(),
  notes:         z.string().optional(),
}).strict();

const patchSchema = z.object({
  paidAmount:    z.number().nonnegative().optional(),
  invoiceNumber: z.string().optional(),
  receiptNumber: z.string().optional(),
  morningDocUrl: z.string().url().optional(),
  notes:         z.string().optional(),
}).strict();

const querySchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
}).strict();

interface ScheduleRow {
  id:             number;
  client_id:      number;
  description_he: string;
  total_amount:   number;
  paid_amount:    number;
  due_date:       string;
  payment_status: 'PENDING' | 'PAID' | 'OVERDUE';
  invoice_number: string | null;
  receipt_number: string | null;
  morning_doc_url: string | null;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
}

interface ScheduleWithDelta extends ScheduleRow {
  overdue_days: number;
}

function withOverdueDays(row: ScheduleRow): ScheduleWithDelta {
  const today   = new Date();
  const due     = new Date(row.due_date);
  const deltaDays = row.payment_status === 'OVERDUE'
    ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000))
    : 0;
  return { ...row, overdue_days: deltaDays };
}

export function ledgerRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/ledger?clientId=N
  router.get('/', validate(querySchema, 'query'), asyncHandler(async (req, res) => {
    const { clientId } = req.query as { clientId?: string };

    // Sweep overdue rows first
    repos.db.prepare(`
      UPDATE client_payment_schedules
      SET payment_status = 'OVERDUE',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE payment_status = 'PENDING'
        AND due_date < date('now')
    `).run();

    const rows = (clientId
      ? repos.db.prepare('SELECT * FROM client_payment_schedules WHERE client_id = ? ORDER BY due_date ASC')
          .all(Number(clientId))
      : repos.db.prepare('SELECT * FROM client_payment_schedules ORDER BY due_date ASC')
          .all()
    ) as ScheduleRow[];

    const enriched = rows.map(withOverdueDays);

    // Compute summary totals
    const totalAmount  = enriched.reduce((s, r) => s + r.total_amount, 0);
    const clearedFunds = enriched.reduce((s, r) => s + r.paid_amount, 0);
    const openBalance  = totalAmount - clearedFunds;

    ok(res, { schedules: enriched, summary: { totalAmount, clearedFunds, openBalance } });
  }));

  // POST /api/ledger
  router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const row = repos.db.prepare(`
      INSERT INTO client_payment_schedules
        (client_id, description_he, total_amount, paid_amount, due_date,
         invoice_number, receipt_number, morning_doc_url, notes)
      VALUES
        (@clientId, @descriptionHe, @totalAmount, @paidAmount, @dueDate,
         @invoiceNumber, @receiptNumber, @morningDocUrl, @notes)
    `).run({
      clientId:      b.clientId,
      descriptionHe: b.descriptionHe,
      totalAmount:   b.totalAmount,
      paidAmount:    b.paidAmount ?? 0,
      dueDate:       b.dueDate,
      invoiceNumber: b.invoiceNumber ?? null,
      receiptNumber: b.receiptNumber ?? null,
      morningDocUrl: b.morningDocUrl ?? null,
      notes:         b.notes ?? null,
    });
    const created = repos.db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
      .get(row.lastInsertRowid) as ScheduleRow;
    ok(res, withOverdueDays(created), 201);
  }));

  // PATCH /api/ledger/:id
  router.patch('/:id', validate(patchSchema), asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    const b  = req.body as z.infer<typeof patchSchema>;

    const existing = repos.db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
      .get(id) as ScheduleRow | undefined;
    if (!existing) { fail(res, 'NOT_FOUND', 'לא נמצא', 404); return; }

    const parts: string[] = [];
    const params: Record<string, unknown> = { id };

    if (b.paidAmount    !== undefined) { parts.push('paid_amount = @paidAmount');       params['paidAmount']    = b.paidAmount; }
    if (b.invoiceNumber !== undefined) { parts.push('invoice_number = @invoiceNumber'); params['invoiceNumber'] = b.invoiceNumber; }
    if (b.receiptNumber !== undefined) { parts.push('receipt_number = @receiptNumber'); params['receiptNumber'] = b.receiptNumber; }
    if (b.morningDocUrl !== undefined) { parts.push('morning_doc_url = @morningDocUrl'); params['morningDocUrl'] = b.morningDocUrl; }
    if (b.notes         !== undefined) { parts.push('notes = @notes');                  params['notes']         = b.notes; }

    if (parts.length === 0) { ok(res, withOverdueDays(existing)); return; }

    parts.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    repos.db.prepare(`UPDATE client_payment_schedules SET ${parts.join(', ')} WHERE id = @id`)
      .run(params);

    const updated = repos.db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
      .get(id) as ScheduleRow;
    ok(res, withOverdueDays(updated));
  }));

  // POST /api/ledger/:id/mark-paid
  router.post('/:id/mark-paid', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    const existing = repos.db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
      .get(id) as ScheduleRow | undefined;
    if (!existing) { fail(res, 'NOT_FOUND', 'לא נמצא', 404); return; }

    repos.db.prepare(`
      UPDATE client_payment_schedules
      SET payment_status = 'PAID',
          paid_amount    = total_amount,
          updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(id);

    const updated = repos.db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
      .get(id) as ScheduleRow;
    ok(res, withOverdueDays(updated));
  }));

  // POST /api/ledger/overdue-sweep
  router.post('/overdue-sweep', asyncHandler(async (_req, res) => {
    const info = repos.db.prepare(`
      UPDATE client_payment_schedules
      SET payment_status = 'OVERDUE',
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE payment_status = 'PENDING' AND due_date < date('now')
    `).run();
    ok(res, { updated: info.changes });
  }));

  return router;
}
