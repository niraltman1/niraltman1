# OCR Pipeline — Factum-IL v1.0.0

> **2026-06-07 correction:** This document previously described `OCRService`
> (Ghostscript rasterisation → Tesseract → `OCRCache`, with quality scoring)
> as *the* pipeline. That class exists in `packages/pipeline/src/ocr-service.ts`
> but is **not wired into any production code path** — it is exercised only by
> its own unit tests. The live pipeline is `MediaPipeline`
> (`packages/api/src/utils/media-pipeline.ts`), which uses a simpler, async
> (`execFile`-based, non-blocking) toolchain described below. See
> "Scanned / Image-Based PDFs — OCR Fallback" below for how `OCRService`
> was subsequently wired in (2026-06-07) as the fallback for that lane —
> it is no longer orphaned, just not the primary pipeline.

## Overview

The live pipeline (`MediaPipeline`) routes incoming files through two lanes
based on file type, plus a separate audio-transcription path:

- **Text lane** — native PDFs (`pdftotext` / Poppler) and DOCX/DOC/ODT
- **Image lane** — image files: JPG/PNG/TIFF/HEIC (Tesseract → searchable PDF)
- **Audio lane** — voice notes / recordings (ffmpeg → whisper-fast.exe → Hebrew transcript)

All processing runs as async child processes (`child_process.execFile`,
promisified) directly on the Node.js event loop — see the header comment in
`media-pipeline.ts`: *"Runs entirely in the Node.js event loop (no
worker_threads needed) because `child_process.execFile` is non-blocking —
[the OCR binary] runs as a separate OS process, yielding the event loop
during conversion."* This is what keeps the API responsive while OCR runs;
no API request is ever blocked on an OCR call.

OCR/extracted text is stored in `Documents.ocr_text` and indexed in FTS5.

---

## Prerequisites

| Tool | Version | Purpose | Configured via |
|------|---------|---------|----------------|
| Tesseract | 5+ | Image → searchable PDF + plain-text OCR | `tesseract`/`tesseract.exe` on PATH |
| heb.traineddata | tessdata_best | Hebrew recognition model | bundled with Tesseract install |
| pdftotext | (poppler) | Native PDF text extraction | `PDFTOTEXT_EXE` env var |
| ImageMagick | any | HEIC/HEIF → JPEG conversion | `magick`/`convert` on PATH |
| ffmpeg | 6+ | Audio format conversion | `FFMPEG_EXE` env var (default: `ffmpeg` on PATH) |
| whisper-fast.exe | any | Hebrew speech-to-text (Windows) | `WHISPER_EXE` env var |

The installer (`publish.ps1` + Inno Setup 6) installs these prerequisites and bundles `ffmpeg.exe`/`whisper-fast.exe` in `{app}\tools\`.

---

## Pipeline Steps — Text Lane (`media-pipeline.ts` → `extractPdfText`)

```
Input native PDF
      │
      ▼
 pdftotext -layout -enc UTF-8  (Poppler, async execFile, 15s timeout)
      │
      ├─ success, non-empty text → store in Documents.ocr_text, log 'ocr_success'
      ├─ empty text              → log 'failed_ocr'
      │                             ("PDF processed without extracted text —
      │                              possibly an image-based or partially
      │                              encrypted PDF") — falls back to OCR (see below)
      └─ pdftotext error/ENOENT  → log 'failed_ocr' with the underlying error
```

DOCX/DOC/ODT files are routed to the text lane as well (handled upstream by
the document-name/registration logic; no OCR step is needed for native
text formats).

---

## Pipeline Steps — Image Lane (`media-pipeline.ts` → `convertImageToPdf`)

```
Input image (JPG / PNG / TIFF / HEIC / HEIF)
      │
      ▼
 1. HEIC/HEIF? → convert to JPEG via ImageMagick (`magick`/`convert`, 30s timeout)
      │
      ▼
 2. Tesseract → searchable PDF
      │  tesseract <image> <outputBase> -l heb+eng --dpi 300 pdf   (120s timeout)
      │  (original image as background + invisible hOCR text layer)
      ▼
 3. Tesseract (txt mode) → plain OCR text for DB preview/search
      │  tesseract <image> <tmpBase> -l heb+eng --dpi 300 txt      (120s timeout)
      ▼
 4. Store: Documents.ocr_text = plain text, converted PDF registered as the document
```

There is **no Ghostscript rasterisation, rotation-correction, or quality-scoring
step** in the live image lane — Tesseract is invoked directly on the source
image. There is also **no `OCRCache` lookup** — every file is processed fresh
(deduplication instead happens earlier, via the `ProcessedFiles` hash registry).

---

## Scanned / Image-Based PDFs — OCR Fallback (closed 2026-06-07)

A PDF whose pages are scanned images (no embedded text layer) produces
**empty output from `pdftotext`**. The live text lane now falls through to a
worker-thread OCR pass for exactly this case: when `extractPdfText` returns
empty text for a `.pdf`, `MediaPipeline` calls `runOCRInWorker` (Tesseract via
`OCRService`, wrapped in `node:worker_threads` so the event loop stays
responsive — see `packages/pipeline/src/ocr-runner.ts`). The result:

- **Fallback succeeds** → `ocrText` is populated from the OCR pass, the
  document is registered as fully searchable, and `PipelineLogs` records
  `ocr_success` with a note that the text came from the OCR fallback
  (including the OCR confidence score).
- **Fallback also yields no text** (e.g. blank/corrupt pages) → `PipelineLogs`
  records `failed_ocr`; the document is still registered (openable, just not
  full-text searchable) — same graceful-degradation behavior as before.
- **Fallback throws** (e.g. Tesseract binary missing) → caught and logged as
  `failed_ocr` with the underlying error; ingestion is never blocked, per
  CLAUDE.md "AI steps must fail gracefully".

Implementation: `packages/api/src/utils/media-pipeline.ts` (`.pdf` branch of
`MediaPipeline.ingest`), tested in `media-pipeline.test.ts`. The fallback runs
with `dbPath: null` (no `OCRCache` wiring — this is a rare path for
already-mis-OCR'd scanned PDFs, so caching was intentionally left out of scope
to avoid threading a raw DB path through `MediaPipeline`'s constructor across
its three call sites).

This closes the gap previously tracked as a CT1 follow-up in
`reports/דוח-חוב-טכני.md`.

---

## Pipeline Steps — Audio Lane (`audio-pipeline.ts` → `processAudio`)

Supported extensions: **`.ogg`, `.m4a`, `.mp3`, `.wav`** (`AUDIO_EXTENSIONS` in
`audio-pipeline.ts` — note `.opus` is *not* currently in this set, even
though WhatsApp commonly produces `.opus`/`.ogg;codecs=opus` voice notes; `.ogg`
is covered).

```
Input audio file
      │
      ▼
 1. ffmpeg → 16kHz mono WAV
      │  ffmpeg -y -i <input> -ar 16000 -ac 1 -c:a pcm_s16le <output.wav>   (60s timeout)
      │
      ▼
 2. whisper-fast.exe → Hebrew transcript (with retry/backoff via withRetry)
      │  whisper-fast.exe -m $WHISPER_MODEL -l he -f <wav> -otxt -of <outBase> (5 min timeout)
      │
      ▼
 3. Transcript stored in Documents.ocr_text
      │
      ▼
 4. Continues as a text document through Classification → Enrichment → Indexing
```

### Audio Graceful Degradation

If `WHISPER_EXE` (default `<FACTUM_IL_ROOT>\tools\whisper-fast.exe`) is not
found:
- The audio file is still registered in `Documents`, with `ocr_text = ''`
- Processing continues — per CLAUDE.md's "AI steps must fail gracefully" rule,
  a missing transcription tool never blocks ingestion
- The document can be manually transcribed and updated later

**whisper-fast.exe is Windows-only.** On non-Windows development machines, the
audio lane always falls back to the graceful-degradation path.

---

## Multi-Language Support

Tesseract is invoked with `-l heb+eng` for mixed Hebrew/English documents
(both the image lane's PDF conversion and its plain-text extraction, and
`whisper-fast.exe` is invoked with `-l he`). The `heb.traineddata` file from
`tessdata_best` provides significantly better accuracy than the standard
model for legal typesetting, mixed RTL/LTR documents, and underlined/bold
Hebrew text.

**Only `heb+eng` is used.** Adding Arabic (`ara`) causes character confusion
in mixed Hebrew documents and is explicitly excluded.

---

## Document Storage

After processing:
- `Documents.ocr_text` — full extracted text / transcript (empty string when
  extraction fails or degrades gracefully)
- `Documents.processing_state` — advances through the pipeline state machine
- `PipelineLogs` — records `ocr_success` / `failed_ocr` per file, with the
  underlying error message when extraction fails

Note: `Documents.ocr_quality`, `Documents.page_count`, and
`Documents.is_audio_transcript` referenced in earlier drafts of this document
are part of the `OCRService` design and are **not** populated by the live
pipeline (the OCR fallback above consumes `OCRService`'s result but does not
persist these extra fields back to `Documents`).

---

## Routing Logic (as actually implemented in `media-pipeline.ts`)

```typescript
// Simplified from MediaPipeline.processFile():
if (AUDIO_EXTENSIONS.has(ext)) {
  // → processAudio() — ffmpeg + whisper-fast.exe
} else if (isImageExtension(ext)) {
  // → convertImageToPdf() — ImageMagick (HEIC only) + Tesseract
} else if (ext === '.pdf') {
  // → extractPdfText() — pdftotext (Poppler); empty result (scanned/
  //   image-based PDF) falls back to runOCRInWorker (Tesseract via OCRService)
}
// .docx / .doc / .odt → registered without an OCR step (native text)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `failed_ocr` / empty text from a scanned PDF | OCR fallback also failed (e.g. Tesseract missing, or pages too degraded for OCR) | Check `PipelineLogs.error_message` for the underlying cause; verify Tesseract + `heb.traineddata` are installed (`.\START-HERE.ps1 -Mode Repair`), or re-export the PDF as higher-quality images and re-ingest via the image lane |
| `pdftotext binary not found` | `PDFTOTEXT_EXE` not set / Poppler not installed | Set `PDFTOTEXT_EXE` to the correct path, or run `.\START-HERE.ps1 -Mode Repair` |
| Empty/garbled OCR text from images | Missing `heb.traineddata` | Run `.\START-HERE.ps1 -Mode Repair` |
| Arabic chars in output | Wrong Tesseract language flags | Use `-l heb+eng` only |
| HEIC image fails to convert | ImageMagick (`magick`/`convert`) not on PATH | Install ImageMagick / check winget installation |
| Audio transcript empty | `whisper-fast.exe` not found | Check `WHISPER_EXE` env var points to the binary |
| `.opus` voice note not transcribed | `.opus` is not in `AUDIO_EXTENSIONS` | Add `.opus` to `AUDIO_EXTENSIONS` in `audio-pipeline.ts`, or rename to `.ogg` |
| ffmpeg conversion fails | ffmpeg not in PATH | Check `FFMPEG_EXE` env var or add ffmpeg to PATH |
| Transcript in wrong language | Wrong `WHISPER_MODEL` | Use `medium` or `large` for best Hebrew accuracy |
