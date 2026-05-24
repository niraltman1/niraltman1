# @factum-il/citation-engine

Deterministic Israeli legal citation engine.

Parses, canonicalises, validates, and formats citations across the full
Israeli legal corpus: cases, primary legislation, regulations, books,
and journal articles.

## Compliance with כללי הציטוט האחיד (Uniform Citation Rules)

This package implements the **Uniform Citation Rules** (כללי הציטוט האחיד)
that govern citation style across Israeli courts, academic writing, and
official legal publications.

The rule set followed is the **Nevo 2021 specification**, which is the
de facto Israeli legal citation standard. The Nevo 2021 spec aligns with
the Uniform Citation Rules adopted by Israeli law faculties and the
Supreme Court of Israel — they are the same standard under two names.

### Canonical Output Formats

| Citation Kind | Format | Example |
|---------------|--------|---------|
| Case (with publication+date)         | `<proc> <num> <p1> נ' <p2> (<pub> <date>)` | `רע"א 1234/21 כהן נ' מדינת ישראל (נבו 11.3.2021)` |
| Case (with פ"ד volume+page)          | `<proc> <num> <p1> נ' <p2> (<pub> <vol> <page>)` | `בג"ץ 1/49 בז'רנו נ' שר המשטרה (פ"ד ב 80)` |
| Law (with publication)               | `<name>, <pub>-<year>, סעיף <section>`         | `חוק העונשין, ס"ח-1977, סעיף 300` |
| Law (no publication)                 | `<name>, <year>`                                | `חוק החוזים (חלק כללי), 1973` |
| Regulation                           | `<name>, <pub>-<year>, תקנה <reg>`             | `תקנות סדר הדין האזרחי, ק"ת-2018, תקנה 121` |
| Book                                 | `<authors> <title> (<edition>, <year>)`         | `אהרן ברק פרשנות במשפט (כרך ב, 1993)` |
| Article                              | `<authors> "<title>" <journal> <vol> (<year>)` | `יצחק זמיר "השפיטה" משפטים כב (1992)` |

### Components

| Module | Purpose |
|--------|---------|
| `parsers/`        | Raw text → structured citation objects |
| `canonicalizers/` | Normalises abbreviation variants (e.g. `רעא` → `רע"א`) |
| `validators/`     | Verifies structural correctness + required fields |
| `formatters/`     | Structured citation → canonical output string |
| `repair/`         | Attempts to fix malformed citations using fuzzy matching |
| `confidence/`     | Scores parse certainty (parsed / canonical / trusted) |

### Procedure & Publication Maps

The engine recognises the full Hebrew abbreviation set:

- **Procedures** (`PROCEDURE_MAP`): רע"א, ע"א, ע"פ, בג"ץ, רע"פ, בש"א, …
- **Publications** (`PUBLICATION_MAP`): נבו, פ"ד, תק-על, תק-מח, דינים, ס"ח, ק"ת

### Determinism Guarantee

`formatCitation()` is **pure** — same input always produces the same output,
byte-for-byte. There is no LLM call, no network access, and no locale-dependent
behaviour. This makes citations reproducible and auditable.

### Test Coverage

- `format-case.test.ts` — case citation output (Nevo 2021)
- `format-law.test.ts`  — law + regulation + book + article (Nevo 2021)
- `uniform-citation.test.ts` — explicit Uniform Citation Rules compliance assertions
- `canonicalize.test.ts` — abbreviation normalisation
- `validate.test.ts` — structural checks
- `hebrew.test.ts` — RTL + niqqud + Hebrew quote handling
- `repair.test.ts` — malformed-input fuzzy repair

Run: `pnpm --filter @factum-il/citation-engine test`

### References

- Nevo Publishing, *Uniform Citation Rules — Israeli Legal Database*, 2021.
- Israeli Bar Association, *Standard Citation Format Guide*, current edition.
- Hebrew University Faculty of Law, *Style Guide for Legal Writing*.
