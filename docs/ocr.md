# OCR Pipeline — Factum-IL v1.0.0

> **2026-06-07 correction:** This document previously described `OCRService`
> (Ghostscript rasterisation → Tesseract → `OCRCache`, with quality scoring)
> as *the* pipeline. That class exists in `packages/pipeline/src/ocr-service.ts`
> but is **not wired into any production code path** — it is exercised only by
> its own unit tests. The live pipeline is `MediaPipeline`
> (`packages/api/src/utils/media-pipeline.ts`), which uses a simpler, async
> (`execFile`-based, non-blocking) toolchain described below. See
> "Known Gap — Scanned/Image-Based PDFs" for the practical consequence of
> this drift and what `OCRService` could be used for if wired up.

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
      │                              encrypted PDF") — see Known Gap below
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

## Known Gap — Scanned / Image-Based PDFs

A PDF whose pages are scanned images (no embedded text layer) will produce
**empty output from `pdftotext`**. The live text lane does *not* fall through
to an image-OCR step for this case — it logs `failed_ocr` with the message
*"PDF processed without extracted text — possibly image-based or partially
encrypted"* and leaves `Documents.ocr_text` empty. The document is still
registered and can be opened, but it will not be full-text searchable until
manually re-processed.

`packages/pipeline/src/ocr-service.ts` (`OCRService`) implements exactly the
missing piece — Ghostscript rasterisation → preprocessing → rotation
correction → Tesseract OCR → quality scoring → `OCRCache` (migration 035) —
and `packages/pipeline/src/ocr-runner.ts` (`runOCRInWorker`) already wraps it
in a `node:worker_threads` worker with a promise-based API (fully unit-tested
in `__tests__/ocr-runner.test.ts`). **Neither is currently invoked from
`MediaPipeline`.** Wiring `runOCRInWorker` in as the image-based-PDF fallback
— triggered when `extractPdfText` returns empty text for a `.pdf` — would close
this gap using infrastructure that already exists and is already tested. This
is tracked as a follow-up item (see `reports/דוח-חוב-טכני.md`, item CT1).

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
are part of the `OCRService` design (see Known Gap above) and are **not**
populated by the live pipeline.

---

## Routing Logic (as actually implemented in `media-pipeline.ts`)

```typescript
// Simplified from MediaPipeline.processFile():
if (AUDIO_EXTENSIONS.has(ext)) {
  // → processAudio() — ffmpeg + whisper-fast.exe
} else if (isImageExtension(ext)) {
  // → convertImageToPdf() — ImageMagick (HEIC only) + Tesseract
} else if (ext === '.pdf') {
  // → extractPdfText() — pdftotext (Poppler); empty result is logged,
  //   NOT retried via image OCR (see Known Gap)
}
// .docx / .doc / .odt → registered without an OCR step (native text)
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `failed_ocr` / empty text from a scanned PDF | No image-OCR fallback for image-based PDFs (Known Gap above) | Re-export the PDF as images and re-ingest via the image lane, or wait for the `OCRService` fallback to be wired in |
| `pdftotext binary not found` | `PDFTOTEXT_EXE` not set / Poppler not installed | Set `PDFTOTEXT_EXE` to the correct path, or run `.\START-HERE.ps1 -Mode Repair` |
| Empty/garbled OCR text from images | Missing `heb.traineddata` | Run `.\START-HERE.ps1 -Mode Repair` |
| Arabic chars in output | Wrong Tesseract language flags | Use `-l heb+eng` only |
| HEIC image fails to convert | ImageMagick (`magick`/`convert`) not on PATH | Install ImageMagick / check winget installation |
| Audio transcript empty | `whisper-fast.exe` not found | Check `WHISPER_EXE` env var points to the binary |
| `.opus` voice note not transcribed | `.opus` is not in `AUDIO_EXTENSIONS` | Add `.opus` to `AUDIO_EXTENSIONS` in `audio-pipeline.ts`, or rename to `.ogg` |
| ffmpeg conversion fails | ffmpeg not in PATH | Check `FFMPEG_EXE` env var or add ffmpeg to PATH |
| Transcript in wrong language | Wrong `WHISPER_MODEL` | Use `medium` or `large` for best Hebrew accuracy |
