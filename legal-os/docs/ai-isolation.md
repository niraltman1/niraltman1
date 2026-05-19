# AI Isolation & Hallucination Prevention

## Principles

1. **Regex supremacy** — fields extractable by regex are never overridden by AI
2. **Context isolation** — each document gets its own prompt context; no cross-document leakage
3. **Prompt versioning** — prompts are immutable once registered; changes create a new version
4. **Mandatory validation** — every AI response passes through `AIValidator` before any field is accepted
5. **Audit trail** — every AI call is logged with a SHA-256 response hash for reproducibility

## Regex-Authoritative Fields

The following fields are extracted by regex *before* the AI call and cannot be overridden:

| Field            | Pattern                                | Example            |
|------------------|----------------------------------------|--------------------|
| `id_number`      | 9 consecutive digits                   | `123456782`        |
| `case_number`    | `\d+/\d{2,4}` (Hebrew court format)   | `1234/24`          |
| `bar_number`     | `עורך דין מס' \d+`                    | `12345`            |
| `document_date`  | `dd/mm/yyyy` → ISO 8601                | `2024-01-15`       |

These values are passed as `regexGroundTruth` to `AIValidator.validate()`. The validator replaces AI-supplied values with regex values for these fields regardless of AI confidence.

## Hallucination Detection

`AIValidator` maintains a list of patterns that indicate a hallucination or refusal:

- `i cannot determine`
- `i don't have enough information`
- `as an ai language model`
- `i'm not able to`
- `based on the context provided`
- `unable to extract`

If any of these patterns appear anywhere in the AI response (case-insensitive), the entire response is **rejected** and `validate()` returns `null`.

## Confidence Penalties

Even non-null responses are penalised for suspicious signals:

| Signal                          | Penalty |
|---------------------------------|---------|
| Each hallucination flag         | −0.10   |
| Each regex override applied     | −0.05   |
| Implausible future date (> now) | −0.10   |

## Prompt Management

```typescript
const pm = new PromptManager(db);
await pm.registerDefaults();            // seeds classify_document template

const prompt = await pm.render('classify_document', {
  ocr_text: doc.ocrText.slice(0, 2000),
  language: 'he',
});
```

Prompts are stored in `AIPromptVersions`:

```sql
AIPromptVersions (
  id          INTEGER PRIMARY KEY,
  prompt_key  TEXT NOT NULL,
  version     INTEGER NOT NULL,
  template    TEXT NOT NULL,
  prompt_hash TEXT NOT NULL UNIQUE,    -- SHA-256 of template
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Registering an identical template is a no-op (hash match). Registering a changed template deactivates the previous version and inserts a new one.

## Audit Log

Every enrichment call is recorded:

```sql
AIAuditLog (
  id                INTEGER PRIMARY KEY,
  enrichment_id     TEXT NOT NULL,
  document_id       INTEGER NOT NULL,
  prompt_version_id INTEGER,
  isolation_key     TEXT NOT NULL,      -- hash(doc_id + timestamp)
  response_hash     TEXT NOT NULL,      -- SHA-256 of raw AI response
  hallucination_flags TEXT,             -- JSON array of detected patterns
  regex_overrides   TEXT,               -- JSON array of overridden field names
  accepted          INTEGER NOT NULL,   -- 1 = passed validation, 0 = rejected
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
)
```

`verifyResponseIntegrity(enrichmentId, rawResponse)` re-hashes the response and compares to the stored hash — useful for detecting log tampering.

## Context Isolation

Each document is processed with a fresh Ollama context. The `isolationContext` field in `EnrichmentRequest` is set to `doc:{id}:{utcNow()}` and is never reused. This prevents the model from "remembering" previous documents in multi-document batches.

The OCR text passed to the model is capped at **2 000 characters** to keep context windows deterministic and prevent prompt injection via malicious OCR content.

## Ollama Model

Default model: `law-il-E2B` (fine-tuned for Israeli legal documents).

Fallback: `mistral` with a system prompt instructing Hebrew legal domain behaviour.

Model availability is checked via `OllamaClient.isAvailable()` before enrichment. If Ollama is unavailable, the pipeline skips enrichment and continues at reduced confidence.
