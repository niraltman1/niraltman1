import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from '@factum-il/shared';
import type { DatabaseConnection } from '@factum-il/database';
import { HashService } from './hash.js';

const AGENT           = 'PipelineEngine';
const DEFAULT_LANG    = 'heb+eng';
const DEFAULT_DPI     = 300;
const DEFAULT_PSM     = '6';

export interface OCRResult {
  readonly text:        string;
  readonly confidence:  number;
  readonly pageCount:   number;
  readonly fromCache:   boolean;
  readonly durationMs:  number;
}

/**
 * Node.js OCR service that orchestrates Tesseract and Ghostscript.
 * Checks the OCRCache before running OCR.
 * Supports PDF rasterisation, image preprocessing, and multi-language output.
 */
export class OCRService {
  private readonly hasher = new HashService();

  constructor(private readonly db: DatabaseConnection | null = null) {}

  async run(filePath: string, fileHash: string, lang = DEFAULT_LANG): Promise<OCRResult> {
    const start = Date.now();

    // Cache hit
    if (this.db) {
      const cached = this.db
        .prepare('SELECT ocr_text, confidence, page_count FROM OCRCache WHERE file_hash = ?')
        .get(fileHash) as { ocr_text: string; confidence: number; page_count: number } | undefined;

      if (cached) {
        logger.debug(`OCR cache hit: hash=${fileHash}`, { category: 'ocr', agentSource: AGENT });
        return {
          text:        cached.ocr_text,
          confidence:  cached.confidence,
          pageCount:   cached.page_count,
          fromCache:   true,
          durationMs:  Date.now() - start,
        };
      }
    }

    const ext = extname(filePath).toLowerCase();
    let text = '';
    let pageCount = 1;

    const tmpDir = join(tmpdir(), `legal_ocr_${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
      if (ext === '.pdf') {
        // Lane 1: OCRmyPDF (deskew + rotate-pages, highest quality for scanned PDFs)
        const ocrmypdfText = this.tryOCRmyPDF(filePath, tmpDir, lang);
        if (ocrmypdfText && ocrmypdfText.trim().length >= 50) {
          text = ocrmypdfText;
          pageCount = this.countPages(ocrmypdfText);
        } else {
          // Lane 2: native text extraction (already-digital PDFs)
          text = this.extractPdfNative(filePath, tmpDir);
          if (text.trim().length < 50) {
            // Lane 3: Docling (layout-aware — multi-column court verdicts, tables)
            const doclingText = this.tryDocling(filePath, tmpDir);
            if (doclingText && doclingText.trim().length >= 50) {
              text = doclingText;
              pageCount = this.countPages(doclingText);
            } else {
              // Lane 4: Ghostscript rasterisation + Tesseract (last resort)
              const pages = this.rasterisePDF(filePath, tmpDir, DEFAULT_DPI);
              pageCount = pages.length;
              const parts: string[] = [];
              for (const pg of pages) {
                parts.push(this.runTesseract(pg, tmpDir, lang));
              }
              text = parts.join('\n');
            }
          }
        }
      } else {
        text = this.runTesseract(filePath, tmpDir, lang);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    const confidence = this.scoreQuality(text);
    const durationMs = Date.now() - start;

    if (this.db) {
      this.db.prepare(`
        INSERT OR REPLACE INTO OCRCache
          (file_hash, ocr_text, page_count, confidence, language, processing_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fileHash, text, pageCount, confidence, lang, durationMs);
    }

    logger.info(`OCR complete: hash=${fileHash} pages=${pageCount} conf=${confidence.toFixed(3)} ms=${durationMs}`, {
      category: 'ocr', agentSource: AGENT,
    });

    return { text, confidence, pageCount, fromCache: false, durationMs };
  }

  private tryOCRmyPDF(pdfPath: string, tmpDir: string, lang: string): string | null {
    try {
      const outPdf = join(tmpDir, 'ocrmypdf_out.pdf');
      execFileSync('ocrmypdf', [
        '--language', lang,
        '--deskew',
        '--rotate-pages',
        '--force-ocr',
        '--output-type', 'pdf',
        pdfPath,
        outPdf,
      ], { timeout: 180_000 });

      if (!existsSync(outPdf)) return null;

      const outTxt = join(tmpDir, 'ocrmypdf_out.txt');
      execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', outPdf, outTxt], { timeout: 30_000 });
      if (existsSync(outTxt)) return readFileSync(outTxt, 'utf-8');
    } catch { /* ocrmypdf not found or failed — fall through */ }
    return null;
  }

  private tryDocling(pdfPath: string, tmpDir: string): string | null {
    try {
      const basename = pdfPath.split('/').pop()?.replace(/\.pdf$/i, '') ?? 'output';
      execFileSync('docling', ['convert', pdfPath, '--to', 'json', '--output-dir', tmpDir], {
        timeout: 300_000,
      });
      const jsonPath = join(tmpDir, `${basename}.json`);
      if (!existsSync(jsonPath)) return null;
      const raw = readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { main_text?: Array<{ text?: string }> };
      const parts = (parsed.main_text ?? [])
        .map((item) => item.text ?? '')
        .filter((t) => t.length > 0);
      return parts.length > 0 ? parts.join('\n') : null;
    } catch {
      return null;  // docling not installed or failed — fall through
    }
  }

  private countPages(text: string): number {
    return Math.max(1, (text.match(/\f/g) ?? []).length + 1);
  }

  private extractPdfNative(pdfPath: string, tmpDir: string): string {
    try {
      const outPath = join(tmpDir, 'native.txt');
      execFileSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdfPath, outPath], { timeout: 30_000 });
      if (existsSync(outPath)) return readFileSync(outPath, 'utf-8');
    } catch { /* fall through to image OCR */ }
    return '';
  }

  private rasterisePDF(pdfPath: string, tmpDir: string, dpi: number): string[] {
    const gs = process.platform === 'win32' ? 'gswin64c' : 'gs';
    const outPattern = join(tmpDir, 'page_%04d.png');
    execFileSync(gs, [
      '-dBATCH', '-dNOPAUSE', '-dQUIET',
      '-sDEVICE=pnggray',
      `-r${dpi}`,
      `-sOutputFile=${outPattern}`,
      pdfPath,
    ], { timeout: 120_000 });

    return readdirSync(tmpDir)
      .filter((f) => f.startsWith('page_') && f.endsWith('.png'))
      .sort()
      .map((f) => join(tmpDir, f));
  }

  private runTesseract(imagePath: string, tmpDir: string, lang: string): string {
    const outBase = join(tmpDir, `ocr_${Date.now()}`);
    execFileSync('tesseract', [
      imagePath,
      outBase,
      '-l', lang,
      '--psm', DEFAULT_PSM,
      'txt',
    ], { timeout: 60_000 });
    const txtPath = `${outBase}.txt`;
    return existsSync(txtPath) ? readFileSync(txtPath, 'utf-8') : '';
  }

  private scoreQuality(text: string): number {
    if (!text || text.trim().length === 0) return 0;
    const nonWs   = text.replace(/\s/g, '').length;
    const total   = Math.max(text.length, 1);
    const density = Math.min(nonWs / total, 1);
    const hebrewChars = (text.match(/[א-׿]/g) ?? []).length;
    const hebrewRatio = Math.min(hebrewChars / Math.max(nonWs, 1), 1);
    const words    = text.split(/\s+/).filter((w) => w.length > 0);
    const avgLen   = words.length > 0 ? words.reduce((a, w) => a + w.length, 0) / words.length : 0;
    const wordScore = avgLen >= 2 && avgLen <= 15 ? 1 : 0.5;
    return Math.round((density * 0.3 + wordScore * 0.4 + hebrewRatio * 0.3) * 10_000) / 10_000;
  }
}
