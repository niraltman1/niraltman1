# Search Scaling & Hebrew Optimisation

## Architecture

Search is layered in two stages:

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
3. resolveDocIdFilter()       — SearchMeta indexed pre-filter (optional)
    │                            uses B-tree indexes, sub-1ms
    ▼
4. searchCases / searchClients / searchDocuments  — FTS5 BM25 + rank boost
    │
    ▼
5. Sort + deduplicate + slice
    │
    ▼
6. Cache in SearchRankingCache (60s TTL)
    │
    ▼
Result
```

## Hebrew Normalisation

### Nikud stripping
Vowel diacritics (U+05B0–U+05C7) are stripped from both the query and the FTS index, allowing diacritised and unvocalised text to match.

### Prefix normalisation
Common Hebrew prefixes are stripped before FTS matching to handle prepositional attachment:

| Prefix class | Examples                         |
|-------------|----------------------------------|
| Single-char  | ו (and), ב (in), ל (to), מ (from), כ (like), ש (that) |
| Compound     | של, שב, שמ, שכ, שה, מה, ממ      |

A query for **לחוזה** generates the FTS token group:
```
("לחוזה"* OR "חוזה"* OR "החוזה"* OR "הסכם"* OR "עסקה"*)
```

### Synonym expansion

Legal domain synonyms are expanded at query time:

| Search term | Expanded to                        |
|-------------|------------------------------------|
| חוזה         | הסכם, עסקה                         |
| הסכם         | חוזה, עסקה                         |
| פסיקה        | פסק, דין, פסק-דין                  |
| תביעה        | תלונה, ערעור                       |
| צוואה        | ירושה, עיזבון                      |
| שכירות       | חכירה, שכר-דירה                    |

## Materialized Search Index (SearchMeta)

`SearchMeta` is a B-tree indexed copy of key document metadata, maintained by triggers on the `Documents` table. It enables fast pre-filtering before FTS5 is invoked:

```sql
SELECT document_id FROM SearchMeta
WHERE document_type = 'CONTRACT'
  AND confidence >= 0.75
  AND document_date BETWEEN '2023-01-01' AND '2024-12-31'
ORDER BY updated_at DESC
LIMIT 500
```

Supported filters in `SearchOptions.filter`:

| Filter            | Index used                              |
|-------------------|-----------------------------------------|
| `documentType`    | `idx_search_meta_type_state`            |
| `processingState` | `idx_search_meta_type_state`            |
| `clientId`        | `idx_search_meta_client`               |
| `caseId`          | `idx_search_meta_case`                 |
| `dateFrom`/`dateTo` | `idx_search_meta_date`               |
| `minConfidence`   | `idx_search_meta_confidence`           |

## Performance Targets

| Scenario                                 | Target   |
|------------------------------------------|----------|
| Cold FTS5 search, 100k documents         | < 200ms  |
| Filtered search (SearchMeta pre-filter)  | < 50ms   |
| Cache hit (SearchRankingCache)           | < 10ms   |
| Synonym-expanded 3-word query            | < 150ms  |

## Ranking

```
final_rank = FTS5_BM25_score + entity_boost + recency_boost
```

| Factor         | Value                                               |
|----------------|-----------------------------------------------------|
| Case boost     | +2.0, open cases sort before closed                 |
| Client boost   | +1.5                                                |
| Recency boost  | +2.0 if `created_at` within `recentDays` window     |

## Cache

Results are cached in `SearchRankingCache` keyed by SHA-256 of the normalised query + options. TTL is 60 seconds. Cache is never locked — a stale concurrent write may overwrite, but this is benign.

## FTS5 Configuration

```sql
CREATE VIRTUAL TABLE fts_documents USING fts5(
  ocr_text, filename, document_type,
  content='Documents', content_rowid='id'
);
```

Content tables allow zero-copy FTS storage — only the FTS index is stored, not the source text. Sync triggers keep the index current.
