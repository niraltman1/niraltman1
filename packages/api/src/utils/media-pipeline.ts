/**
 * Media ingestion pipeline orchestrator.
 *
 * Runs entirely in the Node.js event loop (no worker_threads needed)
 * because child_process.execFile is non-blocking — Tesseract runs as
 * a separate OS process, yielding the event loop during conversion.
 *
 * Flow per file:
 *   1. Hash file (streaming — low memory)
 *   2. Check ProcessedFiles registry → skip if already registered
 *   3. If path changed → update path, skip
 *   4. Image? → convert to searchable PDF via Tesseract
 *   5. Run Field Discovery on OCR text (extract ID, case#, judge)
 *   6. Run Rejection Scanner (detect נדחה etc. in traffic ingestion docs)
 *   7. Register in Documents table (or update existing)
 *   8. Mark ProcessedFiles entry as 'complete'
 */

import { extname, basename, dirname, join } from 'path';
import { access } from 'fs/promises';
import { execFile } from 'node:child_process';
import type { ProcessedFilesRepository, DocumentRepository, EvidenceRepository, ClientRepository, CaseRepository, PipelineLogsRepository, ContactsRepository } from '@factum-il/database';
import { computeFileHash, getFileSize, mimeFromExtension, isImageExtension } from './file-hash.js';
import { convertImageToPdf } from './image-to-pdf.js';
import { buildDocumentName } from './file-namer.js';
import { scanForRejection } from './rejection-scanner.js';
import { discoverFields, type DiscoveredFields } from './field-discovery.js';
import { processAudio, AUDIO_EXTENSIONS } from './audio-pipeline.js';
import { EvidenceLocker } from '../modules/evidence/evidence-locker.js';
import { runPreflightIdentityResolution, type EssenceClassification, type ResolvedParty } from './preflight-agent.js';

// Data Firewall — paths that must NEVER be ingested into the legal system.
// Covers Chen's medical/nursing academic materials and system paths.
// Checked against both directory segments and the full file path.
const EXCLUDED_PATTERNS = [
  // System / tooling noise
  /node_modules/i,
  /\.git[/\\]/,
  /[/\\]\.trash[/\\]/i,
  /[/\\]__MACOSX[/\\]/i,
  /[/\\]temp[/\\]/i,
  /[/\\]tmp[/\\]/i,
  /System32/i,
  /Windows[/\\]/i,
  // ── DATA FIREWALL: Chen's medical/nursing materials ───────────────────────
  // Hebrew folder names
  /[/\\]סיעוד/u,
  /[/\\]רפואה/u,
  /[/\\]חן/u,             // broad block for ambiguous "Chen" folders
  /סיעוד[/\\]/u,          // also catches root-level folder
  /רפואה[/\\]/u,
  // English/transliteration
  /[/\\]Nursing/i,
  /[/\\]Medical/i,
  /[/\\]Healthcare/i,
  /[/\\]Chen[/\\]/i,
  // Filename keywords (nursing/medical content in filenames)
  /סיעוד\.pdf$/ui,
  /רפואה\.pdf$/ui,
  /nursing/i,
  /medical_report/i,
];

// ── PDF text extraction via pdftotext (Poppler) ───────────────────────────
const PDFTOTEXT = process.env['PDFTOTEXT_EXE'] ?? 'C:\\poppler-24.08.0\\Library\\bin\\pdftotext.exe';

async function extractPdfText(filePath: string): Promise<{ text: string; error: string | null }> {
  return new Promise((resolve) => {
    execFile(PDFTOTEXT, ['-layout', '-enc', 'UTF-8', toLongPath(filePath), '-'],
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          const msg = err.code === 'ENOENT'
            ? `pdftotext binary not found at: ${PDFTOTEXT}. Set PDFTOTEXT_EXE env var to the correct path.`
            : `pdftotext failed for ${basename(filePath)}: ${err.message}`;
          console.warn(`[MediaPipeline] ${msg}`);
          resolve({ text: '', error: msg });
        } else {
          resolve({ text: (stdout ?? '').trim(), error: null });
        }
      },
    );
  });
}

// ── Windows long-path helper ───────────────────────────────────────────────
function toLongPath(p: string): string {
  if (process.platform === 'win32' && !p.startsWith('\\\\?\\') && !p.startsWith('//')) {
    return `\\\\?\\${p.replace(/\//g, '\\')}`;
  }
  return p;
}

// ── Forbidden OS character sanitizer ──────────────────────────────────────
const FORBIDDEN_OS_CHARS_RE = /[\\/:*?"<>|]/g;
export function sanitizeFolderName(name: string): string {
  return name.replace(FORBIDDEN_OS_CHARS_RE, '_').replace(/\s+/g, ' ').trim();
}

export interface IngestOptions {
  filePath:    string;
  clientId?:   number | null;
  caseId?:     number | null;
  clientName?: string;
  outputDir?:  string;   // where to place converted PDFs; defaults to file's directory
  force?:      boolean;  // bypass dedup hash-match — re-processes even if previously registered
}

export type IngestStatus =
  | 'already_registered'
  | 'path_updated'
  | 'converted_to_pdf'
  | 'registered'
  | 'failed'
  | 'excluded';

export interface IngestResult {
  status:          IngestStatus;
  fileHash:        string;
  documentId:      number | null;
  pdfPath:         string | null;
  message:         string;
  discoveredFields?:  DiscoveredFields;
  rejectionFound?:    boolean;
  rejectionKeywords?: string[];
  preflightClientId?: number | null;
  clientProvisioned?: boolean;
  essence?:           EssenceClassification;
  parties?:           ResolvedParty[];
  captionFound?:      boolean;
}

export class MediaPipeline {
  constructor(
    private readonly processedFiles: ProcessedFilesRepository,
    private readonly documents:      DocumentRepository,
    private readonly evidence?:      EvidenceRepository,
    private readonly clients?:       ClientRepository,
    private readonly cases?:         CaseRepository,
    private readonly pipelineLogs?:  PipelineLogsRepository,
    private readonly contacts?:      ContactsRepository,
  ) {}

  async ingest(opts: IngestOptions): Promise<IngestResult> {
    const { filePath } = opts;

    // ── 0. Exclusion filter (context-aware: academic paths bypass medical block) ──
    const ACADEMIC_PATHS = (process.env['ACADEMIC_ROOT'] ?? '').split(';').filter(Boolean);
    const isAcademicPath = ACADEMIC_PATHS.some((p) => filePath.startsWith(p));
    if (!isAcademicPath && EXCLUDED_PATTERNS.some((re) => re.test(filePath))) {
      this.pipelineLogs?.create({ fileName: basename(filePath), status: 'excluded', errorMessage: 'נתיב הוחרג מהמערכת (Data Firewall)' });
      return {
        status: 'excluded',
        fileHash: '',
        documentId: null,
        pdfPath: null,
        message: `נתיב הוחרג מהמערכת: ${filePath}`,
      };
    }

    // ── 0a. Audio branch ───────────────────────────────────────────────────
    if (AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase())) {
      const result = await processAudio(filePath, {
        processedFiles: this.processedFiles,
        documents:      this.documents,
      });
      return {
        status:     result.status === 'already_registered' ? 'already_registered'
                  : result.status === 'failed'             ? 'failed'
                  : result.status === 'excluded'           ? 'excluded'
                  : 'registered',
        fileHash:   result.fileHash,
        documentId: result.documentId,
        pdfPath:    null,
        message:    result.message,
      };
    }

    // ── 1. Verify file exists ──────────────────────────────────────────────
    try {
      await access(filePath);
    } catch {
      return {
        status: 'failed',
        fileHash: '',
        documentId: null,
        pdfPath: null,
        message: `קובץ לא נמצא: ${filePath}`,
      };
    }

    // ── 2. Hash ────────────────────────────────────────────────────────────
    let fileHash: string;
    try {
      fileHash = await computeFileHash(filePath);
    } catch (e) {
      return {
        status: 'failed',
        fileHash: '',
        documentId: null,
        pdfPath: null,
        message: `שגיאה בחישוב Hash: ${String(e)}`,
      };
    }

    // ── 3. Registry check ──────────────────────────────────────────────────
    const existing = this.processedFiles.findByHash(fileHash);

    if (existing && !opts.force) {
      // Backfill: if file was processed before the trigger fix, documentId is null.
      // Create the Document now so the record becomes fully linked.
      if (existing.documentId === null && existing.processingStatus === 'complete') {
        try {
          const existingDoc = this.documents.findByHash(fileHash);
          const docId = existingDoc
            ? existingDoc.id
            : this.documents.create({
                fileHash,
                originalPath:  existing.originalPath,
                storagePath:   existing.convertedPdfPath ?? existing.currentPath,
                filename:      basename(existing.convertedPdfPath ?? existing.currentPath),
                extension:     extname(existing.convertedPdfPath ?? existing.currentPath).replace('.', ''),
                fileSizeBytes: existing.fileSizeBytes ?? 0,
                mimeType:      existing.mimeType ?? null,
                language:      'he',
              }).id;
          this.processedFiles.updateStatus(fileHash, 'complete', { documentId: docId });
          (existing as { documentId: number | null }).documentId = docId;
        } catch (e) {
          console.error('[MediaPipeline] backfill documentId FAILED:', String(e));
        }
      }

      if (existing.currentPath !== filePath) {
        this.processedFiles.updatePath(fileHash, filePath);
        return {
          status:     'path_updated',
          fileHash,
          documentId: existing.documentId,
          pdfPath:    existing.convertedPdfPath,
          message:    `נתיב עודכן (Hash זהה): ${filePath}`,
        };
      }
      this.pipelineLogs?.create({ fileHash, fileName: basename(filePath), status: 'duplicate' });
      return {
        status:     'already_registered',
        fileHash,
        documentId: existing.documentId,
        pdfPath:    existing.convertedPdfPath,
        message:    `קובץ כבר קיים ברישום (Hash: ${fileHash.slice(0, 12)}…)`,
      };
    }

    // force=true: wipe the stale ProcessedFiles entry so registration in step 4 succeeds
    if (existing && opts.force) {
      this.processedFiles.deleteByHash(fileHash);
      console.log(`[MediaPipeline] force re-process: cleared registry entry for ${basename(filePath)}`);
    }

    // ── 4. Register as pending ─────────────────────────────────────────────
    const ext          = extname(filePath);
    const originalName = basename(filePath);
    const fileSizeBytes = await getFileSize(filePath);
    const mimeType     = mimeFromExtension(ext);

    this.processedFiles.register({
      fileHash,
      originalPath: filePath,
      currentPath:  filePath,
      originalName,
      fileSizeBytes,
      mimeType,
      clientId: opts.clientId ?? null,
    });

    // ── 5. Image → Searchable PDF ──────────────────────────────────────────
    let finalPath  = filePath;
    let pdfPath: string | null = null;
    let ocrText    = '';

    if (isImageExtension(ext)) {
      try {
        this.processedFiles.updateStatus(fileHash, 'converting');

        const outputDir = opts.outputDir ?? dirname(filePath);
        const docName   = buildDocumentName(
          new Date(),
          'מסמך משפטי',
          opts.clientName ?? 'לקוח',
        ).replace('.pdf', ''); // base name without .pdf (tesseract appends it)

        const result = await convertImageToPdf(filePath, outputDir, docName);
        pdfPath   = result.pdfPath;
        ocrText   = result.ocrText;
        finalPath = result.pdfPath;

        this.processedFiles.updateStatus(fileHash, 'complete', {
          convertedPdfPath: pdfPath,
          ocrTextPreview:   ocrText.slice(0, 500) || null,
        });
      } catch (e) {
        this.processedFiles.updateStatus(fileHash, 'failed', {
          skipReason: `המרה נכשלה: ${String(e)}`,
        });
        return {
          status:     'failed',
          fileHash,
          documentId: null,
          pdfPath:    null,
          message:    `המרת תמונה ל-PDF נכשלה: ${String(e)}`,
        };
      }
    } else {
      // Non-image files: extract text from PDFs using pdftotext (Poppler)
      if (ext.toLowerCase() === '.pdf') {
        const pdfResult = await extractPdfText(filePath);
        ocrText = pdfResult.text;
        if (pdfResult.error) {
          this.pipelineLogs?.create({ fileHash, fileName: originalName, status: 'failed_ocr', errorMessage: pdfResult.error });
        } else if (ocrText.length > 0) {
          this.pipelineLogs?.create({ fileHash, fileName: originalName, status: 'ocr_success' });
        } else {
          const emptyMsg = `PDF עובד ללא טקסט שחולץ — ייתכן PDF מבוסס תמונה או מוצפן חלקית: ${originalName}`;
          console.warn(`[MediaPipeline] ${emptyMsg}`);
          this.pipelineLogs?.create({ fileHash, fileName: originalName, status: 'failed_ocr', errorMessage: emptyMsg });
        }
      }
      this.processedFiles.updateStatus(fileHash, 'complete', {
        ...(ocrText ? { ocrTextPreview: ocrText.slice(0, 500) } : {}),
      });
    }

    // ── 6. Field Discovery from OCR text ──────────────────────────────────
    let discoveredFields: DiscoveredFields | undefined;
    if (ocrText.length > 20) {
      discoveredFields = discoverFields(ocrText);
    }

    // ── 6a. Pre-Flight Identity Resolution (Sub-Agents A & B) ─────────────
    // Runs before document registration to guarantee client/case scope.
    // Skipped when clientId is already known or OCR text is too sparse.
    let resolvedClientId: number | null = opts.clientId ?? null;
    let clientProvisioned               = false;
    let essence: EssenceClassification | undefined;
    let preflightResult: Awaited<ReturnType<typeof runPreflightIdentityResolution>> | undefined;

    if (this.clients && this.cases && ocrText.length > 50 && resolvedClientId === null) {
      try {
        preflightResult   = await runPreflightIdentityResolution(
          ocrText,
          basename(filePath),
          this.clients,
          this.cases,
          this.contacts,
        );
        resolvedClientId  = preflightResult.clientId;
        clientProvisioned = preflightResult.created;
        if (preflightResult.essence) essence = preflightResult.essence;
        if (preflightResult.captionFound) {
          console.log(`[Preflight:A] Caption parsed — ${preflightResult.parties.map((p) => `"${p.name}" (${p.litigationRole})`).join(' | ')}`);
        }
        this.pipelineLogs?.create({
          fileHash,
          fileName:          originalName,
          status:            'ai_resolved',
          clientProvisioned: preflightResult.created,
          urgencyLevel:      preflightResult.essence?.urgencyLevel ?? null,
          sentiment:         preflightResult.essence?.sentiment    ?? null,
          ...(preflightResult.clientId !== null ? { extractedClientId: preflightResult.clientId } : {}),
        });
      } catch (e) {
        const errMsg = String(e);
        console.warn('[MediaPipeline] Preflight failed (non-fatal):', errMsg);
        this.pipelineLogs?.create({ fileHash, fileName: originalName, status: 'failed_ai', errorMessage: errMsg });
      }
    }

    // ── 7. Rejection Scanner ──────────────────────────────────────────────
    const rejection = ocrText ? scanForRejection(ocrText) : null;

    // ── 8. Register in Documents table ────────────────────────────────────
    let documentId: number | null = null;
    try {
      const existingDoc = this.documents.findByHash(fileHash);
      if (existingDoc) {
        documentId = existingDoc.id;
      } else {
        const newDoc = this.documents.create({
          fileHash,
          originalPath:  filePath,
          storagePath:   finalPath,
          filename:      basename(finalPath),
          extension:     extname(finalPath).replace('.', ''),
          fileSizeBytes: fileSizeBytes ?? 0,
          mimeType:      pdfPath ? 'application/pdf' : (mimeType ?? null),
          language:      'he',
          clientId:      resolvedClientId,
          caseId:        opts.caseId ?? null,
        });
        documentId = newDoc.id;
      }

      this.processedFiles.updateStatus(fileHash, 'complete', { documentId });
    } catch (e) {
      console.error('[MediaPipeline] documents.create FAILED:', String(e));
      // Document creation failure is non-fatal — the registry entry is still useful
    }

    if (process.env['EVIDENCE_AUTO_LOCK'] === '1' && this.evidence && documentId !== null) {
      const LOCKER_ROOT = process.env['LOCKER_ROOT'] ?? join(process.cwd(), '_evidence');
      void new EvidenceLocker(this.evidence, LOCKER_ROOT)
        .lock({ sourcePath: filePath, sourceApp: 'manual' })
        .catch(() => {});
    }

    return {
      status:    pdfPath ? 'converted_to_pdf' : 'registered',
      fileHash,
      documentId,
      pdfPath,
      message:   pdfPath
        ? `תמונה הומרה ל-PDF: ${basename(pdfPath)}`
        : `קובץ נרשם: ${originalName}`,
      ...(discoveredFields !== undefined ? { discoveredFields }                        : {}),
      ...(rejection?.detected
        ? { rejectionFound: true  as const, rejectionKeywords: rejection.keywords }
        : { rejectionFound: false as const }),
      ...(resolvedClientId !== null ? { preflightClientId: resolvedClientId }          : {}),
      ...(clientProvisioned         ? { clientProvisioned: true  as const }            : {}),
      ...(essence !== undefined     ? { essence }                                       : {}),
      ...(preflightResult?.parties?.length ? { parties: preflightResult.parties, captionFound: preflightResult.captionFound } : {}),
    };
  }
}
