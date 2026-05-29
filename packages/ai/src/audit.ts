import { createHash } from 'node:crypto';
import { logger } from '@factum-il/shared';
import type { DatabaseConnection } from '@factum-il/database';

const AGENT = 'AIStrategist';

export interface AuditEntry {
  readonly enrichmentId:      number | null;
  readonly documentId:        number;
  readonly promptKey:         string;
  readonly promptVersion:     number;
  readonly promptHash:        string;
  readonly responseHash:      string;
  readonly isolationKey:      string;
  readonly hallucinationFlags: string[];
  readonly regexOverrides:    string[];
  readonly confidence:        number;
  readonly durationMs:        number;
  readonly modelName:         string;
}

/**
 * AI audit trail – records every enrichment call with its prompt hash,
 * response hash, isolation scope, and any hallucination flags.
 * Enables full auditability of AI decisions and supports compliance review.
 */
export class AIAudit {
  constructor(private readonly db: DatabaseConnection | null = null) {}

  /** Computes a SHA-256 checksum of the raw LLM response string. */
  hashResponse(rawResponse: string): string {
    return createHash('sha256').update(rawResponse, 'utf-8').digest('hex');
  }

  /** Logs an enrichment to the AIAuditLog table. */
  log(entry: AuditEntry): void {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO AIAuditLog
          (enrichment_id, document_id, prompt_key, prompt_version,
           prompt_hash, response_hash, isolation_key, hallucination_flags,
           regex_overrides, confidence, duration_ms, model_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.enrichmentId,
        entry.documentId,
        entry.promptKey,
        entry.promptVersion,
        entry.promptHash,
        entry.responseHash,
        entry.isolationKey,
        JSON.stringify(entry.hallucinationFlags),
        JSON.stringify(entry.regexOverrides),
        entry.confidence,
        entry.durationMs,
        entry.modelName,
      );

      if (entry.hallucinationFlags.length > 0) {
        logger.warn(`AI audit: doc=${entry.documentId} hallucinationFlags=${JSON.stringify(entry.hallucinationFlags)}`, {
          category: 'ai', agentSource: AGENT,
        });
      }
    } catch (err) {
      logger.warn(`AI audit log failed: ${String(err)}`, { category: 'ai', agentSource: AGENT });
    }
  }

  /**
   * Builds an isolation key from client/case context.
   * Ensures each enrichment is scoped to a single domain.
   */
  buildIsolationKey(clientId: number | null, caseId: number | null): string {
    return `client:${clientId ?? 'none'}|case:${caseId ?? 'none'}`;
  }

  /**
   * Verifies that a response hash matches the stored audit record.
   * Used during post-hoc validation.
   */
  verifyResponseIntegrity(enrichmentId: number, rawResponse: string): boolean {
    if (!this.db) return true;
    const row = this.db.prepare(
      "SELECT response_hash FROM AIAuditLog WHERE enrichment_id = ? LIMIT 1",
    ).get(enrichmentId) as { response_hash: string } | undefined;

    if (!row) return false;
    return row.response_hash === this.hashResponse(rawResponse);
  }
}
