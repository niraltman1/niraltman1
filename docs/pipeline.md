# Pipeline — Document Processing Engine

## Overview

The pipeline processes every incoming document through a deterministic state machine. Each stage is atomic, crash-safe, and idempotent. Processing state is durably stored in SQLite so the pipeline can resume after any failure.

All documents pass through the Data Firewall at intake before any processing begins.

---

## State Machine

```
DISCOVERED → HASHED → OCR_PENDING → OCR_COMPLETE → CLASSIFIED → ENRICHED → REVIEW_PENDING → APPLIED → VERIFIED
                                                                                  ↓ (any failure)
                                                                                FAILED → ROLLED_BACK
```

| State | Description |
|-------|-------------|
| DISCOVERED | File found in watch directory, not yet processed |
| HASHED | SHA-256 hash computed and stored, deduplication checked |
| OCR_PENDING | Queued for OCR processing |
| OCR_COMPLETE | OCR text extracted and quality-scored |
| CLASSIFIED | Document type and metadata determined |
| ENRICHED | AI enrichment applied (optional, advisory only) |
| REVIEW_PENDING | Awaiting human approval before applying |
| APPLIED | Changes committed to the database |
| VERIFIED | Human-verified final state |
| FAILED | A stage failed after max retries |
| ROLLED_BACK | Document restored to pre-processing state |

---

## Full Pipeline — Stage by Stage

### Intake → Data Firewall Check

Before any processing, every incoming file path is checked against `EXCLUDED_PATTERNS`:

```
Blocked: /סיעוד/ /רפואה/ /חן/ /Nursing/ /Medical/ /Healthcare/
         *.סיעוד.pdf *nursing* *medical_report*
         node_modules .git __MACOSX System32 Windows\
```

Files matching any pattern are rejected with a `DATA_FIREWALL_BLOCKED` log entry. Processing does not proceed.

**Academic bypass:** Files under an `ACADEMIC_ROOT` path are exempt from nursing/medical blocking — they are routed to the Academic Hub pipeline, not the legal pipeline.

---

### Stage 1 — File Type Routing

After passing the Data Firewall, the file MIME type determines which OCR lane handles it:

| File type | Lane |
|-----------|------|
| `.pdf` (native text) | Text lane (pdftotext) |
| `.pdf` (scanned image) | Image lane (Ghostscript + Tesseract) |
| `.docx`, `.doc`, `.odt` | Text lane (docx extraction) |
| `.tiff`, `.png`, `.jpg`, `.jpeg` | Image lane (Tesseract direct) |
| `.mp3`, `.m4a`, `.opus`, `.ogg`, `.wav` | Audio lane (ffmpeg + Whisper) |

---

### Stage 2 — Hash

- Streams the file with Node.js `crypto.createHash('sha256')`
- Checks `Documents.file_hash` for duplicates — returns existing ID if found (idempotent)
- Records file size, mtime, and MIME type

---

### Stage 3 — OCR (Multi-Lane)

#### Text Lane (PDF / DOCX)

1. Cache lookup — check `OCRCache` by file hash (HIT: return cached result immediately)
2. Native PDF text extraction via `pdftotext`
3. Quality score computed — if ≥ 0.6, proceed to Classification
4. If quality < 0.6, fall through to Image Lane

#### Image Lane (Scanned PDF / Image Files)

1. Ghostscript rasterises PDF to PNG at 300 DPI
2. Per-page preprocessing: normalise to 300 DPI, convert to grayscale
3. Tesseract OSD (`--psm 0`) detects rotation angle
4. Ghostscript applies rotation correction
5. Tesseract OCR (`-l heb+eng`, using `heb.traineddata` tessdata_best)
6. Quality score computed
7. Result cached in `OCRCache` by file hash

**Quality score formula:**
```
score = (density × 0.3) + (wordScore × 0.4) + (hebrewRatio × 0.3)
```
- density: `min(wordCount / 100, 1.0)` — penalises near-empty pages
- wordScore: `min(avgWordLen / 5, 1.0)` — penalises OCR garbage
- hebrewRatio: fraction of characters in Hebrew Unicode block

Threshold: **0.6** — below this, flagged as low quality.

#### Audio Lane (WhatsApp Voice Notes / Audio Files)

1. ffmpeg converts the input file (`.opus`, `.m4a`, `.ogg`, `.mp3`) to 16kHz mono WAV:
   ```
   ffmpeg -i input.opus -ar 16000 -ac 1 output.wav
   ```
2. `whisper-fast.exe` transcribes the WAV to Hebrew text:
   ```
   whisper-fast.exe output.wav --language he --model medium
   ```
3. The Hebrew transcript is stored in `Document.ocr_text`
4. Processing continues as a text document from this point

**Graceful degradation:** If `WHISPER_EXE` or `FFMPEG_EXE` is absent, audio files are registered in the database with `ocr_text = ''`. A warning is logged; the pipeline does not crash.

---

### Stage 4 — Hebrew Extraction

After OCR, the pipeline extracts Israeli legal identifiers using regex (authoritative — never overridden by AI):

| Identifier | Pattern | Example |
|------------|---------|---------|
| ID number (ת.ז.) | 9 digits with Luhn check | `123456782` |
| Civil — Magistrate | `תא-YYYY-NNN` | `תא-2024-042` |
| Criminal | `ת"פ-YYYY-NNN` | `ת"פ-2023-005` |
| Supreme Court | `בג"ץ NNNN/YY` | `בג"ץ 6821/93` |
| Civil Appeal | `ע"א NNNN/YY` | `ע"א 5678/22` |
| Labor | `עב-YYYY-NNN` | `עב-2024-001` |
| Family | `תמש-YYYY-NNN` | `תמש-2024-010` |
| Administrative | `עת"מ-YYYY-NNN` | `עת"מ-2023-088` |
| Bar number | `עורך דין מס' \d+` | `12345` |
| Document date | `dd/mm/yyyy` → ISO 8601 | `2024-01-15` |

---

### Stage 5 — FTS5 Indexing

After text extraction, `ocr_text` is indexed into FTS5 virtual tables:

- `fts_documents` — OCR text, filename, document type
- `fts_clients`, `fts_contacts`, `fts_evidence`, `fts_study_questions` — domain-specific FTS tables

FTS5 uses the `unicode61` tokenizer. Hebrew prefix normalisation and synonym expansion are applied at query time, not index time.

---

### Stage 6 — RAG Enrichment and Vector Embedding

The RAG worker (background, `RAG_INTERVAL_MS` schedule, default 60 seconds) processes documents with `ai_enriched = 0`:

1. Health-checks Ollama: `GET http://127.0.0.1:11434/api/tags`
2. If Ollama is down: logs warning, skips this cycle, continues
3. Splits `ocr_text` into chunks (max 512 tokens each)
4. Embeds each chunk via Ollama embedding endpoint
5. Stores chunk vectors in `vec_chunks` (data_store schema, migration 052)
6. Calls the 5-step reasoning chain for AI enrichment
7. Validates AI response via `ai-guardrails` package
8. Stores accepted enrichment in `AIEnrichmentLog`; rejected responses in `GuardrailsLog`
9. Sets `Documents.ai_enriched = 1`

**Batch size:** Controlled by `RAG_BATCH_SIZE` env var (default 10 documents per cycle).

---

### Stage 7 — Agent Analysis

When an attorney triggers an agent on a case, the orchestrator:

1. Checks RBAC — attorney must be assigned to the case
2. Checks for existing active agent (`AgentExecutionLog` — 409 AGENT_BUSY if running)
3. Loads `CaseExecutionContext` — case metadata, assigned documents, memory from `CaseMemory`
4. Runs the 5-step reasoning chain (Context → Classification → Authorities → Conflict/Risk → Conclusion)
5. Streams results via SSE to the dashboard in real time
6. Saves result to `AgentResults` with confidence score
7. Flags result for human review if confidence < threshold
8. Updates `AgentExecutionLog` with completion status

---

## Crash Safety

Before each stage, `PipelineEngine` does:

1. Acquires a distributed lock on `doc:{id}` via `LockService` (stored in `Locks` table)
2. Creates a `ManifestSnapshot` capturing the current document row
3. Writes a `BEGIN` entry to `TransactionJournal`
4. Executes the stage
5. Writes `COMMIT` on success, or `ROLLBACK` + restores file on failure

On startup, `ManifestTransactionEngine.replay()` replays any `INTERRUPTED` journal entries. Lock TTL is 5 minutes — a crashed worker's lock auto-expires.

---

## Concurrency

- One lock per document — multiple pipeline workers never process the same document simultaneously
- Queue dequeue is a single atomic `UPDATE … WHERE worker_id IS NULL` inside a SQLite transaction
- RAG worker processes documents in batches to avoid saturating the queue
- Agents enforce single-active-agent-per-case via `AgentExecutionLog`

---

## Performance

| Benchmark | Target |
|-----------|--------|
| Hash 100 MB PDF | < 800ms |
| Native PDF text extraction | < 200ms |
| Tesseract OCR single page | < 3s |
| Full pipeline (native text) | < 5s |
| Full pipeline (scanned, 10 pages) | < 60s |
| Audio transcription (1 min voice note) | < 30s |
| FTS5 search across 100k docs | < 200ms |
| Vector KNN search (top-10) | < 50ms |
