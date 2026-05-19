# Pipeline — Document Processing Engine

## Overview

The pipeline processes every incoming document through a deterministic state machine. Each stage is atomic, crash-safe, and idempotent. Processing state is durably stored in SQLite so the pipeline can resume after any failure.

## State Machine

```
DISCOVERED → HASHED → OCR_PENDING → OCR_COMPLETE → CLASSIFIED → ENRICHED → REVIEW_PENDING → APPLIED → VERIFIED
                                                                                ↓ (on any failure)
                                                                              FAILED → ROLLED_BACK
```

| State           | Description                                              |
|-----------------|----------------------------------------------------------|
| DISCOVERED      | File found in watch directory, not yet processed         |
| HASHED          | SHA-256 hash computed and stored, deduplication checked  |
| OCR_PENDING     | Queued for OCR processing                                |
| OCR_COMPLETE    | OCR text extracted and quality-scored                    |
| CLASSIFIED      | Document type and metadata determined                    |
| ENRICHED        | AI enrichment applied (optional, advisory only)          |
| REVIEW_PENDING  | Awaiting human approval before applying                  |
| APPLIED         | Changes committed to the database                        |
| VERIFIED        | Human-verified final state                               |
| FAILED          | A stage failed after max retries                         |
| ROLLED_BACK     | Document restored to pre-processing state                |

## Stages

### 1. Hash
- Streams the file with Node.js `crypto.createHash('sha256')`
- Checks `Documents.file_hash` for duplicates (returns existing ID)
- Records file size, mtime, and MIME type

### 2. OCR
- Extracts native PDF text first (faster, higher quality)
- Falls back to: Ghostscript rasterisation → rotation correction → Tesseract
- Quality score thresholds: ≥ 0.6 passes, < 0.4 triggers rasterisation fallback
- Results cached in `OCRCache` by file hash

### 3. Classification
- Regex patterns are authoritative for Hebrew and English legal documents
- AI enrichment is advisory only — never overrides regex-extracted fields
- Supported types: CONTRACT, COURT_DECISION, PLEADING, POWER_OF_ATTORNEY, ID_DOCUMENT, INVOICE, CORRESPONDENCE

### 4. Enrichment
- Calls Ollama with an isolated context (max 2 000 chars of OCR text)
- Prompt version is pinned in `AIPromptVersions`; changing a prompt increments the version
- AI response is validated by `AIValidator` before any field is accepted
- Response hash stored in `AIAuditLog` for reproducibility

### 5. Review
- Documents with `confidence < 0.75` land in REVIEW_PENDING
- Human approves or rejects in the Action Queue UI
- Rejection resets state to DISCOVERED for reprocessing

## Crash Safety

Before each stage, `PipelineEngine` does:
1. Acquires a distributed lock on `doc:{id}` via `LockService`
2. Creates a `ManifestSnapshot` capturing the current document row
3. Writes a `BEGIN` entry to `TransactionJournal`
4. Executes the stage
5. Writes `COMMIT` on success, or `ROLLBACK` + restores file on failure

On startup, `CrashRecovery.Invoke-FullRecovery` / `ManifestTransactionEngine.replay()` replays any `INTERRUPTED` journal entries.

## Concurrency

- One lock per document — multiple pipeline workers never process the same document simultaneously
- Lock TTL is 5 minutes; a crashed worker's lock auto-expires and the item returns to the queue
- Queue dequeue is a single atomic `UPDATE … WHERE worker_id IS NULL` inside a SQLite transaction

## Performance

| Benchmark                         | Target  |
|-----------------------------------|---------|
| Hash 100 MB PDF                   | < 800ms |
| Native PDF text extraction        | < 200ms |
| Tesseract OCR single page         | < 3s    |
| Full pipeline (native text)       | < 5s    |
| Full pipeline (scanned, 10 pages) | < 60s   |
| FTS5 search across 100k docs      | < 50ms  |
