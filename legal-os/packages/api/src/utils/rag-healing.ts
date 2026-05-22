import type { DatabaseConnection } from '@factum-il/database';
import { logger } from '@factum-il/shared';

const AGENT = 'RagHealing';

export interface HealingReport {
  fts5:   { wasHealthy: boolean; rebuilt: boolean; error?: string; durationMs: number };
  ollama: { reachable: boolean; circuitWasOpen: boolean; lastOkAt: string | null };
  healedAt: string;
}

const FTS5_REBUILD_DDL = `
  DROP TRIGGER IF EXISTS trg_fts_documents_insert;
  DROP TRIGGER IF EXISTS trg_fts_documents_update;
  DROP TRIGGER IF EXISTS trg_fts_documents_delete;
  DROP TABLE  IF EXISTS fts_documents;

  CREATE VIRTUAL TABLE fts_documents USING fts5(
    filename, ocr_text, document_type, tags,
    content='Documents', content_rowid='id'
  );

  INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
    SELECT id, filename, ocr_text, document_type, tags FROM Documents
    WHERE ocr_text IS NOT NULL OR filename IS NOT NULL;

  CREATE TRIGGER trg_fts_documents_insert AFTER INSERT ON Documents BEGIN
    INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
    VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
  END;
  CREATE TRIGGER trg_fts_documents_update AFTER UPDATE ON Documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
    VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
    INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
    VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
  END;
  CREATE TRIGGER trg_fts_documents_delete AFTER DELETE ON Documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
    VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
  END;
`;

export class RagHealingService {
  private lastOllamaOkAt: string | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DatabaseConnection,
    private readonly ollamaBase: string,
  ) {}

  // RAG001 — probe FTS5 virtual table; returns false if corrupt/missing
  probeFts5(): boolean {
    try {
      this.db.prepare('SELECT count(*) FROM fts_documents LIMIT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  rebuildFts5(): void {
    this.db.exec(FTS5_REBUILD_DDL);
  }

  // RAG002 — probe Ollama; updates lastOllamaOkAt on success
  async probeOllama(): Promise<boolean> {
    try {
      const res = await fetch(`${this.ollamaBase}/api/tags`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status < 500) {
        this.lastOllamaOkAt = new Date().toISOString();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Polls Ollama every intervalMs until it responds, then self-cancels.
  // Idempotent — a second call while the loop is running is a no-op.
  startOllamaProbeLoop(intervalMs = 30_000): void {
    if (this.probeTimer !== null) return;
    this.probeTimer = setInterval(() => {
      void this.probeOllama().then((reachable) => {
        if (reachable) {
          this.stopOllamaProbeLoop();
          logger.info('RagHealingService: Ollama recovered', { category: 'ai', agentSource: AGENT });
        }
      });
    }, intervalMs);
  }

  stopOllamaProbeLoop(): void {
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  async runHealingCycle(): Promise<HealingReport> {
    const healedAt = new Date().toISOString();

    // RAG001 — FTS5
    const ftsStart     = Date.now();
    const ftsWasHealthy = this.probeFts5();
    let ftsRebuilt     = false;
    let ftsError: string | undefined;

    if (!ftsWasHealthy) {
      try {
        this.rebuildFts5();
        ftsRebuilt = true;
        logger.info('RagHealingService: FTS5 rebuilt after corruption detected', { category: 'system', agentSource: AGENT });
      } catch (e) {
        ftsError = e instanceof Error ? e.message : String(e);
        logger.error(`RagHealingService: FTS5 rebuild failed: ${ftsError}`, { category: 'system', agentSource: AGENT });
      }
    }

    // RAG002 — Ollama
    const circuitWasOpen  = this.probeTimer !== null;
    const ollamaReachable = await this.probeOllama();

    if (!ollamaReachable) {
      this.startOllamaProbeLoop();
      logger.warn('RagHealingService: Ollama unreachable — probe loop started', { category: 'ai', agentSource: AGENT });
    } else {
      this.stopOllamaProbeLoop();
    }

    return {
      fts5: {
        wasHealthy: ftsWasHealthy,
        rebuilt:    ftsRebuilt,
        ...(ftsError !== undefined ? { error: ftsError } : {}),
        durationMs: Date.now() - ftsStart,
      },
      ollama: {
        reachable:     ollamaReachable,
        circuitWasOpen,
        lastOkAt:      this.lastOllamaOkAt,
      },
      healedAt,
    };
  }

  getLastOllamaOkAt(): string | null {
    return this.lastOllamaOkAt;
  }
}
