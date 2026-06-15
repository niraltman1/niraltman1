# Architecture Audit Report

Generated: 2026-06-15T00:04:38.698Z

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 151 |
| WARNING  | 31 |

## Violations

| Severity | File | Rule | Detail |
|----------|------|------|--------|
| **WARNING** | `packages/api/src/routes/action-plan.ts` | `ARRAY_CHAIN_IN_ROUTE` | 4 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/activity.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 48: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/activity.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 63: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/activity.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 76: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/activity.ts` | `ARRAY_CHAIN_IN_ROUTE` | 3 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 144: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 146: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 187: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 190: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 281: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 296: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 365: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 387: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 414: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 502: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/admin.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 523: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/admin.ts` | `ROUTE_TOO_LONG` | 472 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/admin.ts` | `ARRAY_CHAIN_IN_ROUTE` | 3 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 107: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 135: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 198: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 225: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 252: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 270: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 296: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 322: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 365: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 391: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 417: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/agents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 440: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/agents.ts` | `ROUTE_TOO_LONG` | 512 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/bug-report.ts` | `ROUTE_TOO_LONG` | 133 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/canvas.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 24: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/canvas.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 28: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/canvas.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 37: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 71: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 75: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 84: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 101: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 109: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 113: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 125: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 129: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 149: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/case-law.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 169: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/case-law.ts` | `ROUTE_TOO_LONG` | 151 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/cases.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 95: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/cases.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 98: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/cases.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 154: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/cases.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 194: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/cases.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 201: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/cases.ts` | `ROUTE_TOO_LONG` | 204 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/cases.ts` | `ARRAY_CHAIN_IN_ROUTE` | 4 .map/.filter/.reduce calls — consider moving to a utility module |
| **WARNING** | `packages/api/src/routes/clients.ts` | `ARRAY_CHAIN_IN_ROUTE` | 6 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/collections.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 67: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/communications.ts` | `ROUTE_TOO_LONG` | 525 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/diagnostics.ts` | `ROUTE_TOO_LONG` | 436 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/diagnostics.ts` | `ARRAY_CHAIN_IN_ROUTE` | 7 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/documents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 41: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/documents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 105: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/documents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 110: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/documents.ts` | `ROUTE_TOO_LONG` | 164 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/drafts.ts` | `ROUTE_TOO_LONG` | 262 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/entities.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 31: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/entities.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 43: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/entities.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 67: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/entities.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 109: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/entities.ts` | `ROUTE_TOO_LONG` | 136 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 30: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 45: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 56: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 73: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 78: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 101: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 104: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 143: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 154: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 159: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 166: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 167: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/erasure.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 173: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/erasure.ts` | `ROUTE_TOO_LONG` | 151 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/gmail.ts` | `ARRAY_CHAIN_IN_ROUTE` | 3 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/health.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 41: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/health.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 51: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/health.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 92: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/health.ts` | `ROUTE_TOO_LONG` | 142 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/importer.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 109: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/importer.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 115: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/importer.ts` | `ROUTE_TOO_LONG` | 160 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 97: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 102: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 123: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 127: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 132: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 138: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 150: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 158: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 168: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 173: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 184: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 191: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 200: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 204: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 209: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 216: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 222: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 226: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 245: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 249: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 254: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/insolvency.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 259: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/insolvency.ts` | `ROUTE_TOO_LONG` | 260 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 69: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 78: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 80: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 97: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 115: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 125: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 141: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 144: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 152: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 156: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 164: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/ledger.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 171: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/ledger.ts` | `ROUTE_TOO_LONG` | 155 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/ledger.ts` | `ARRAY_CHAIN_IN_ROUTE` | 3 .map/.filter/.reduce calls — consider moving to a utility module |
| **WARNING** | `packages/api/src/routes/legal-engine.ts` | `ROUTE_TOO_LONG` | 141 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/mail.ts` | `ARRAY_CHAIN_IN_ROUTE` | 4 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 29: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 32: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 42: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 68: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 69: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 82: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/mission-control.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 95: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 58: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 64: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 74: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 81: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 95: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/precedents.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 113: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/queue.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 47: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/queue.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 87: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/queue.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 96: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/queue.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 107: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 96: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 118: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 140: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 144: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 148: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/recovery.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 172: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/recovery.ts` | `ROUTE_TOO_LONG` | 164 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 41: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 48: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 59: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 72: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 81: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 95: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 105: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 111: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 115: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 123: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/signatures.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 134: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/stens.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 129: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/stens.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 135: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/stens.ts` | `ROUTE_TOO_LONG` | 169 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/studies.ts` | `ROUTE_TOO_LONG` | 183 non-blank lines (limit: 120) — split into handler modules |
| **CRITICAL** | `packages/api/src/routes/tabular.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 51: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 52: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 54: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 71: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 84: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 94: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 111: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 113: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 120: direct db.prepare() call — use a Repository method instead |
| **CRITICAL** | `packages/api/src/routes/time-entries.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 123: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/time-entries.ts` | `ARRAY_CHAIN_IN_ROUTE` | 5 .map/.filter/.reduce calls — consider moving to a utility module |
| **CRITICAL** | `packages/api/src/routes/traffic.ts` | `NO_DIRECT_SQL_IN_ROUTES` | Line 144: direct db.prepare() call — use a Repository method instead |
| **WARNING** | `packages/api/src/routes/traffic.ts` | `ROUTE_TOO_LONG` | 137 non-blank lines (limit: 120) — split into handler modules |
| **WARNING** | `packages/api/src/routes/updates.ts` | `ROUTE_TOO_LONG` | 253 non-blank lines (limit: 120) — split into handler modules |

## Allowlisted Files (db.prepare permitted)

- `packages/api/src/routes/diagnostics.ts` — direct DB access by design
- `packages/api/src/routes/setup.ts` — direct DB access by design
- `packages/api/src/routes/updates.ts` — direct DB access by design
- `packages/api/src/routes/citations.ts` — direct DB access by design
- `packages/api/src/routes/communications.ts` — direct DB access by design

## Rules Reference

| Rule | Severity | Description |
|------|----------|-------------|
| `NO_DIRECT_SQL_IN_ROUTES` | CRITICAL | Route files must not call `db.prepare()` — use Repository classes |
| `NO_DASHBOARD_IMPORT_FROM_PACKAGES` | CRITICAL | Package source must not import from `apps/dashboard` |
| `ROUTE_TOO_LONG` | WARNING | Route files > 120 non-blank lines should be refactored |
| `ARRAY_CHAIN_IN_ROUTE` | WARNING | Heavy array chaining in routes should move to utility modules |
