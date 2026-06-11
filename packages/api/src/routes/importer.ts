import { Router } from 'express';
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { importNetHaMishpatCSV } from '../utils/net-hamishpat-parser.js';
import { mineArchive }           from '../utils/archive-miner.js';
import { importExcelFile }       from '../utils/excel-importer.js';

const importSchema = z.object({
  filePath: z.string().min(1),
}).strict();

const excelSchema = z.object({
  filePath:   z.string().min(1),
  sourceType: z.enum(['net_hamishpat','execution_office','generic']).default('generic'),
}).strict();

const icalSchema = z.object({
  filePath: z.string().min(1),
}).strict();

const archiveSchema = z.object({
  rootDir:   z.string().min(1),
  limit:     z.number().int().positive().max(50_000).optional(),
  outputDir: z.string().optional(),
  force:     z.boolean().optional(),
}).strict();

export function importerRouter(repos: Repos): Router {
  const router = Router();

  /**
   * POST /api/importer/net-hamishpat
   * Body: { filePath: "/absolute/path/to/export.csv" }
   * Imports court case data from a Net HaMishpat CSV export.
   */
  router.post('/net-hamishpat', validate(importSchema), asyncHandler(async (req, res) => {
    const { filePath } = req.body as z.infer<typeof importSchema>;
    const result = await importNetHaMishpatCSV(repos, filePath);
    ok(res, result);
  }));

  /**
   * POST /api/importer/archive-mine
   * Body: { rootDir: "/path/to/legacy", limit?: 5000, outputDir?: "/path/to/out" }
   * Recursively scans a legacy folder and ingests all eligible files
   * through the Vacuum Protocol (dedup + OCR + field discovery).
   */
  router.post('/archive-mine', validate(archiveSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof archiveSchema>;
    const result = await mineArchive(repos, {
      rootDir: body.rootDir,
      ...(body.limit     !== undefined && { limit:     body.limit }),
      ...(body.outputDir !== undefined && { outputDir: body.outputDir }),
      ...(body.force     !== undefined && { force:     body.force }),
    });
    ok(res, result);
  }));

  /**
   * POST /api/importer/excel
   * Body: { filePath: "/absolute/path/to/file.xlsx", sourceType?: "net_hamishpat"|"execution_office"|"generic" }
   * Fuzzy-maps Excel/CSV columns via law-il-E2B and upserts records incrementally.
   */
  router.post('/excel', validate(excelSchema), asyncHandler(async (req, res) => {
    const { filePath, sourceType } = req.body as z.infer<typeof excelSchema>;
    if (!existsSync(filePath)) { fail(res, 'NOT_FOUND', `קובץ לא נמצא: ${filePath}`, 404); return; }
    const filename = filePath.split('/').pop() ?? filePath;
    const result = await importExcelFile(repos, filePath, sourceType, filename);
    ok(res, result);
  }));

  /**
   * POST /api/importer/ical
   * Body: { filePath: "/absolute/path/to/calendar.ics" }
   * Parses court hearing events and cross-matches against active cases.
   */
  router.post('/ical', validate(icalSchema), asyncHandler(async (req, res) => {
    const filePath = resolve((req.body as z.infer<typeof icalSchema>).filePath); // normalize before any fs operation (CWE-22)
    if (!existsSync(filePath)) { fail(res, 'NOT_FOUND', `קובץ לא נמצא: ${filePath}`, 404); return; }
    const raw = readFileSync(filePath, 'utf8');
    const events = parseIcalEvents(raw);
    let imported = 0;
    let skipped  = 0;

    const CASE_RE = /(\d{1,5}[-–]\d{2}[-–]\d{2,6}|ת["״]פ\s*\d+|ת["״]ד\s*\d+|ע["״]פ\s*\d+)/;
    const JUDGE_RE_IC = /(?:השופט(?:ת)?|כב[׳']|שופט(?:ת)?)\s+([א-ת][א-ת\s"׳'-]{1,25})/i;
    const HEARING_TYPE_RE = /(?:דיון|הקראה|גזר דין|שמיעת עדים|טרום משפט|הכרעת דין|פסק דין)/i;

    for (const ev of events) {
      if (!ev.dtstart) { skipped++; continue; }

      const text       = `${ev.summary ?? ''} ${ev.description ?? ''}`;
      const caseMatch  = CASE_RE.exec(text);
      const caseNumber = caseMatch ? caseMatch[0]!.trim() : null;
      const judgeMatch = JUDGE_RE_IC.exec(text);
      const judgeStr   = judgeMatch ? judgeMatch[1]!.trim() : null;
      const typeMatch  = HEARING_TYPE_RE.exec(text);
      const hearingType = typeMatch ? typeMatch[0] : null;

      const { date: hearingDate, time: hearingTime } = parseDtstart(ev.dtstart);

      let caseId: number | null = null;
      if (caseNumber) {
        const c = repos.db.prepare('SELECT id FROM Cases WHERE case_number = ? LIMIT 1')
          .get(caseNumber) as { id: number } | undefined;
        if (c) caseId = c.id;
      }

      try {
        repos.db.prepare(`
          INSERT OR REPLACE INTO court_hearings
            (case_id, case_number, hearing_date, hearing_time, courtroom,
             judge_name, hearing_type, ical_uid, raw_summary)
          VALUES
            (@caseId, @caseNumber, @hearingDate, @hearingTime, @courtroom,
             @judgeName, @hearingType, @uid, @rawSummary)
        `).run({
          caseId,
          caseNumber,
          hearingDate,
          hearingTime,
          courtroom:   ev.location,
          judgeName:   judgeStr,
          hearingType,
          uid:         ev.uid,
          rawSummary:  ev.summary,
        });
        imported++;
      } catch { skipped++; }
    }

    ok(res, { total: events.length, imported, skipped });
  }));

  return router;
}

// ── iCal helpers ─────────────────────────────────────────────────────────────

interface IcalEvent {
  uid:         string | null;
  dtstart:     string | null;
  summary:     string | null;
  description: string | null;
  location:    string | null;
}

function parseIcalEvents(raw: string): IcalEvent[] {
  return raw.split('BEGIN:VEVENT')
    .slice(1)
    .map((block) => {
      const get = (key: string): string | null => {
        const m = block.match(new RegExp(`^${key}[;:](.+)$`, 'm'));
        return m ? m[1]!.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim() : null;
      };
      return {
        uid:         get('UID'),
        dtstart:     get('DTSTART'),
        summary:     get('SUMMARY'),
        description: get('DESCRIPTION'),
        location:    get('LOCATION'),
      };
    });
}

function parseDtstart(dtstart: string): { date: string; time: string | null } {
  // Format: YYYYMMDDTHHMMSS or YYYYMMDD
  const full = dtstart.replace(/[TZ]/g, '');
  const date = full.length >= 8
    ? `${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6, 8)}`
    : dtstart;
  const time = full.length >= 14
    ? `${full.slice(8, 10)}:${full.slice(10, 12)}`
    : null;
  return { date, time };
}
