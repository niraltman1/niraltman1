import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { runThreeStepTest } from '../utils/case-law-tester.js';

const createSchema = z.object({
  citation:      z.string().min(1),
  caseTitle:     z.string().optional(),
  courtLevel:    z.enum(['supreme','district','magistrate','administrative','other']).optional(),
  decisionDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  governingLaw:  z.string().optional(),
  offenseClause: z.string().optional(),
  summaryHe:     z.string().optional(),
  source:        z.enum(['uploaded','harvested','manual']).optional(),
}).strict();

const testSchema = z.object({
  caseId: z.number().int().positive(),
}).strict();

const listQuerySchema = z.object({
  source:  z.enum(['uploaded','harvested','manual']).optional(),
  search:  z.string().optional(),
  page:    z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(1).max(100).default(50),
}).strict();

interface CaseLawRow {
  id:            number;
  citation:      string;
  case_title:    string | null;
  court_level:   string | null;
  decision_date: string | null;
  governing_law: string | null;
  offense_clause:string | null;
  summary_he:    string | null;
  source:        string;
  created_at:    string;
}

interface CaseRow {
  id:            number;
  notes:         string | null;
  procedure_type:string | null;
  case_type:     string;
}

export function caseLawRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/case-law
  router.get('/', validate(listQuerySchema, 'query'), asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const page     = q.page;
    const pageSize = q.pageSize;
    const offset   = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.source) { conditions.push('source = ?'); params.push(q.source); }
    if (q.search) { conditions.push('(citation LIKE ? OR case_title LIKE ? OR summary_he LIKE ?)');
      const s = `%${q.search}%`;
      params.push(s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows  = repos.db.prepare(
      `SELECT * FROM global_case_law ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...params, pageSize, offset) as CaseLawRow[];

    const total = (repos.db.prepare(`SELECT COUNT(*) AS n FROM global_case_law ${where}`)
      .get(...params) as { n: number }).n;

    ok(res, { rows, total, page, pageSize });
  }));

  // POST /api/case-law
  router.post('/', validate(createSchema), asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const row = repos.db.prepare(`
      INSERT INTO global_case_law
        (citation, case_title, court_level, decision_date, governing_law,
         offense_clause, summary_he, source)
      VALUES
        (@citation, @caseTitle, @courtLevel, @decisionDate, @governingLaw,
         @offenseClause, @summaryHe, @source)
    `).run({
      citation:      b.citation,
      caseTitle:     b.caseTitle     ?? null,
      courtLevel:    b.courtLevel    ?? null,
      decisionDate:  b.decisionDate  ?? null,
      governingLaw:  b.governingLaw  ?? null,
      offenseClause: b.offenseClause ?? null,
      summaryHe:     b.summaryHe     ?? null,
      source:        b.source        ?? 'manual',
    });
    const created = repos.db.prepare('SELECT * FROM global_case_law WHERE id = ?')
      .get(row.lastInsertRowid) as CaseLawRow;
    ok(res, created, 201);
  }));

  // GET /api/case-law/:id
  router.get('/:id', asyncHandler(async (req, res) => {
    const id  = Number(req.params['id']);
    const row = repos.db.prepare('SELECT * FROM global_case_law WHERE id = ?')
      .get(id) as CaseLawRow | undefined;
    if (!row) { fail(res, 'NOT_FOUND', 'תקדים לא נמצא', 404); return; }

    const tests = repos.db.prepare(
      'SELECT * FROM case_law_relevance_tests WHERE case_law_id = ? ORDER BY tested_at DESC',
    ).all(id);

    ok(res, { ...row, relevance_tests: tests });
  }));

  // POST /api/case-law/:id/test
  router.post('/:id/test', validate(testSchema), asyncHandler(async (req, res) => {
    const lawId = Number(req.params['id']);
    const { caseId } = req.body as z.infer<typeof testSchema>;

    const lawRow = repos.db.prepare('SELECT * FROM global_case_law WHERE id = ?')
      .get(lawId) as CaseLawRow | undefined;
    if (!lawRow) { fail(res, 'NOT_FOUND', 'תקדים לא נמצא', 404); return; }

    const caseRow = repos.db.prepare('SELECT id, notes, procedure_type, case_type FROM Cases WHERE id = ?')
      .get(caseId) as CaseRow | undefined;
    if (!caseRow) { fail(res, 'NOT_FOUND', 'תיק לא נמצא', 404); return; }

    const result = await runThreeStepTest({
      citation:      lawRow.citation,
      caseTitle:     lawRow.case_title,
      summaryHe:     lawRow.summary_he,
      governingLaw:  lawRow.governing_law,
      offenseClause: lawRow.offense_clause,
      caseNotes:     caseRow.notes,
      procedureType: caseRow.procedure_type,
      caseType:      caseRow.case_type,
    });

    if (!result) {
      fail(res, 'AI_ERROR', 'מנוע ה-AI אינו זמין כרגע', 503);
      return;
    }

    const testRow = repos.db.prepare(`
      INSERT INTO case_law_relevance_tests
        (case_law_id, case_id, step1_passed, step2_passed, step3_passed, steps_passed,
         step1_reason, step2_reason, step3_reason, citation_string)
      VALUES
        (@lawId, @caseId, @s1, @s2, @s3, @sp,
         @r1, @r2, @r3, @cs)
    `).run({
      lawId,
      caseId,
      s1: result.step1Passed ? 1 : 0,
      s2: result.step2Passed ? 1 : 0,
      s3: result.step3Passed ? 1 : 0,
      sp: result.stepsPassed,
      r1: result.step1Reason,
      r2: result.step2Reason,
      r3: result.step3Reason,
      cs: result.citationString,
    });

    const saved = repos.db.prepare('SELECT * FROM case_law_relevance_tests WHERE id = ?')
      .get(testRow.lastInsertRowid);
    ok(res, { test: saved, badge: `[${result.stepsPassed}/3 Steps Passed]` });
  }));

  return router;
}
