/**
 * LegalSourceLoader — generic loader framework (Phase 10).
 *
 * Future legal sources are addable through configuration rather than
 * custom code. Each source has an adapter; the loader orchestrates
 * ingestion, validation, deduplication, progress tracking, and telemetry.
 *
 * Pipeline:
 *   Source Artifact → SourceAdapter.transform() → LegalDocumentInput[]
 *     → ValidationPipeline → DeduplicationCheck → LegalDocuments.insert()
 *     → CitationExtraction → EmbeddingQueue → ProgressUpdate
 */

import { createHash } from 'node:crypto';
import { logger } from '@factum-il/shared';
import type {
  LegalDocumentRepository,
  LegalDocumentInput,
  LegalSourceRegistryRepository,
  LegalIngestionProgressRepository,
  VerdictCitationRepository,
  VerdictCitationInput,
} from '@factum-il/database';
import type { LegalKnowledgeService } from './legal-knowledge-service.js';

// ── Adapter interface ─────────────────────────────────────────────────────

export interface SourceAdapterResult {
  documents: LegalDocumentInput[];
  validCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
}

export interface SourceAdapter {
  readonly adapterName: string;
  /** Transform one batch of raw source records into canonical LegalDocumentInputs */
  transform(records: unknown[]): SourceAdapterResult;
}

// ── Validation pipeline ───────────────────────────────────────────────────

export interface ValidationResult {
  valid:           boolean;
  rejectionReason: string | null;
}

function validateDocument(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') return { valid: false, rejectionReason: 'malformed_json' };
  const obj = raw as Record<string, unknown>;

  if (!obj['judgment_id'] && !obj['doc_key'] && !obj['id'] && !obj['document_id']) {
    return { valid: false, rejectionReason: 'missing_id' };
  }
  const text = String(obj['document_text'] ?? obj['text'] ?? obj['verbatim_text_he'] ?? '');
  if (!text || text.trim().length < 50) {
    return { valid: false, rejectionReason: 'text_too_short' };
  }

  const date = obj['date'] ?? obj['verdict_date'] ?? obj['VerdictDt'];
  if (date && typeof date === 'string') {
    // Allow YYYY-MM-DD or YYYY or empty
    if (!/^\d{4}(-\d{2}-\d{2})?$/.test(date)) {
      return { valid: false, rejectionReason: 'invalid_date_format' };
    }
  }

  // Check valid UTF-8: Node strings are always UTF-16 internally, but check for null bytes
  if (text.includes('\x00')) return { valid: false, rejectionReason: 'invalid_utf8' };

  return { valid: true, rejectionReason: null };
}

// ── Loader ────────────────────────────────────────────────────────────────

export interface LoaderOptions {
  batchSize?:        number;
  skipDuplicates?:   boolean;
  extractCitations?: boolean;
  resumeFrom?:       { batch: number; line: number };
  maxDocuments?:     number;
}

export interface LoaderResult {
  sourceId:          string;
  inserted:          number;
  duplicates:        number;
  rejected:          number;
  citationsExtracted: number;
  elapsedMs:         number;
  rejectionReasons:  Record<string, number>;
}

export class LegalSourceLoader {
  constructor(
    private readonly legalDocuments:     LegalDocumentRepository,
    private readonly sourceRegistry:     LegalSourceRegistryRepository,
    private readonly ingestionProgress:  LegalIngestionProgressRepository,
    private readonly verdictCitations:   VerdictCitationRepository,
    private readonly knowledgeService:   LegalKnowledgeService,
  ) {}

  async load(
    sourceId:   string,
    records:    unknown[],
    adapter:    SourceAdapter,
    opts:       LoaderOptions = {},
  ): Promise<LoaderResult> {
    const batchSize        = opts.batchSize        ?? 100;
    const skipDuplicates   = opts.skipDuplicates   ?? true;
    const extractCitations = opts.extractCitations ?? false;
    const startTime        = Date.now();

    const source = this.sourceRegistry.getBySourceId(sourceId);
    if (!source) throw new Error(`Source not registered: ${sourceId}`);

    // Start / resume ingestion
    this.ingestionProgress.start(sourceId, records.length);
    const resumeBatch = opts.resumeFrom?.batch ?? 0;

    this.knowledgeService.emitStart(sourceId, records.length);
    logger.info('[loader] starting ingestion', {
      category: 'legal-loader', agentSource: 'LegalSourceLoader',
      sourceId, total: records.length, resumeBatch,
    });

    let inserted   = 0;
    let duplicates = 0;
    let rejected   = 0;
    let citationsExtracted = 0;
    const rejectionReasons: Record<string, number> = {};

    // Validate all records first and generate report
    const validRecords: unknown[] = [];
    for (const record of records) {
      const v = validateDocument(record);
      if (!v.valid) {
        rejected++;
        const reason = v.rejectionReason ?? 'unknown';
        rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
      } else {
        validRecords.push(record);
      }
    }

    // Save validation report
    this.saveValidationReport(sourceId, records.length, validRecords.length, rejected, rejectionReasons);

    // Process in batches
    const totalBatches = Math.ceil(validRecords.length / batchSize);
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (batchIdx < resumeBatch) continue;
      if (opts.maxDocuments && inserted >= opts.maxDocuments) break;

      const batch = validRecords.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize);
      const transformed = adapter.transform(batch);

      for (const doc of transformed.documents) {
        // Cross-dataset deduplication by content hash
        if (skipDuplicates && doc.text) {
          const hash = createHash('sha256').update(doc.text).digest('hex');
          const existing = this.legalDocuments.findByContentHash(hash);
          if (existing) {
            duplicates++;
            continue;
          }
        }

        const documentId = this.legalDocuments.insert({ ...doc, sourceId: source.id });
        inserted++;

        // Citation extraction (Phase 12) — lightweight text scan
        if (extractCitations && doc.text) {
          const citations = extractIsraeliCitations(doc.text, documentId);
          if (citations.length > 0) {
            citationsExtracted += this.verdictCitations.bulkInsert(citations);
          }
        }
      }

      // Persist resume state after every batch
      const elapsedMs = Date.now() - startTime;
      this.ingestionProgress.updateProgress(sourceId, {
        lastBatch:  batchIdx + 1,
        lastLine:   (batchIdx + 1) * batchSize,
        processed:  inserted,
        rejected,
        duplicates,
        elapsedMs,
      });

      // Emit structured progress event
      this.knowledgeService.emitProgress(sourceId, inserted, validRecords.length);

      // Structured telemetry log
      logger.info('[loader] batch complete', {
        category: 'legal-loader', agentSource: 'LegalSourceLoader',
        sourceId, batch: batchIdx + 1, totalBatches, inserted, duplicates,
        rejected, citationsExtracted, elapsedMs,
      });
    }

    const elapsedMs = Date.now() - startTime;
    this.ingestionProgress.complete(sourceId);
    this.sourceRegistry.markIngested(sourceId, inserted);
    this.knowledgeService.emitCompleted(sourceId, inserted);

    return { sourceId, inserted, duplicates, rejected, citationsExtracted, elapsedMs, rejectionReasons };
  }

  private saveValidationReport(
    sourceId: string,
    totalRows: number,
    validRows: number,
    rejectedRows: number,
    rejectionReasons: Record<string, number>,
  ): void {
    logger.info('[loader] validation report', {
      category: 'legal-loader', agentSource: 'LegalSourceLoader',
      sourceId, totalRows, validRows, rejectedRows, rejectionReasons,
    });
  }
}

// ── Citation extraction (Phase 12) ────────────────────────────────────────

// Covers: בג"ץ, ע"א, רע"א, ת"א, עב"ל, ע"פ, בש"א, עת"מ, תמ"ש, עפ"א, רע"פ, ע"ע
const CITATION_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'BGTZ',   pattern: /בג["״]ץ\s*\d{1,5}[//]\d{2,4}/g },
  { type: 'CA',     pattern: /ע["״]א\s*\d{1,5}[//]\d{2,4}/g },
  { type: 'RCA',    pattern: /רע["״]א\s*\d{1,5}[//]\d{2,4}/g },
  { type: 'CRIM',   pattern: /ע["״]פ\s*\d{1,5}[//]\d{2,4}/g },
  { type: 'LAB',    pattern: /עב["״]ל\s*\d{1,5}[//]\d{2,4}/g },
  { type: 'TA',     pattern: /ת["״]א\s*[-]?\d{1,5}[-]?\d{2,4}/g },
  { type: 'ADMIN',  pattern: /עת["״]מ\s*[-]?\d{1,5}[-]?\d{2,4}/g },
  { type: 'FAMILY', pattern: /תמ["״]ש\s*[-]?\d{1,5}[-]?\d{2,4}/g },
  { type: 'OTHER',  pattern: /בש["״]א\s*\d{1,5}[//]\d{2,4}/g },
];

function extractIsraeliCitations(text: string, sourceDocumentId: string): VerdictCitationInput[] {
  const results: VerdictCitationInput[] = [];
  const seen = new Set<string>();

  for (const { type, pattern } of CITATION_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const citationText = match[0].trim();
      if (seen.has(citationText)) continue;
      seen.add(citationText);

      // Get surrounding context (up to 100 chars on each side)
      const start  = Math.max(0, match.index! - 100);
      const end    = Math.min(text.length, match.index! + citationText.length + 100);
      const ctx    = text.slice(start, end).replace(/\s+/g, ' ').trim();

      results.push({
        sourceDocumentId,
        citationText,
        citationType: type as NonNullable<VerdictCitationInput['citationType']>,
        confidence:   0.85,
        contextSnippet: ctx.slice(0, 200),
      });
    }
  }

  return results;
}
