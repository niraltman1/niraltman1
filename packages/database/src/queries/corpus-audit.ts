import type { DatabaseConnection } from '../connection.js';

/**
 * Quantitative audit of the "legal brain" corpora (AI-1.3).
 *
 * Answers, from whatever is actually loaded into the database:
 *   - how many laws / verdicts are present (vs the base targets);
 *   - raw text volume (chars → estimated tokens / MB);
 *   - how much is embedded (vector-searchable) vs FTS-only;
 *   - which sqlite-vec tables are live, and the resulting bottlenecks.
 *
 * Every metric is computed defensively: a missing table (migration not applied,
 * extension absent) yields 0 / unavailable rather than throwing, so the audit
 * runs on a fresh install and on a fully-loaded one alike.
 */

// Hebrew text heuristics: ~2.5 chars/token, ~2 bytes/char in UTF-8.
const CHARS_PER_TOKEN = 2.5;
const BYTES_PER_CHAR  = 2;

export const LAWS_TARGET     = 1077;
export const VERDICTS_TARGET = 30000;

export interface CorpusAuditReport {
  readonly generatedAt: string;
  readonly laws: {
    readonly sources:         number;
    readonly sections:        number;
    readonly sectionsEmbedded: number;
    readonly sectionsFtsOnly:  number;
    readonly target:           number;
  };
  readonly verdicts: {
    readonly verdictCorpus:          number;
    readonly verdictCorpusEmbedded:  number;
    readonly supremeCourt:           number;
    readonly supremeCourtEmbedded:   number;
    readonly legalDocumentsCaseLaw:  number;
    readonly chunks:                 number;
    readonly chunksEmbedded:         number;
    readonly target:                 number;
  };
  readonly rawText: {
    readonly totalChars:      number;
    readonly estimatedTokens: number;
    readonly estimatedMB:     number;
  };
  readonly embeddings: {
    readonly model:                 string;
    readonly dim:                   number;
    readonly totalEmbedded:         number;
    readonly citationGraphEdges:    number;
    readonly vectorTables: ReadonlyArray<{ name: string; available: boolean; rows: number }>;
  };
  readonly bottlenecks: readonly string[];
}

interface ScalarStmt { get(...a: unknown[]): unknown; }

export class CorpusAuditRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** A scalar COUNT/SUM that returns 0 when the table/column is absent. */
  private scalar(sql: string): number {
    try {
      const row = (this.db.prepare(sql) as ScalarStmt).get() as { v: number | null } | undefined;
      return Number(row?.v ?? 0);
    } catch {
      return 0;
    }
  }

  private vecRows(table: string): { available: boolean; rows: number } {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) AS v FROM ${table}`).get() as { v: number };
      return { available: true, rows: Number(row.v) };
    } catch {
      return { available: false, rows: 0 };
    }
  }

  audit(): CorpusAuditReport {
    // ── Laws ──────────────────────────────────────────────────────────────
    const sources          = this.scalar("SELECT COUNT(*) AS v FROM LegalSources WHERE is_active = 1");
    const sections         = this.scalar("SELECT COUNT(*) AS v FROM LegalSections");
    const sectionsEmbedded = this.scalar("SELECT COUNT(*) AS v FROM LegalSectionEmbeddings");

    // ── Verdicts (three parallel corpora in the schema) ───────────────────
    const verdictCorpus         = this.scalar("SELECT COUNT(*) AS v FROM VerdictCorpus");
    const verdictCorpusEmbedded = this.scalar("SELECT COUNT(*) AS v FROM VerdictCorpusEmbeddings");
    const supremeCourt          = this.scalar("SELECT COUNT(*) AS v FROM SupremeCourtVerdicts");
    const supremeCourtEmbedded  = this.scalar("SELECT COUNT(*) AS v FROM SupremeCourtVerdicts WHERE embedding_done = 1");
    const legalDocsCaseLaw      = this.scalar("SELECT COUNT(*) AS v FROM LegalDocuments WHERE source_type = 'CASE_LAW'");
    const chunks                = this.scalar("SELECT COUNT(*) AS v FROM LegalDocumentChunks");
    const chunksEmbedded        = this.scalar("SELECT COUNT(*) AS v FROM LegalDocumentChunks WHERE embedding IS NOT NULL");

    // ── Raw text volume (sum char columns + length(text) where present) ───
    const totalChars =
      this.scalar("SELECT COALESCE(SUM(char_count),0) AS v FROM LegalSections") +
      this.scalar("SELECT COALESCE(SUM(char_count),0) AS v FROM VerdictCorpus") +
      this.scalar("SELECT COALESCE(SUM(LENGTH(text)),0) AS v FROM LegalDocuments");

    // ── Embedding layer + vector tables ───────────────────────────────────
    const legalDocEmbedded   = this.scalar("SELECT COUNT(*) AS v FROM LegalDocumentEmbeddings");
    const totalEmbedded      = sectionsEmbedded + verdictCorpusEmbedded + supremeCourtEmbedded + legalDocEmbedded;
    const citationGraphEdges = this.scalar("SELECT COUNT(*) AS v FROM LegalCitationGraph");

    const vectorTables = [
      { name: 'vec_legal_sections',     ...this.vecRows('vec_legal_sections') },
      { name: 'vec_legal_documents',    ...this.vecRows('vec_legal_documents') },
      { name: 'vec_chunks',             ...this.vecRows('vec_chunks') },
      { name: 'vec_precedent_verdicts', ...this.vecRows('vec_precedent_verdicts') },
    ];

    // ── Bottleneck flags ──────────────────────────────────────────────────
    const bottlenecks: string[] = [];
    const vecSections = vectorTables.find((t) => t.name === 'vec_legal_sections')!;
    if (sectionsEmbedded > 0 && !vecSections.available) {
      bottlenecks.push(
        'vec_legal_sections unavailable — legal-section search falls back to O(n) JS-cosine over all embeddings.',
      );
    }
    if (chunks > 0 && chunksEmbedded === 0) {
      bottlenecks.push(
        'LegalDocumentChunks are FTS-only (no chunk-level embeddings) — semantic recall on case law is coarse.',
      );
    }
    if (supremeCourt > 0 && supremeCourtEmbedded < supremeCourt) {
      bottlenecks.push(
        `SupremeCourtVerdicts partially embedded (${supremeCourtEmbedded}/${supremeCourt}) — re-run build-legal-embeddings.`,
      );
    }
    if (sections > 0 && sectionsEmbedded < sections) {
      bottlenecks.push(
        `LegalSections partially embedded (${sectionsEmbedded}/${sections}) — keyword-only recall on the gap.`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      laws: {
        sources,
        sections,
        sectionsEmbedded,
        sectionsFtsOnly: Math.max(0, sections - sectionsEmbedded),
        target: LAWS_TARGET,
      },
      verdicts: {
        verdictCorpus,
        verdictCorpusEmbedded,
        supremeCourt,
        supremeCourtEmbedded,
        legalDocumentsCaseLaw: legalDocsCaseLaw,
        chunks,
        chunksEmbedded,
        target: VERDICTS_TARGET,
      },
      rawText: {
        totalChars,
        estimatedTokens: Math.round(totalChars / CHARS_PER_TOKEN),
        estimatedMB:     Math.round((totalChars * BYTES_PER_CHAR / 1e6) * 100) / 100,
      },
      embeddings: {
        model: 'nomic-embed-text',
        dim:   768,
        totalEmbedded,
        citationGraphEdges,
        vectorTables,
      },
      bottlenecks,
    };
  }
}
