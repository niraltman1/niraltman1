# OCR Pipeline — Factum-IL v1.0.0

## Overview

The OCR pipeline processes three document types through dedicated lanes:
- **Text lane** — native PDF / DOCX / ODT (fast, high quality)
- **Image lane** — scanned PDFs and image files (Ghostscript + Tesseract)
- **Audio lane** — voice notes and audio files (ffmpeg → Whisper → Hebrew transcript)

All OCR results are stored in `Documents.ocr_text` and indexed in FTS5.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Ghostscript | 10+ | PDF → PNG rasterisation, DPI normalise |
| Tesseract | 5+ | OCR engine |
| heb.traineddata | tessdata_best | Hebrew recognition model |
| pdftotext | (poppler) | Native PDF text extraction |
| ffmpeg | 6+ | Audio format conversion |
| whisper-fast.exe | any | Hebrew speech-to-text (Windows) |

The installer (`publish.ps1` + Inno Setup 6) installs all prerequisites automatically. `ffmpeg.exe` and `whisper-fast.exe` are bundled in `{app}\tools\`.

---

## Pipeline Steps — Text Lane

```
Input PDF / DOCX / ODT
      │
      ▼
 1. Cache lookup (by file_hash in OCRCache)
      │ HIT → return cached result
      │ MISS ↓
      ▼
 2. Native PDF text extraction (pdftotext)
      │ quality ≥ 0.6 → classify + return
      │ quality < 0.6 ↓
      ▼
 3. Fall through to Image Lane
```

---

## Pipeline Steps — Image Lane

```
Input (scanned PDF / TIFF / PNG / JPG)
      │
      ▼
 1. Cache lookup (by file_hash)
      │ HIT → return cached result
      │ MISS ↓
      ▼
 2. Rasterise to PNG (Ghostscript, 300 DPI)
      │
      ▼
 3. Preprocess each page
      │  · Normalise to 300 DPI
      │  · Convert to grayscale
      ▼
 4. Rotation detection (Tesseract --psm 0 OSD)
      │  · Parse "Rotate: N" from OSD output
      ▼
 5. Rotation correction (Ghostscript rotate filter)
      │
      ▼
 6. Tesseract OCR (-l heb+eng, hOCR + txt)
      │
      ▼
 7. Quality scoring
      │
      ▼
 8. Cache result → store in OCRCache → return
```

---

## Pipeline Steps — Audio Lane

```
Input (.opus / .m4a / .mp3 / .ogg / .wav — WhatsApp voice notes, recordings)
      │
      ▼
 1. ffmpeg converts to 16kHz mono WAV
      │  ffmpeg -i input.opus -ar 16000 -ac 1 -y output.wav
      │
      ▼
 2. whisper-fast.exe transcribes to Hebrew text
      │  whisper-fast.exe output.wav --language he --model $WHISPER_MODEL
      │
      ▼
 3. Transcript stored in Documents.ocr_text
      │
      ▼
 4. Continues as text document through Classification → Enrichment → Indexing
```

### Audio Graceful Degradation

If `FFMPEG_EXE` or `WHISPER_EXE` is not set, or the binary is not found:
- Audio file is registered in `Documents` with `ocr_text = ''`
- A warning is logged: `[AudioPipeline] ffmpeg/whisper not available — transcript skipped`
- Processing continues — the document enters the pipeline with an empty text body
- The document can be manually transcribed and updated later

**whisper-fast.exe is Windows-only.** On non-Windows development machines, the audio lane always falls back to the graceful degradation path.

---

## Quality Score

```
score = (density × 0.3) + (wordScore × 0.4) + (hebrewRatio × 0.3)
```

| Signal | Weight | Calculation |
|--------|--------|-------------|
| density | 30% | `min(wordCount / 100, 1.0)` — penalises near-empty pages |
| wordScore | 40% | `min(avgWordLen / 5, 1.0)` — penalises OCR garbage |
| hebrewRatio | 30% | Fraction of characters in Hebrew Unicode block |

Threshold: **0.6** — below this, the result is flagged as low quality and may trigger manual review.

---

## Multi-Language Support

Tesseract is invoked with `-l heb+eng` for mixed Hebrew/English documents. The `heb.traineddata` file from `tessdata_best` provides significantly better accuracy than the standard model, especially for:
- Legal typesetting with varied fonts
- Mixed RTL/LTR documents
- Documents with underlined or bold Hebrew text

**Only `heb+eng` is used.** Adding Arabic (`ara`) causes character confusion in mixed Hebrew documents and is explicitly excluded.

---

## Cache (OCRCache, migration 035)

```sql
OCRCache (
  file_hash     TEXT PRIMARY KEY,
  ocr_text      TEXT NOT NULL,
  quality_score REAL NOT NULL,
  page_count    INTEGER,
  lane          TEXT,            -- 'text' | 'image' | 'audio'
  cached_at     TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Cache is keyed by `file_hash` (SHA-256). It is never invalidated unless the file content changes (hash changes). Cached audio transcripts are also stored here with `lane = 'audio'`.

---

## TypeScript API

```typescript
const ocr = new OCRService(db);
const result = await ocr.run(filePath, fileHash, mimeType);
// result: {
//   text: string;
//   quality: number;
//   pageCount: number;
//   fromCache: boolean;
//   lane: 'text' | 'image' | 'audio';
// }
```

---

## Document Storage

After OCR:
- `Documents.ocr_text` — full extracted text (or transcript for audio)
- `Documents.processing_state` — advances to `OCR_COMPLETE`
- `Documents.ocr_quality` — quality score (0.0–1.0)
- `Documents.page_count` — number of pages (1 for audio files)
- `Documents.is_audio_transcript` — boolean, true for audio lane results

---

## Routing Logic

```typescript
function routeToLane(mimeType: string, filePath: string): 'text' | 'image' | 'audio' {
  const audioExtensions = ['.opus', '.m4a', '.mp3', '.ogg', '.wav'];
  const imageExtensions = ['.tiff', '.tif', '.png', '.jpg', '.jpeg'];

  const ext = path.extname(filePath).toLowerCase();

  if (audioExtensions.includes(ext)) return 'audio';
  if (imageExtensions.includes(ext)) return 'image';
  if (mimeType === 'application/pdf') {
    // try text lane first; fall through to image lane if quality < 0.6
    return 'text';
  }
  // .docx, .doc, .odt → text lane
  return 'text';
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty OCR text from PDF | Missing heb.traineddata | Run `.\START-HERE.ps1 -Mode Repair` |
| Wrong rotation on output | Low-confidence OSD | Pre-rotate with image editor |
| Quality score always < 0.3 | Ghostscript not in PATH | Check winget installation of Ghostscript |
| Arabic chars in output | Wrong Tesseract language flags | Use `-l heb+eng` only |
| Audio transcript empty | whisper-fast.exe not found | Check `WHISPER_EXE` env var points to the binary |
| ffmpeg conversion fails | ffmpeg not in PATH | Check `FFMPEG_EXE` env var or add ffmpeg to PATH |
| Transcript in wrong language | Wrong `WHISPER_MODEL` | Use `medium` or `large` for best Hebrew accuracy |
