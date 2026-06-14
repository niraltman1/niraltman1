# sqlite-vec Compatibility Matrix Report

**Date:** 2026-05-25  
**Test files:** `packages/retrieval/src/sqlite-vec-compat.test.ts`, `packages/retrieval/src/embedding-chaos.test.ts`

---

## Compatibility Matrix (7 scenarios — all PASS)

| Scenario | Condition | Behavior | Result |
|----------|-----------|----------|--------|
| 1 | vec_chunks table missing | Falls back to JS cosine | ✅ PASS |
| 2 | vec_f32 function missing | Falls back gracefully | ✅ PASS |
| 3 | vec_chunks exists but empty | Returns FTS results | ✅ PASS |
| 4 | embedding column is null | JS fallback skips row | ✅ PASS |
| 5 | Malformed JSON embedding | JS fallback skips row | ✅ PASS |
| 6 | In-memory database | No crash, empty result | ✅ PASS |
| 7 | Cross-case call (no caseId) | Emits audit warning | ✅ PASS |

---

## Bug Fixed During Testing

Scenarios 4 and 5 initially **failed** — they revealed a real bug in `hybrid-search.ts`:

**Before fix (line 142):**
```typescript
const vec = JSON.parse(er.embedding) as number[];
// ↑ Throws TypeError if er.embedding is null
// ↑ Throws SyntaxError if er.embedding is malformed JSON
```

**After fix:**
```typescript
if (!er.embedding) continue;
let vec: number[];
try {
  vec = JSON.parse(er.embedding) as number[];
} catch {
  continue; // skip malformed JSON
}
if (!Array.isArray(vec) || vec.length === 0) continue;
```

This fix ensures the JS cosine fallback is resilient to database corruption, partially-written embeddings, and migration races where ChunkEmbeddings rows exist without valid embeddings.

---

## Fallback Path Integrity

The two-path vector search works as follows:

```
hybridSearch()
  ├── Try native sqlite-vec KNN query
  │     ├── Success → use native results (fast, O(log n))
  │     └── Throw (any error) → silently fall through
  └── If not usedNativePath:
        └── JS cosine loop (all embeddings for case)
              ├── Skip null embeddings
              ├── Skip malformed JSON (try/catch)
              ├── Skip empty arrays
              └── Apply 0.3 cosine threshold
```

The fallback is transparent to callers. No configuration required — the system automatically uses whichever path works.

---

## Database Splitting (ATTACH)

`DatabaseConnection` automatically skips ATTACH for `:memory:` databases (used in tests) and read-only connections. This was verified in Scenario 6: in-memory DB construction completes without error.
