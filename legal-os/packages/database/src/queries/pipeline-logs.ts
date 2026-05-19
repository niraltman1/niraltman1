import type { DatabaseConnection } from '../connection.js';

export type PipelineLogStatus =
  | 'processing'
  | 'ocr_success'
  | 'failed_ocr'
  | 'ai_resolved'
  | 'failed_ai'
  | 'excluded'
  | 'duplicate';

export interface PipelineLogEntry {
  readonly id:                 number;
  readonly fileHash:           string | null;
  readonly fileName:           string;
  readonly status:             PipelineLogStatus;
  readonly errorMessage:       string | null;
  readonly extractedClientId:  number | null;
  readonly clientProvisioned:  boolean;
  readonly urgencyLevel:       string | null;
  readonly sentiment:          string | null;
  readonly timestamp:          string;
}

export interface CreatePipelineLogInput {
  fileHash?:           string | null;
  fileName:            string;
  status:              PipelineLogStatus;
  errorMessage?:       string | null;
  extractedClientId?:  number | null;
  clientProvisioned?:  boolean;
  urgencyLevel?:       string | null;
  sentiment?:          string | null;
}

export interface ScanSummary {
  totalScanned:  number;
  successful:    number;   // ocr_success + ai_resolved
  failed:        number;   // failed_ocr + failed_ai
  excluded:      number;
  duplicates:    number;
  entries:       PipelineLogEntry[];
  generatedAt:   string;
}

function mapRow(r: Record<string, unknown>): PipelineLogEntry {
  return {
    id:                r['id']                  as number,
    fileHash:          r['file_hash']           as string | null,
    fileName:          r['file_name']           as string,
    status:            r['status']              as PipelineLogStatus,
    errorMessage:      r['error_message']       as string | null,
    extractedClientId: r['extracted_client_id'] as number | null,
    clientProvisioned: (r['client_provisioned'] as number) === 1,
    urgencyLevel:      r['urgency_level']       as string | null,
    sentiment:         r['sentiment']           as string | null,
    timestamp:         r['timestamp']           as string,
  };
}

export class PipelineLogsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(input: CreatePipelineLogInput): PipelineLogEntry {
    const result = this.db.prepare(`
      INSERT INTO PipelineLogs
        (file_hash, file_name, status, error_message, extracted_client_id,
         client_provisioned, urgency_level, sentiment)
      VALUES
        (@fileHash, @fileName, @status, @errorMessage, @extractedClientId,
         @clientProvisioned, @urgencyLevel, @sentiment)
    `).run({
      fileHash:           input.fileHash           ?? null,
      fileName:           input.fileName,
      status:             input.status,
      errorMessage:       input.errorMessage        ?? null,
      extractedClientId:  input.extractedClientId   ?? null,
      clientProvisioned:  input.clientProvisioned   ? 1 : 0,
      urgencyLevel:       input.urgencyLevel        ?? null,
      sentiment:          input.sentiment           ?? null,
    }) as { lastInsertRowid: number | bigint };

    const id = Number(result.lastInsertRowid);
    return this.db.prepare('SELECT * FROM PipelineLogs WHERE id = ?')
      .get(id) as PipelineLogEntry;
  }

  reset(): number {
    return (this.db.prepare('DELETE FROM PipelineLogs').run() as { changes: number }).changes;
  }

  recent(limit = 200): PipelineLogEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM PipelineLogs ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  // Returns the last event per unique file_name within the given window (minutes).
  summary(withinMinutes = 60, limit = 200): ScanSummary {
    const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();

    const entries = (this.db.prepare(`
      SELECT pl.*
        FROM PipelineLogs pl
       WHERE pl.timestamp >= ?
       ORDER BY pl.timestamp DESC
       LIMIT ?
    `).all(since, limit) as Record<string, unknown>[]).map(mapRow);

    let successful = 0, failed = 0, excluded = 0, duplicates = 0;
    for (const e of entries) {
      if (e.status === 'ocr_success' || e.status === 'ai_resolved') successful++;
      else if (e.status === 'failed_ocr' || e.status === 'failed_ai')  failed++;
      else if (e.status === 'excluded')                                  excluded++;
      else if (e.status === 'duplicate')                                 duplicates++;
    }

    return {
      totalScanned: entries.length,
      successful,
      failed,
      excluded,
      duplicates,
      entries,
      generatedAt: new Date().toISOString(),
    };
  }
}
