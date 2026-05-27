import { Worker } from 'node:worker_threads';
import type { OCRResult } from './ocr-service.js';

const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

export interface OCRWorkerOptions {
  filePath:    string;
  fileHash:    string;
  lang?:       string;
  dbPath:      string | null;
  timeoutMs?:  number;
}

interface WorkerSuccess { ok: true;  result: OCRResult }
interface WorkerFailure { ok: false; error: string }
type WorkerMessage = WorkerSuccess | WorkerFailure;

/**
 * Runs OCR in a worker thread so the main event loop stays responsive.
 * The blocking execFileSync calls in OCRService all happen inside the worker.
 */
export function runOCRInWorker(opts: OCRWorkerOptions): Promise<OCRResult> {
  const { filePath, fileHash, lang = 'heb+eng', dbPath, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  return new Promise<OCRResult>((resolve, reject) => {
    const worker = new Worker(new URL('./ocr-worker.js', import.meta.url), {
      workerData: { filePath, fileHash, lang, dbPath },
    });

    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        void worker.terminate();
        reject(new Error(`OCR timeout after ${timeoutMs}ms for file: ${filePath}`));
      });
    }, timeoutMs);

    worker.on('message', (msg: WorkerMessage) => {
      if (msg.ok) {
        finish(() => resolve(msg.result));
      } else {
        finish(() => reject(new Error(msg.error)));
      }
    });

    worker.on('error', (err: Error) => {
      finish(() => reject(err));
    });
  });
}
