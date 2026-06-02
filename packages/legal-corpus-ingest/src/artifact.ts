import { createWriteStream, type WriteStream } from 'node:fs';
import { rename } from 'node:fs/promises';
import { createGzip, type Gzip } from 'node:zlib';
import type { LegalSectionInput, LegalSourceType } from '@factum-il/database';

/**
 * The static JSONL artifact contract — ONE law per line. Shared shape between the build-tool
 * (writer, here) and the runtime loader (packages/api/src/utils/legal-corpus-loader.ts, which
 * declares a structurally-compatible reader). Sections are exactly `LegalSectionInput[]` so
 * they drop straight into `LegalCorpusRepository.replaceSections`.
 */

export interface EmbeddingRec {
  orderIndex: number;
  model:      string;
  vector:     number[];
}

export interface ArtifactRecord {
  schemaVersion: 1;
  sourceKey:     string;
  israelLawId:   number;
  titleHe:       string;
  shortName:     string;
  sourceType:    LegalSourceType;
  year:          number | null;
  sourceUrl:     string | null;
  lastUpdated:   string | null;
  status:        'ingested' | 'metadata_only';
  magarId:       number | null;
  contentHash:   string | null;
  sections:      LegalSectionInput[];
  embeddings:    EmbeddingRec[];
}

/**
 * Streams JSONL records to `<out>.tmp` (gzip-compressed when `out` ends with `.gz`), then
 * atomically renames to `out` on close — so a crashed run never leaves a half-written
 * artifact in place of a good one.
 */
export class ArtifactWriter {
  private readonly tmpPath: string;
  private readonly file: WriteStream;
  private readonly sink: Gzip | WriteStream;
  private count = 0;

  constructor(private readonly outPath: string) {
    this.tmpPath = `${outPath}.tmp`;
    this.file = createWriteStream(this.tmpPath);
    if (outPath.endsWith('.gz')) {
      const gz = createGzip();
      gz.pipe(this.file);
      this.sink = gz;
    } else {
      this.sink = this.file;
    }
  }

  write(rec: ArtifactRecord): void {
    this.sink.write(`${JSON.stringify(rec)}\n`);
    this.count += 1;
  }

  get written(): number {
    return this.count;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.file.on('finish', resolve);
      this.file.on('error', reject);
      this.sink.on('error', reject);
      this.sink.end();
    });
    await rename(this.tmpPath, this.outPath);
  }
}
