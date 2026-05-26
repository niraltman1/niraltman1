# OCR Pipeline

## Prerequisites

| Tool         | Version    | Purpose                                |
|--------------|------------|----------------------------------------|
| Ghostscript  | 10+        | PDF → PNG rasterisation, DPI normalise |
| Tesseract    | 5+         | OCR engine                             |
| heb.traineddata | tessdata_best | Hebrew recognition model        |
| pdftotext    | (poppler)  | Native PDF text extraction             |

The installer (`START-HERE.ps1`) installs all prerequisites automatically.

## Pipeline Steps

```
Input PDF/Image
      │
      ▼
 1. Cache lookup (by file hash)
      │ HIT → return cached result
      │ MISS ↓
      ▼
 2. Native PDF text extraction (pdftotext)
      │ quality ≥ 0.6 → classify + return
      │ quality < 0.6 ↓
      ▼
 3. Rasterise to PNG (Ghostscript, 300 DPI)
      │
      ▼
 4. Preprocess each page
      │  · Normalise to 300 DPI
      │  · Convert to grayscale
      ▼
 5. Rotation detection (Tesseract --psm 0 OSD)
      │  · Parse "Rotate: N" from OSD output
      ▼
 6. Rotation correction (Ghostscript rotate filter)
      │
      ▼
 7. Tesseract OCR (-l heb+eng, hOCR + txt)
      │
      ▼
 8. Quality scoring
      │
      ▼
 9. Cache result → return
```

## Quality Score

```
score = (density × 0.3) + (wordScore × 0.4) + (hebrewRatio × 0.3)
```

| Signal        | Weight | Calculation                                            |
|---------------|--------|--------------------------------------------------------|
| density       | 30%    | `min(wordCount / 100, 1.0)` — penalises near-empty pages |
| wordScore     | 40%    | `min(avgWordLen / 5, 1.0)` — penalises OCR garbage     |
| hebrewRatio   | 30%    | Fraction of characters in Hebrew Unicode block         |

Threshold: **0.6** — below this, the result is flagged as low quality.

## Multi-Language Support

Tesseract is invoked with `-l heb+eng` for mixed documents. The Hebrew model (`heb.traineddata`) from the `tessdata_best` repository provides significantly better accuracy than the standard model, especially for legal typesetting with varied fonts.

## Cache

Results are stored in `OCRCache` keyed by `file_hash`:

```sql
OCRCache (
  file_hash    TEXT PRIMARY KEY,
  ocr_text     TEXT NOT NULL,
  quality_score REAL NOT NULL,
  page_count   INTEGER,
  cached_at    TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Cache is never invalidated unless the file hash changes (i.e., the file content changes).

## PowerShell API

| Function                | Description                                       |
|-------------------------|---------------------------------------------------|
| `Invoke-OCR`            | Full pipeline entry point                         |
| `Invoke-ImagePreprocess` | Ghostscript DPI normalisation                    |
| `Get-RotationAngle`     | Tesseract OSD rotation detection                  |
| `Invoke-RotationCorrection` | Ghostscript rotate transform                  |
| `Get-OCRQualityScore`   | 4-signal quality scorer                           |
| `Get-CachedOCRResult`   | Lookup by file_hash                               |
| `Save-OCRCache`         | Persist result after processing                   |

## TypeScript API

```typescript
const ocr = new OCRService(db);
const result = await ocr.run(filePath, fileHash);
// result: { text: string; quality: number; pageCount: number; fromCache: boolean }
```

## Troubleshooting

| Symptom                     | Cause                           | Fix                                       |
|-----------------------------|---------------------------------|-------------------------------------------|
| Empty OCR text              | Missing heb.traineddata         | Run `START-HERE.ps1 -Mode Repair`         |
| Wrong rotation on output    | Low-confidence OSD              | Pre-rotate with image editor              |
| Quality score always < 0.3  | Ghostscript not in PATH         | Check winget installation of Ghostscript  |
| Arabic chars in output      | heb+ara model conflict          | Use `-l heb+eng` only                     |
