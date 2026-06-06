/**
 * Judgment Library Ingestion — ingest court verdicts from a local folder into the
 * PrecedentDocuments table and the retrieval index (DocumentChunks + ChunkEmbeddings).
 *
 * Flow per file:
 *   1. OCR via pdftotext (PDF) — gracefully skips unsupported formats
 *   2. law-il-E2B metadata extraction (procedure_type, legal_domain, legal_questions,
 *      factual_summary, keywords)
 *   3. INSERT into Documents (document_type='precedent', ai_enriched=1)
 *   4. indexDocument() → DocumentChunks + ChunkEmbeddings + vec_chunks
 *   5. INSERT into PrecedentDocuments
 */

import { readdirSync, statSync } from 'node:fs';
import { join, sep, extname, basename, resolve as resolvePath } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { indexDocument } from '@factum-il/retrieval';
import { logger } from '@factum-il/shared';
import type { Repos } from '../db.js';

const execFileAsync = promisify(execFile);

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
const PDFTOTEXT    = process.env['PDFTOTEXT_EXE']   ?? 'C:\\poppler-24.08.0\\Library\\bin\\pdftotext.exe';

const SUPPORTED_EXT = new Set(['.pdf', '.docx', '.doc', '.tiff', '.tif', '.png', '.jpg', '.jpeg']);

interface PrecedentMeta {
  procedureType:  string | null;
  legalDomain:    string | null;
  legalQuestions: string[];
  factualSummary: string | null;
  keywords:       string[];
}

export interface IngestResult {
  processed: number;
  failed:    number;
  skipped:   number;
  errors:    string[];
}

async function extractOcrText(filePath: string): Promise<string | null> {
  if (extname(filePath).toLowerCase() !== '.pdf') return null;
  try {
    const { stdout } = await execFileAsync(
      PDFTOTEXT,
      ['-layout', '-enc', 'UTF-8', filePath, '-'],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
    );
    const text = (stdout ?? '').trim();
    return text.length > 20 ? text : null;
  } catch { return null; }
}

async function extractPrecedentMetadata(ocrText: string): Promise<PrecedentMeta | null> {
  const excerpt = ocrText.slice(0, 3000);
  const prompt  = `אתה מנתח פסקי דין ישראליים. נתח את פסק הדין הבא והחזר JSON בלבד ללא הסברים.

פורמט נדרש:
{
  "procedure_type": "<civil|criminal|traffic_criminal|traffic_administrative|labor|family|administrative|other>",
  "legal_domain": "<תחום משפטי ראשי בעברית, לדוגמה: חוזים, נזיקין, דיני עבודה>",
  "legal_questions": ["<שאלה משפטית 1>", "<שאלה משפטית 2>"],
  "factual_summary": "<תיאור עובדתי תמציתי של 2-4 משפטים בעברית>",
  "keywords": ["<מילת מפתח 1>", "<מילת מפתח 2>"]
}

כלל קריטי: החזר JSON בלבד. עד 5 שאלות משפטיות. עד 10 מילות מפתח. אל תמציא נתונים.

טקסט פסק הדין:
${excerpt}`;

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:   OLLAMA_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.1, repeat_penalty: 1.05, num_predict: 600 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;

    const data    = await res.json() as { response?: string };
    const raw     = (data.response ?? '').trim();
    const jsonStr = raw.startsWith('```')
      ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : raw;
    const m = jsonStr.match(/\{[\s\S]*\}/);
    if (!m) return null;

    const parsed = JSON.parse(m[0]) as Partial<{
      procedure_type:  string;
      legal_domain:    string;
      legal_questions: unknown[];
      factual_summary: string;
      keywords:        unknown[];
    }>;

    return {
      procedureType:  typeof parsed.procedure_type  === 'string' ? parsed.procedure_type  : null,
      legalDomain:    typeof parsed.legal_domain    === 'string' ? parsed.legal_domain    : null,
      legalQuestions: Array.isArray(parsed.legal_questions)
        ? parsed.legal_questions.slice(0, 5).map(String) : [],
      factualSummary: typeof parsed.factual_summary === 'string' ? parsed.factual_summary : null,
      keywords:       Array.isArray(parsed.keywords)
        ? parsed.keywords.slice(0, 10).map(String) : [],
    };
  } catch { return null; }
}

function collectFiles(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  const canonDir = resolvePath(dir);
  // Enforce root boundary — prevents escaping via symlinks or .. path components.
  if (canonDir !== rootDir && !canonDir.startsWith(rootDir + sep)) return [];
  try {
    for (const entry of readdirSync(canonDir, { withFileTypes: true })) {
      const full = join(canonDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(full, rootDir));
      } else if (entry.isFile() && SUPPORTED_EXT.has(extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  } catch { /* unreadable directory — skip silently */ }
  return results;
}

export async function ingestJudgmentFolder(
  folderPath: string,
  repos:      Repos,
): Promise<IngestResult> {
  const rootDir = resolvePath(folderPath);
  const files   = collectFiles(rootDir, rootDir);
  const result: IngestResult = { processed: 0, failed: 0, skipped: 0, errors: [] };

  for (const filePath of files) {
    const filename = basename(filePath);
    try {
      // Skip already-ingested files
      const existing = repos.db
        .prepare('SELECT id FROM PrecedentDocuments WHERE source_path = ?')
        .get(filePath);
      if (existing) { result.skipped++; continue; }

      // Step 1: OCR
      const ocrText = await extractOcrText(filePath);
      if (!ocrText) {
        result.errors.push(`OCR נכשל: ${filename}`);
        result.failed++;
        continue;
      }

      // Step 2: LLM metadata — graceful degradation if Ollama is down
      const meta = await extractPrecedentMetadata(ocrText).catch(() => null);

      // Step 3: Insert into Documents (standalone, no case/client, ai_enriched=1 to skip main sweep)
      const docInsert = repos.db.prepare(`
        INSERT INTO Documents
          (filename, original_path, document_type, ocr_text, processing_state,
           language, ai_enriched, created_at, updated_at)
        VALUES (?, ?, 'precedent', ?, 'OCR_COMPLETE', 'he', 1,
                strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `).run(filename, filePath, ocrText);
      const docId = Number(docInsert.lastInsertRowid);

      // Step 4: Index into retrieval (chunks + embeddings) — non-fatal on failure
      try {
        type DbHandle = { prepare: (s: string) => { run: (...a: unknown[]) => void; get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] }; transaction: <T>(fn: () => T) => T };
        await indexDocument(docId, ocrText, repos.db as unknown as DbHandle);
      } catch (indexErr) {
        logger.warn(`Precedent index failed doc=${docId}: ${String(indexErr)}`, { category: 'ai' });
      }

      // Step 5: Record with metadata
      repos.precedentLibrary.insert({
        documentId:    docId,
        sourcePath:    filePath,
        originalFilename: filename,
        procedureType: meta?.procedureType,
        legalDomain:   meta?.legalDomain,
        legalQuestions: meta?.legalQuestions,
        factualSummary: meta?.factualSummary,
        keywords:      meta?.keywords,
      });

      result.processed++;
      logger.info(`Judgment ingested: doc=${docId} file=${filename}`, { category: 'ai' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${filename}: ${msg}`);
      result.failed++;
      logger.error(`Judgment ingestion error: ${filename}: ${msg}`, { category: 'ai' });
    }
  }

  return result;
}

/** Returns file size (bytes) and modification time for the given path, or null. */
export function statFile(filePath: string): { sizeBytes: number; mtimeMs: number } | null {
  try {
    const s = statSync(filePath);
    return { sizeBytes: s.size, mtimeMs: s.mtimeMs };
  } catch { return null; }
}
