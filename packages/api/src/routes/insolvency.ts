import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { notificationService } from '../utils/notification-service.js';

// Official Receiver Form 5 — Sections A–E
// Each object: { section, field_key, label_he }
const FORM5_SCHEMA: Array<{ section: 'A'|'B'|'C'|'D'|'E'; field_key: string; label_he: string }> = [
  // A — Personal Details
  { section:'A', field_key:'full_name_he',      label_he:'שם מלא בעברית' },
  { section:'A', field_key:'id_number',          label_he:'מספר תעודת זהות' },
  { section:'A', field_key:'date_of_birth',      label_he:'תאריך לידה' },
  { section:'A', field_key:'address',            label_he:'כתובת מגורים' },
  { section:'A', field_key:'marital_status',     label_he:'מצב משפחתי' },
  { section:'A', field_key:'dependents_count',   label_he:'מספר תלויים' },
  // B — Individual Assets
  { section:'B', field_key:'real_estate',        label_he:'נכסי מקרקעין' },
  { section:'B', field_key:'vehicles',           label_he:'כלי רכב' },
  { section:'B', field_key:'bank_accounts',      label_he:'חשבונות בנק' },
  { section:'B', field_key:'investments',        label_he:'השקעות וניירות ערך' },
  { section:'B', field_key:'pension_funds',      label_he:'קרנות פנסיה וגמל' },
  { section:'B', field_key:'other_assets',       label_he:'נכסים אחרים' },
  // C — Domestic Income Streams
  { section:'C', field_key:'employment_income',  label_he:'הכנסה מעבודה' },
  { section:'C', field_key:'rental_income',      label_he:'הכנסה מהשכרה' },
  { section:'C', field_key:'business_income',    label_he:'הכנסה מעסק' },
  { section:'C', field_key:'allowances',         label_he:'קצבאות ותמיכות' },
  { section:'C', field_key:'other_income',       label_he:'הכנסות אחרות' },
  // D — Liabilities
  { section:'D', field_key:'bank_debts',         label_he:'חובות לבנקים' },
  { section:'D', field_key:'tax_debts',          label_he:'חובות לרשות המסים' },
  { section:'D', field_key:'creditor_debts',     label_he:'חובות לנושים אחרים' },
  { section:'D', field_key:'mortgage',           label_he:'משכנתא' },
  { section:'D', field_key:'guarantees',         label_he:'ערבויות שנתת' },
  { section:'D', field_key:'total_liabilities',  label_he:'סך כל ההתחייבויות' },
  // E — Creditor Log
  { section:'E', field_key:'creditor_1',         label_he:'נושה 1 — שם, סכום, מקור חוב' },
  { section:'E', field_key:'creditor_2',         label_he:'נושה 2 — שם, סכום, מקור חוב' },
  { section:'E', field_key:'creditor_3',         label_he:'נושה 3 — שם, סכום, מקור חוב' },
  { section:'E', field_key:'creditor_4',         label_he:'נושה 4 — שם, סכום, מקור חוב' },
  { section:'E', field_key:'creditor_5',         label_he:'נושה 5 — שם, סכום, מקור חוב' },
  { section:'E', field_key:'total_creditors',    label_he:'סך נושים ועסקאות עם קרובים' },
  { section:'E', field_key:'bankruptcy_history', label_he:'היסטוריית פשיטת רגל קודמת' },
];

const initSchema = z.object({
  officialReceiver: z.string().optional(),
  trusteeName:      z.string().optional(),
}).strict();

const phaseSchema = z.object({
  phase: z.enum(['Pre_Filing','Judicial_Litigation']),
}).strict();

const checklistSchema = z.object({
  status: z.enum(['missing','partial','complete']),
  value:  z.string().optional(),
}).strict();

interface FilingRow {
  id:                 number;
  case_id:            number;
  phase:              string;
  official_receiver:  string | null;
  trustee_name:       string | null;
  form5_submitted_at: string | null;
  phase_changed_at:   string | null;
  created_at:         string;
  updated_at:         string;
}

interface ChecklistItem {
  id:         number;
  filing_id:  number;
  section:    string;
  field_key:  string;
  label_he:   string;
  status:     string;
  value:      string | null;
  updated_at: string;
}

interface ClientRow {
  name_he:        string;
  whatsapp_phone: string | null;
}

export function insolvencyRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/insolvency/:caseId
  router.get('/:caseId', asyncHandler(async (req, res) => {
    const caseId = Number(req.params['caseId']);
    const filing = repos.db.prepare('SELECT * FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as FilingRow | undefined;

    if (!filing) { ok(res, null); return; }

    const checklist = repos.db.prepare(
      'SELECT * FROM insolvency_checklist_items WHERE filing_id = ? ORDER BY section, id',
    ).all(filing.id) as ChecklistItem[];

    // Group checklist by section
    const bySection = checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
      (acc[item.section] ??= []).push(item);
      return acc;
    }, {});

    const total    = checklist.length;
    const complete = checklist.filter((i) => i.status === 'complete').length;

    ok(res, { filing, checklist: bySection, progress: { total, complete } });
  }));

  // POST /api/insolvency/:caseId/init
  router.post('/:caseId/init', validate(initSchema), asyncHandler(async (req, res) => {
    const caseId = Number(req.params['caseId']);
    const b      = req.body as z.infer<typeof initSchema>;

    const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?')
      .get(caseId) as { id: number } | undefined;
    if (!caseRow) { fail(res, 'NOT_FOUND', 'תיק לא נמצא', 404); return; }

    const existing = repos.db.prepare('SELECT id FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as { id: number } | undefined;
    if (existing) { fail(res, 'CONFLICT', 'תיק חדלות פירעון כבר קיים', 409); return; }

    // Set procedure_type to 'insolvency' on the case
    repos.db.prepare(`
      UPDATE Cases SET procedure_type = 'insolvency',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(caseId);

    const filingRow = repos.db.prepare(`
      INSERT INTO insolvency_filings (case_id, official_receiver, trustee_name)
      VALUES (@caseId, @officialReceiver, @trusteeName)
    `).run({
      caseId,
      officialReceiver: b.officialReceiver ?? null,
      trusteeName:      b.trusteeName      ?? null,
    });

    const filingId = Number(filingRow.lastInsertRowid);

    // Seed Form 5 checklist
    const insertItem = repos.db.prepare(`
      INSERT INTO insolvency_checklist_items (filing_id, section, field_key, label_he)
      VALUES (@filingId, @section, @fieldKey, @labelHe)
    `);
    for (const item of FORM5_SCHEMA) {
      insertItem.run({ filingId, section: item.section, fieldKey: item.field_key, labelHe: item.label_he });
    }

    const filing = repos.db.prepare('SELECT * FROM insolvency_filings WHERE id = ?')
      .get(filingId);
    ok(res, filing, 201);
  }));

  // PATCH /api/insolvency/:caseId/phase
  router.patch('/:caseId/phase', validate(phaseSchema), asyncHandler(async (req, res) => {
    const caseId = Number(req.params['caseId']);
    const { phase } = req.body as { phase: string };

    const filing = repos.db.prepare('SELECT * FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as FilingRow | undefined;
    if (!filing) { fail(res, 'NOT_FOUND', 'לא נמצא תיק חדלות פירעון', 404); return; }

    if (phase === 'Judicial_Litigation') {
      const gaps = repos.db.prepare(
        `SELECT COUNT(*) AS n FROM insolvency_checklist_items
         WHERE filing_id = ? AND status != 'complete'`,
      ).get(filing.id) as { n: number };
      if (gaps.n > 0) {
        fail(res, 'INCOMPLETE_CHECKLIST',
          `לא ניתן לעבור לשלב שני — ${gaps.n} שדות עדיין חסרים`, 422);
        return;
      }
    }

    repos.db.prepare(`
      UPDATE insolvency_filings
      SET phase = @phase, phase_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `).run({ phase, id: filing.id });

    ok(res, repos.db.prepare('SELECT * FROM insolvency_filings WHERE id = ?').get(filing.id));
  }));

  // PATCH /api/insolvency/:caseId/checklist/:fieldKey
  router.patch('/:caseId/checklist/:fieldKey', validate(checklistSchema), asyncHandler(async (req, res) => {
    const caseId   = Number(req.params['caseId']);
    const fieldKey = req.params['fieldKey']!;
    const b        = req.body as z.infer<typeof checklistSchema>;

    const filing = repos.db.prepare('SELECT id FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as { id: number } | undefined;
    if (!filing) { fail(res, 'NOT_FOUND', 'לא נמצא תיק חדלות פירעון', 404); return; }

    const item = repos.db.prepare(
      'SELECT id FROM insolvency_checklist_items WHERE filing_id = ? AND field_key = ?',
    ).get(filing.id, fieldKey) as { id: number } | undefined;
    if (!item) { fail(res, 'NOT_FOUND', 'שדה לא נמצא', 404); return; }

    repos.db.prepare(`
      UPDATE insolvency_checklist_items
      SET status = @status, value = @value,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `).run({ status: b.status, value: b.value ?? null, id: item.id });

    ok(res, repos.db.prepare('SELECT * FROM insolvency_checklist_items WHERE id = ?').get(item.id));
  }));

  // GET /api/insolvency/:caseId/form5-gaps
  router.get('/:caseId/form5-gaps', asyncHandler(async (req, res) => {
    const caseId = Number(req.params['caseId']);
    const filing = repos.db.prepare('SELECT id FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as { id: number } | undefined;
    if (!filing) { fail(res, 'NOT_FOUND', 'לא נמצא תיק חדלות פירעון', 404); return; }

    const gaps = repos.db.prepare(`
      SELECT section, field_key, label_he, status, value
      FROM insolvency_checklist_items
      WHERE filing_id = ? AND status != 'complete'
      ORDER BY section, id
    `).all(filing.id) as ChecklistItem[];

    const bySection = gaps.reduce<Record<string, ChecklistItem[]>>((acc, g) => {
      (acc[g.section] ??= []).push(g);
      return acc;
    }, {});

    ok(res, { gapCount: gaps.length, bySection });
  }));

  // POST /api/insolvency/:caseId/form5-notify
  router.post('/:caseId/form5-notify', asyncHandler(async (req, res) => {
    const caseId = Number(req.params['caseId']);

    const filing = repos.db.prepare('SELECT id FROM insolvency_filings WHERE case_id = ?')
      .get(caseId) as { id: number } | undefined;
    if (!filing) { fail(res, 'NOT_FOUND', 'לא נמצא תיק חדלות פירעון', 404); return; }

    const caseRow = repos.db.prepare(
      'SELECT case_number, client_id FROM Cases WHERE id = ?',
    ).get(caseId) as { case_number: string; client_id: number } | undefined;
    if (!caseRow) { fail(res, 'NOT_FOUND', 'תיק לא נמצא', 404); return; }

    const client = repos.db.prepare(
      'SELECT name_he, whatsapp_phone FROM Clients WHERE id = ?',
    ).get(caseRow.client_id) as ClientRow | undefined;

    if (!client?.whatsapp_phone) {
      fail(res, 'NO_PHONE', 'ללקוח אין מספר WhatsApp מוגדר', 422);
      return;
    }

    const gaps = repos.db.prepare(`
      SELECT section, label_he FROM insolvency_checklist_items
      WHERE filing_id = ? AND status != 'complete'
      ORDER BY section, id
    `).all(filing.id) as Array<{ section: string; label_he: string }>;

    if (gaps.length === 0) {
      ok(res, { sent: false, message: 'כל הפרטים הושלמו — אין צורך בתזכורת' });
      return;
    }

    const grouped = gaps.reduce<Record<string, string[]>>((acc, g) => {
      (acc[g.section] ??= []).push(g.label_he);
      return acc;
    }, {});

    const lines = [
      `שלום ${client.name_he},`,
      `לגבי תיק ${caseRow.case_number} — פרטים חסרים לטופס 5:`,
    ];
    for (const [section, labels] of Object.entries(grouped)) {
      lines.push(`\nסעיף ${section}:`);
      for (const l of labels) lines.push(`  • ${l}`);
    }
    lines.push('\nאנא השלם/י את הפרטים בהקדם. תודה.');

    await notificationService.send(client.whatsapp_phone, lines.join('\n'));
    ok(res, { sent: true, gapCount: gaps.length, phone: client.whatsapp_phone });
  }));

  return router;
}
