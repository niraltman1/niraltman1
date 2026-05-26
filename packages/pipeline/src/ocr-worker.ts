import { workerData, parentPort } from 'node:worker_threads';
import { DatabaseConnection } from '@factum-il/database';
import { OCRService } from './ocr-service.js';
import type { OCRResult } from './ocr-service.js';

interface WorkerInput {
  filePath: string;
  fileHash: string;
  lang:     string;
  dbPath:   string | null;
}

interface WorkerSuccess { ok: true;  result: OCRResult }
interface WorkerFailure { ok: false; error: string }
type WorkerMessage = WorkerSuccess | WorkerFailure;

async function main(): Promise<void> {
  const { filePath, fileHash, lang, dbPath } = workerData as WorkerInput;

  let db: DatabaseConnection | null = null;
  try {
    if (dbPath) {
      db = new DatabaseConnection({ path: dbPath });
    }
    const result = await new OCRService(db).run(filePath, fileHash, lang);
    const msg: WorkerMessage = { ok: true, result };
    parentPort?.postMessage(msg);
  } catch (err) {
    const msg: WorkerMessage = {
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
    };
    parentPort?.postMessage(msg);
  } finally {
    db?.close();
  }
}

void main();
