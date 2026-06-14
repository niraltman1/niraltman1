/**
 * Local RAG Worker — background Ollama service for legal document enrichment.
 *
 * Uses the law-il-E2B model (or OLLAMA_MODEL env override) with a
 * Semi-Formal 5-step reasoning system prompt optimised for Israeli court documents.
 *
 * Extracts per document:
 *   - caseNumber    מספר תיק  (formats: 1234-05-26, תפ"ח, תד, ע"פ, רת"פ)
 *   - courtName     שם בית המשפט + סמכות מקומית
 *   - judgeName     שם השופט/ת
 *   - offenseType   סוג העבירה / ענין המשפטי
 *   - charges[]     סעיפי אישום
 *   - nextHearing   מועד דיון קרוב (ISO 8601)
 *   - procedureType traffic_administrative | traffic_criminal | civil
 *   - documentType  סיווג מסמך
 *   - confidence    0.0–1.0
 *
 * Writes to: DocumentInsights, Documents.ai_enriched,
 *            Cases.judge_name / court_name / procedure_type (when case matched)
 *
 * Procedure Router: detects "הזמנה לדין" → switches traffic_administrative → traffic_criminal
 */

import type { Repos } from '../db.js';
import { enrichCanvasFields } from '../modules/canvas/canvas-document-enricher.js';
import { discoverFields } from './field-discovery.js';
import { routeEntities } from './entity-router.js';
import { populateEntityGraph } from './entity-graph.js';
import { isSystemIdle } from './idle-throttle.js';
import { withWriteLock } from './write-mutex.js';
import { emitActivity } from './activity-emitter.js';
import { searchPrecedentContext, formatPrecedentContext } from './precedent-search.js';
import { logger } from '@factum-il/shared';
import type { EventBus } from '@factum-il/events';
import { selectModel } from '@factum-il/model-router';
import { runGuardrails } from '@factum-il/ai-guardrails';
import { orchestrator } from '@factum-il/orchestrator';
import { extensionPoints } from '@factum-il/sdk';

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
// Model resolved via model-router at runtime; env override still respected for legacy compat
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
// Catch-up sweep interval — event-driven processing handles immediate triggers
const INTERVAL_MS  = Number(process.env['RAG_INTERVAL_MS'] ?? 300_000);
const BATCH_SIZE   = Number(process.env['RAG_BATCH_SIZE']  ?? 3);

const CASE_NUMBER_RE = /(\d{1,5}[-–]\d{2}[-–]\d{2,6}|ת["״]פ\s*\d+|ת["״]ד\s*\d+|ע["״]פ\s*\d+|רת["״]פ\s*\d+)/;
const JUDGE_RE       = /(?:השופט(?:ת)?|כב[׳']|כבוד(?:\s+ה)?שופט(?:ת)?)\s+([א-ת][א-ת\s"׳'-]{1,25})/i;
const SUMMONS_RE     = /הזמנה\s+לדין|הזמנה\s+לבית\s+המשפט|כתב\s+אישום/i;

interface RagExtraction {
  caseNumber:    string | null;
  courtName:     string | null;
  judgeName:     string | null;
  offenseType:   string | null;
  charges:       string[];
  nextHearing:   string | null;
  procedureType: 'traffic_administrative' | 'traffic_criminal' | 'civil' | null;
  documentType:  string | null;
  confidence:    number;
}

const SYSTEM_PROMPT = `אתה מנתח מסמכים משפטיים ישראליים.
תפקידך לחלץ שדות מובנים מטקסט OCR של מסמכי בית משפט.
החזר JSON בלבד — ללא הסברים, ללא markdown, ללא טקסט לפני או אחרי.

פורמט נדרש (כל השדות חייבים להופיע):
{
  "caseNumber":    "<מספר תיק כגון 1234-05-26 | null>",
  "courtName":     "<שם בית המשפט וסמכות מקומית | null>",
  "judgeName":     "<שם השופט/ת המלא | null>",
  "offenseType":   "<סוג העבירה/ענין המשפטי | null>",
  "charges":       ["<סעיף אישום 1>"],
  "nextHearing":   "<ISO 8601 YYYY-MM-DD | null>",
  "procedureType": "<traffic_administrative | traffic_criminal | civil | null>",
  "documentType":  "<court_ruling|petition|summons|contract|power_of_attorney|correspondence|invoice|evidence|protocol|other>",
  "confidence":    <0.0–1.0>
}

כלל קריטי: אל תמציא נתונים. אם שדה אינו מופיע מפורשות — החזר null.`;

async function extractWithOllama(
  ocrText:          string,
  precedentContext?: string,
): Promise<{ extraction: RagExtraction; raw: string } | null> {
  const excerpt = ocrText.slice(0, 2500);
  const userPrompt = precedentContext
    ? `${precedentContext}\n\nכעת נתח את המסמך הבא וחלץ את השדות המבוקשים:\n\n${excerpt}`
    : `נתח את הטקסט הבא וחלץ את השדות המבוקשים:\n\n${excerpt}`;
  let body: string;
  try {
    body = JSON.stringify({
      model:  OLLAMA_MODEL,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      stream: false,
      options: { temperature: 0.1, repeat_penalty: 1.05, num_predict: 400 },
    });
  } catch { return null; }

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:  AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;

    const data    = await res.json() as { response?: string };
    const raw     = (data.response ?? '').trim();
    const jsonStr = raw.startsWith('```')
      ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : raw;

    const parsed = JSON.parse(jsonStr) as Partial<RagExtraction>;
    return {
      raw,
      extraction: {
        caseNumber:    validateCaseNumber(parsed.caseNumber ?? null, ocrText),
        courtName:     parsed.courtName    ?? null,
        judgeName:     validateJudgeName(parsed.judgeName ?? null, ocrText),
        offenseType:   parsed.offenseType  ?? null,
        charges:       Array.isArray(parsed.charges) ? parsed.charges : [],
        nextHearing:   validateDate(parsed.nextHearing ?? null),
        procedureType: parsed.procedureType ?? null,
        documentType:  parsed.documentType ?? null,
        confidence:    typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence)) : 0.3,
      },
    };
  } catch { return null; }
}

function validateCaseNumber(candidate: string | null, text: string): string | null {
  if (!candidate) return null;
  if (text.includes(candidate) || CASE_NUMBER_RE.test(candidate)) return candidate;
  const m = CASE_NUMBER_RE.exec(text);
  return m ? (m[1] ?? null) : null;
}

function validateJudgeName(candidate: string | null, text: string): string | null {
  if (!candidate) return null;
  if (text.includes(candidate)) return candidate;
  const m = JUDGE_RE.exec(text);
  return m ? (m[1]?.trim() ?? null) : null;
}

function validateDate(candidate: string | null): string | null {
  if (!candidate) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function applyExtraction(repos: Repos, docId: number, ext: RagExtraction, raw: string): { caseId: number | null } {
  const VALID_TYPES = new Set([
    'court_ruling','petition','summons','contract','power_of_attorney',
    'correspondence','invoice','evidence','protocol','other',
  ]);
  const docType = VALID_TYPES.has(ext.documentType ?? '') ? ext.documentType : 'other';
  const verificationState = ext.confidence < 0.7 ? 'review_required' : 'unverified';

  return repos.db.transaction<{ caseId: number | null }>(() => {
    repos.db.prepare(`
      INSERT INTO DocumentInsights
        (document_id, case_number, court_name, judge_name, offense_type,
         next_hearing, charges, confidence, model_used, raw_response,
         ai_model_version, extraction_method, verification_state)
      VALUES
        (@docId, @caseNumber, @courtName, @judgeName, @offenseType,
         @nextHearing, @charges, @confidence, @modelUsed, @rawResponse,
         @modelUsed, 'ai', @verificationState)
      ON CONFLICT(document_id) DO UPDATE SET
        case_number  = excluded.case_number,
        court_name   = excluded.court_name,
        judge_name   = excluded.judge_name,
        offense_type = excluded.offense_type,
        next_hearing = excluded.next_hearing,
        charges      = excluded.charges,
        confidence   = excluded.confidence,
        model_used   = excluded.model_used,
        raw_response = excluded.raw_response,
        ai_model_version  = excluded.ai_model_version,
        extraction_method = excluded.extraction_method,
        verification_state = excluded.verification_state,
        extracted_at = datetime('now')
    `).run({
      docId,
      caseNumber:  ext.caseNumber,
      courtName:   ext.courtName,
      judgeName:   ext.judgeName,
      offenseType: ext.offenseType,
      nextHearing: ext.nextHearing,
      charges:     JSON.stringify(ext.charges),
      confidence:  ext.confidence,
      modelUsed:   OLLAMA_MODEL,
      rawResponse: raw,
      verificationState,
    });

    repos.db.prepare(`
      UPDATE Documents
      SET document_type = COALESCE(document_type, @docType),
          ai_enriched   = 1,
          updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `).run({ id: docId, docType });

    let caseId: number | null = null;
    if (ext.caseNumber) {
      const caseRow = repos.db.prepare(
        `SELECT id, procedure_type FROM Cases WHERE case_number = ?`,
      ).get(ext.caseNumber) as { id: number; procedure_type: string | null } | undefined;

      if (caseRow) {
        caseId = caseRow.id;
        let newProcType = ext.procedureType ?? caseRow.procedure_type;
        if (SUMMONS_RE.test(ext.offenseType ?? '') || ext.documentType === 'summons') {
          if (caseRow.procedure_type === 'traffic_administrative') {
            newProcType = 'traffic_criminal';
            logger.info(`Procedure Router: case ${ext.caseNumber} admin → criminal (summons)`, { category: 'ai' });
          }
        }
        repos.db.prepare(`
          UPDATE Cases
          SET court_name     = COALESCE(court_name, @courtName),
              judge_name     = COALESCE(judge_name, @judgeName),
              procedure_type = COALESCE(procedure_type, @procedureType),
              updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = @id
        `).run({ id: caseRow.id, courtName: ext.courtName, judgeName: ext.judgeName, procedureType: newProcType });
      }
    }
    return { caseId };
  });
}

async function runCycle(repos: Repos, targetDocumentId?: number): Promise<void> {
  // Targeted single-doc processing (event-driven) skips idle check
  if (targetDocumentId === undefined && !isSystemIdle()) return;

  const pending = targetDocumentId !== undefined
    ? repos.db.prepare(`
        SELECT id, ocr_text, storage_path FROM Documents
        WHERE id = ? AND ai_enriched = 0 AND ocr_text IS NOT NULL
      `).all(targetDocumentId) as { id: number; ocr_text: string; storage_path: string }[]
    : repos.db.prepare(`
        SELECT id, ocr_text, storage_path FROM Documents
        WHERE ai_enriched = 0
          AND ocr_text IS NOT NULL
          AND length(ocr_text) > 50
        ORDER BY created_at ASC
        LIMIT ?
      `).all(BATCH_SIZE) as { id: number; ocr_text: string; storage_path: string }[];

  for (const doc of pending) {
    if (!orchestrator.acquireLock(doc.id, repos.db)) continue;
    try {
      try {
      // Step 0: Retrieve relevant precedent context — inject legal_questions + factual_summary
      // into the prompt so the model reasons from known similar verdicts.
      const precedents       = searchPrecedentContext(doc.ocr_text.slice(0, 400), repos.db, 3);
      const precedentContext = precedents.length > 0 ? formatPrecedentContext(precedents) : undefined;
      const result = await extractWithOllama(doc.ocr_text, precedentContext);
      if (result) {
        const guardrailResult = runGuardrails(
          {
            caseNumber:    result.extraction.caseNumber,
            courtName:     result.extraction.courtName,
            judgeName:     result.extraction.judgeName,
            offenseType:   result.extraction.offenseType,
            charges:       result.extraction.charges,
            nextHearing:   result.extraction.nextHearing,
            procedureType: result.extraction.procedureType,
            documentType:  result.extraction.documentType,
            confidence:    result.extraction.confidence,
          },
          { ocrText: doc.ocr_text, documentId: doc.id },
        );
        if (!guardrailResult.shouldApply) {
          logger.warn(
            `RAG guardrail FAIL doc=${doc.id}: ${guardrailResult.results.map(r => r.message).join('; ')}`,
            { category: 'ai' },
          );
          continue;  // skip applyExtraction — don't persist bad data
        }
        if (guardrailResult.flagForReview) {
          logger.warn(`RAG guardrail WARN doc=${doc.id}: flagged for review`, { category: 'ai' });
          // still apply, but log the warning
        }

        const { caseId } = await withWriteLock('rag-worker:applyExtraction', () =>
          applyExtraction(repos, doc.id, result.extraction, result.raw),
        );
        try { orchestrator.transitionStage(doc.id, 'ENTITY_EXTRACTION_DONE', 'COMPLETED', repos.db); } catch { /* non-critical */ }

        // Persist the knowledge graph (judge/court/case entities + relations).
        // Runs AFTER the extraction transaction has committed and is fully isolated:
        // a failure here must never roll back or block the extraction (CLAUDE.md §4).
        try {
          populateEntityGraph(repos.db, {
            documentId: doc.id,
            caseId,
            caseNumber: result.extraction.caseNumber,
            courtName:  result.extraction.courtName,
            judgeName:  result.extraction.judgeName,
          });
        } catch (err) {
          logger.warn(`entity-graph population failed doc=${doc.id}: ${String(err)}`, { category: 'ai' });
        }
        try { orchestrator.transitionStage(doc.id, 'INDEXING_DONE', 'COMPLETED', repos.db); } catch { /* non-critical */ }

        const fields = discoverFields(doc.ocr_text);
        void routeEntities(repos, {
          documentId:       doc.id,
          discoveredFields: fields,
          ragExtraction: {
            caseNumber:    result.extraction.caseNumber,
            courtName:     result.extraction.courtName,
            judgeName:     result.extraction.judgeName,
            offenseType:   result.extraction.offenseType,
            procedureType: result.extraction.procedureType ?? null,
            documentType:  result.extraction.documentType,
            confidence:    result.extraction.confidence,
          },
        }).catch(() => {});
        try { orchestrator.transitionStage(doc.id, 'MEMORY_WRITTEN', 'COMPLETED', repos.db); } catch { /* non-critical */ }
        void enrichCanvasFields(repos.db, doc.id, doc.ocr_text, doc.storage_path ?? '').catch(() => {});
        emitActivity(repos, {
          kind:       'entities_extracted',
          documentId: doc.id,
          ...(caseId != null ? { caseId } : {}),
          source:     'scheduler:rag-worker',
          confidence: result.extraction.confidence,
          message:    `${result.extraction.documentType ?? 'unknown'} — ${result.extraction.caseNumber ?? '—'}`,
        });
        try { orchestrator.transitionStage(doc.id, 'READY_FOR_AGENTS', 'COMPLETED', repos.db); } catch { /* non-critical */ }
        extensionPoints.fireDocumentIngested(doc.id).catch(() => {});
        logger.info(
          `RAG doc=${doc.id} type=${result.extraction.documentType ?? '?'} ` +
          `case=${result.extraction.caseNumber ?? '—'} conf=${result.extraction.confidence.toFixed(2)}`,
          { category: 'ai', operationId: String(doc.id) },
        );
      }
      } catch (e) {
        logger.error(`RAG failed doc=${doc.id}: ${e instanceof Error ? e.message : String(e)}`, { category: 'ai' });
        emitActivity(repos, {
          kind:       'queue_failure',
          documentId: doc.id,
          source:     'scheduler:rag-worker',
          message:    e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      orchestrator.releaseLock(doc.id, repos.db);
    }
  }
}

let _timer:    ReturnType<typeof setInterval> | null = null;
let _eventBus: EventBus | null = null;

export function startRagWorker(repos: Repos, eventBus?: EventBus): void {
  if (_timer) return;

  // Resolve model via router; fall back to env var if router can't route
  const routeResult = selectModel({ task: 'enrich' });
  const resolvedModel = routeResult.ok ? routeResult.model.config.ollamaName : OLLAMA_MODEL;

  logger.info(
    `RAG worker started — sweep=${INTERVAL_MS / 1000}s batch=${BATCH_SIZE} model=${resolvedModel} eventDriven=${!!eventBus}`,
    { category: 'ai' },
  );

  // Event-driven trigger: process immediately when OCR completes.
  // Store bus reference so stopRagWorker() can unsubscribe and prevent listener leaks.
  if (eventBus) {
    _eventBus = eventBus;
    eventBus.subscribe('OCRCompleted', 'rag-worker:enrich', async (event) => {
      logger.info(`RAG: OCRCompleted event for doc=${event.documentId}`, { category: 'ai' });
      await runCycle(repos, event.documentId);
    });
  }

  // Catch-up sweep for documents that missed the event (reduced from 60s → 300s)
  void runCycle(repos);
  _timer = setInterval(() => void runCycle(repos), INTERVAL_MS);
  _timer.unref();
}

export function stopRagWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  if (_eventBus) {
    _eventBus.unsubscribe('OCRCompleted', 'rag-worker:enrich');
    _eventBus = null;
  }
  logger.info('RAG worker stopped', { category: 'ai' });
}
