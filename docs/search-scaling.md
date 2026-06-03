# Search Scaling & Hebrew Optimisation — Factum-IL v1.0.0

## Architecture

Search is a hybrid two-layer system: FTS5 keyword search and sqlite-vec KNN vector search, combined at the result level.

```
Raw query
    │
    ▼
1. normaliseHebrew()          — strip nikud, lowercase Latin, trim
    │
    ▼
2. buildFTSQuery()            — prefix strip + synonym expand + wildcard
    │
    ▼
3. resolveDocIdFilter()       — SearchMeta B-tree pre-filter (optional)
    │                            uses B-tree indexes, sub-1ms
    ▼
4a. FTS5 search               — BM25 + rank boosts
4b. sqlite-vec KNN search     — cosine similarity, top-N neighbors
    │
    ▼
5. Hybrid merge               — RRF (Reciprocal Rank Fusion) of FTS5 + vector results
    │
    ▼
6. Sort + deduplicate + slice
    │
    ▼
7. Cache in RetrievalCache (migration 046, TTL 60s)
    │
    ▼
Result
```

---

## Hebrew Normalisation

### Nikud Stripping

Vowel diacritics (U+05B0–U+05C7) are stripped from both the query and the FTS index. Diacritised and unvocalised text match correctly.

### Prefix Normalisation

Common Hebrew prefixes are stripped before FTS matching:

| Prefix class | Examples |
|-------------|---------|
| Single-char | ו (and), ב (in), ל (to), מ (from), כ (like), ש (that), ה (the) |
| Compound | של, שב, שמ, שכ, שה, מה, ממ |

A query for **לחוזה** generates the FTS token group:
```
("לחוזה"* OR "חוזה"* OR "החוזה"* OR "הסכם"* OR "עסקה"*)
```

### Synonym Expansion

Legal domain synonyms are expanded at query time:

| Search term | Expanded to |
|-------------|------------|
| חוזה | הסכם, עסקה |
| הסכם | חוזה, עסקה |
| פסיקה | פסק, דין, פסק-דין |
| תביעה | תלונה, ערעור |
| צוואה | ירושה, עיזבון |
| שכירות | חכירה, שכר-דירה |
| עורך דין | עו"ד |
| נאשם | נתבע, חשוד |

---

## FTS5 Configuration

```sql
CREATE VIRTUAL TABLE fts_documents USING fts5(
  ocr_text, filename, document_type,
  content='Documents', content_rowid='id'
);
```

Content tables allow zero-copy FTS storage — only the FTS index is stored, not the source text. Sync triggers keep the index current after any `INSERT`, `UPDATE`, or `DELETE` on `Documents`.

**Tokenizer:** `unicode61` (handles Hebrew, Latin, digits). The `tokenchars` option is not used — it requires SQLite 3.46+ which better-sqlite3 does not yet bundle. Hyphenated legal identifiers (e.g., `תא-2024-042`) are matched via FTS5 phrase queries.

**Additional FTS5 tables:**
- `fts_clients` — client names, notes
- `fts_contacts` — contact names, roles
- `fts_evidence` — evidence descriptions
- `fts_study_questions` — academic hub content (migration 016)
- `LegalCorpusFTS` — offline Knesset legislation (migration 057)
- `WikiSourceFTS` — WikiSource legislation (migration 059)

---

## sqlite-vec KNN Vector Search (Hybrid)

### How It Works

1. The RAG worker embeds every `ocr_text` chunk into a float vector using Ollama's embedding endpoint
2. Vectors are stored in `vec_chunks` (in `data_store` schema, migration 052) with a `case_id` filter column
3. At search time, the query is also embedded and a KNN cosine similarity search is performed:
   ```sql
   SELECT rowid, distance
   FROM vec_chunks
   WHERE case_id = ?
   ORDER BY distance
   LIMIT 10
   ```
4. Results are merged with FTS5 results using Reciprocal Rank Fusion (RRF)

### Requirements

- `sqlite-vec.dll` must be present at `SQLITE_VEC_PATH`
- `SQLITE_VEC_PATH` must be set before the database is opened
- If the extension is absent: the system falls back to FTS5 keyword search only (a warning is logged)

### Retrieval Cache (migration 046)

```sql
RetrievalCache (
  cache_key   TEXT PRIMARY KEY,   -- SHA-256 of query + case_id + options
  results     TEXT NOT NULL,      -- JSON array of document IDs + scores
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL       -- created_at + TTL
)
```

TTL: **60 seconds**. Cache is keyed by SHA-256 of (normalised query + case_id + filter options). A stale concurrent write may overwrite a valid cache entry — this is benign (next read re-queries).

---

## Materialized Search Index (SearchMeta, migration 034)

`SearchMeta` is a B-tree indexed copy of key document metadata, maintained by triggers on `Documents`. Enables fast pre-filtering before FTS5 is invoked:

```sql
SELECT document_id FROM SearchMeta
WHERE document_type = 'CONTRACT'
  AND confidence >= 0.75
  AND document_date BETWEEN '2023-01-01' AND '2024-12-31'
ORDER BY updated_at DESC
LIMIT 500
```

Supported filters in `SearchOptions.filter`:

| Filter | Index |
|--------|-------|
| `documentType` | `idx_search_meta_type_state` |
| `processingState` | `idx_search_meta_type_state` |
| `clientId` | `idx_search_meta_client` |
| `caseId` | `idx_search_meta_case` |
| `dateFrom` / `dateTo` | `idx_search_meta_date` |
| `minConfidence` | `idx_search_meta_confidence` |

---

## Ranking

```
final_rank = FTS5_BM25_score + entity_boost + recency_boost + vector_similarity_boost
```

| Factor | Value |
|--------|-------|
| Case boost | +2.0, open cases sort before closed |
| Client boost | +1.5 |
| Recency boost | +2.0 if `created_at` within `recentDays` window |
| Vector similarity | Cosine distance converted to score and RRF-merged |

---

## Performance Targets

| Scenario | Target |
|----------|--------|
| Cold FTS5 search, 100k documents | < 200ms |
| Filtered search (SearchMeta pre-filter) | < 50ms |
| Cache hit (RetrievalCache) | < 10ms |
| Synonym-expanded 3-word query | < 150ms |
| KNN vector search (top-10, 100k chunks) | < 50ms |
| Hybrid FTS5 + vector (merged) | < 250ms |
| Legal corpus FTS (Knesset legislation) | < 100ms |

---

## FTS5 Repair

If the FTS5 index becomes out of sync (detected by `POST /api/admin/repair/integrity`):

```
POST /api/admin/repair/fts
```

This drops and rebuilds all FTS5 virtual tables using the `content` table option (zero data loss — source text remains in `Documents`). Expected duration: < 30 seconds for 100k documents.
