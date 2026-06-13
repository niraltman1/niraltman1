# Factum-IL — Comprehensive UI/UX, Product Surface & Unified Attorney Workstation Audit

**Audit Date:** 2026-06-06  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Branch:** `claude/factum-il-platform-audit-xuhqo`  
**Evidence base:** Repository source — all conclusions are traceable to specific files and line numbers.

---

## Executive Summary

Factum-IL has a significantly larger implemented capability set than its user interface exposes.  
The platform contains 40+ distinct API route modules, 78+ React hooks, 39 registered UI routes, and 66 database migrations representing substantial legal-technology infrastructure.  
However, a meaningful fraction of that capability is invisible to attorneys, partially surfaced, or reachable only through indirect paths — creating a gap between the platform's true capability and what users can discover and use.

---

## Phase 1 — Complete Capability Inventory

### 1.1 Fully Implemented Capabilities

The following capabilities have both backend implementation and a connected UI surface:

| # | Capability | Backend Evidence | UI Evidence | Status |
|---|-----------|-----------------|-------------|--------|
| 1 | Client Management (CRUD) | `packages/api/src/routes/clients.ts` | `features/clients/ClientsPage.tsx`, `ClientCard.tsx` | ✅ Full |
| 2 | Case Management (CRUD) | `packages/api/src/routes/cases.ts` | `features/cases/CasesPage.tsx`, `CaseDetail.tsx` | ✅ Full |
| 3 | Document Registry | `packages/api/src/routes/documents.ts` | `features/documents/DocumentsPage.tsx` | ✅ Full |
| 4 | Document Reader (PDF/image) | `GET /api/documents/:id/file` | `features/documents/DocumentReader.tsx` | ✅ Full |
| 5 | Document Annotations | `packages/api/src/routes/annotations.ts` | In `DocumentReader.tsx` — `DocumentAnnotations` panel | ✅ Full |
| 6 | OCR / Document Pipeline | `packages/pipeline` (OCRmyPDF + Docling) | Processing status badge in `DocumentDetail.tsx` | ✅ Full |
| 7 | AI Enrichment (5 agents) | `packages/api/src/routes/agents.ts` (5 routes) | `features/agents/AgentsWorkspacePage.tsx` | ✅ Full |
| 8 | Case Timeline | `GET /api/cases/:id/timeline` | `features/cases/CaseTimeline.tsx` (tab in CaseDetail) | ✅ Full |
| 9 | Citation Intelligence | `GET /api/cases/:id/citations` | `features/cases/CaseCitations.tsx` (tab in CaseDetail) | ✅ Full |
| 10 | Risk Dashboard | `GET /api/cases/:id/risk` | `features/cases/CaseRiskPanel.tsx` (embedded in CaseDetail) | ✅ Full |
| 11 | Matter Workbench (3-pane) | Composite of existing endpoints | `features/cases/MatterWorkbench.tsx` at `/cases/:id/workbench` | ✅ Full |
| 12 | Hearing Preparation Workspace | Composite of existing endpoints | `features/cases/HearingPrepPage.tsx` at `/cases/:id/hearing-prep` | ✅ Full |
| 13 | Smart Collections | `GET /api/collections` | `features/documents/SmartCollectionsPage.tsx` | ✅ Full |
| 14 | Evidence Locker | `packages/api/src/routes/evidence.ts` | `features/evidence/EvidenceLockerPage.tsx` | ✅ Full |
| 15 | Task Management | `packages/api/src/routes/tasks.ts` | `features/tasks/TasksPage.tsx` | ✅ Full |
| 16 | Calendar (hearings/deadlines/tasks) | `GET /api/calendar/events` | `features/calendar/CalendarPage.tsx` | ✅ Full |
| 17 | Deadline Radar | `GET /api/calendar/deadlines` | `features/calendar/DeadlineMonitorPage.tsx` | ✅ Full |
| 18 | Notification Inbox | `packages/api/src/routes/notifications.ts` | `components/notifications/NotificationBell.tsx` in AppShell | ✅ Full |
| 19 | AI Insight Verification | `PATCH /api/documents/insights/:id` | In `DocumentDetail.tsx` (verify + edit) | ✅ Full |
| 20 | Rules Engine (20 Israeli rules) | `packages/api/src/routes/rules.ts`, `migration/060_rules_engine.sql` | `features/legal/RulesEnginePage.tsx` | ✅ Full |
| 21 | Procedure Templates | `packages/api/src/routes/legal-engine.ts` | `features/legal-engine/TemplatesPage.tsx` | ✅ Full |
| 22 | Forms Library (Stens) | `packages/api/src/routes/stens.ts` | `features/stens/StensLibraryPage.tsx` | ✅ Full |
| 23 | Contact CRM | `packages/api/src/routes/contacts.ts` | `features/contacts/ContactsPage.tsx` | ✅ Full |
| 24 | Entity Navigation (judges/courts) | `packages/api/src/routes/entities.ts` | `features/entities/EntitiesPage.tsx`, `EntityDetailPage.tsx` | ✅ Full |
| 25 | Communications Inbox | `packages/api/src/routes/communications.ts` | `features/communications/CommunicationsInboxPage.tsx` | ✅ Full |
| 26 | Call Logging | `POST /api/communications/calls` | `CallLogModal` in `CommunicationsPanel.tsx` | ✅ Full |
| 27 | Gmail Bridge | `packages/api/src/routes/gmail.ts` | `features/gmail/GmailBridgePage.tsx` | ✅ Full |
| 28 | Mail Reply Generator | `POST /api/mail/generate-reply` | `features/mail/MailWorkspacePage.tsx` | ✅ Full |
| 29 | Traffic Case Management | `packages/api/src/routes/traffic.ts` | `features/traffic/TrafficAlertsPage.tsx` | ✅ Full |
| 30 | Academic Hub | `packages/api/src/routes/studies.ts` | `features/studies/StudiesPage.tsx` | ✅ Full |
| 31 | Action Plan | `packages/api/src/routes/action-plan.ts` | `features/action-plan/ActionPlanPage.tsx` | ✅ Full |
| 32 | Queue Monitor | `packages/api/src/routes/queue.ts` | `features/queue/QueueMonitor.tsx` | ✅ Full |
| 33 | Action Review Queue | `GET /api/queue/review-pending` | `features/documents/ActionQueue.tsx` | ✅ Full |
| 34 | Media Registry | `packages/api/src/routes/media.ts` | `features/media/MediaRegistryPage.tsx` | ✅ Full |
| 35 | Activity Feed | `packages/api/src/routes/activity.ts` | `features/activity/ActivityFeedPage.tsx` | ✅ Full |
| 36 | Precedents Registry | `packages/api/src/routes/precedents.ts` | `features/precedents/PrecedentsPage.tsx` | ✅ Full |
| 37 | FTS5 Full-Text Search | `GET /api/search` | `features/search/SearchPage.tsx` (connected post F-A fix) | ✅ Full |
| 38 | Diagnostics / Admin Panel | `packages/api/src/routes/diagnostics.ts` | `features/admin/DiagnosticsPage.tsx` | ✅ Full |
| 39 | Mission Control | `GET /api/mission-control/snapshot` | `features/admin/MissionControlPage.tsx` | ✅ Full |
| 40 | RBAC Management | `GET /api/admin/settings` | `features/admin/RBACManagePage.tsx` | ✅ Full |
| 41 | Backup / Recovery | `packages/update-core`, `packages/encrypted-backup` | `features/admin/BackupSettingsPage.tsx`, `RecoveryPage.tsx` | ✅ Full |
| 42 | Audit Journal | `packages/api/src/routes/updates.ts` | `features/admin/JournalPage.tsx` | ✅ Full |
| 43 | AI Streaming (SSE) | `GET /api/agents/:agentType/stream` | In `AgentsWorkspacePage.tsx` — streaming toggle | ✅ Full |
| 44 | Document Signatures | `packages/api/src/routes/signatures.ts` (5 endpoints) | `DocumentSigningPanel.tsx` embedded in `DocumentDetail.tsx` | ✅ Full (limited surface) |

### 1.2 Partially Implemented Capabilities

| # | Capability | Backend State | UI State | Gap |
|---|-----------|--------------|----------|-----|
| 1 | Legal Corpus Browser | **Complete**: 1,077 Israeli laws ingested via KNS OData + WikiSource. `GET /api/legal-corpus/sources`, `/search`. Migration `061_legal_corpus.sql`. | **Missing**: No UI page or browser component exists anywhere in the frontend. Evidence not found in `apps/dashboard/src`. | No reading, browsing, or searching of the 1,077-law corpus is possible through the UI. |
| 2 | Payment Ledger | **Complete**: `packages/api/src/routes/ledger.ts`, `useCreatePaymentSchedule`, `useMarkPaid`, `usePatchPaymentSchedule` hooks. | **Orphaned**: `features/ledger/LedgerPage.tsx` exists as a component (referenced in the Explore agent's inventory) but is **NOT registered in `router/index.tsx`**. | Page component exists but is completely unreachable — not in router, not in nav. |
| 3 | Insolvency Module | **Complete**: `packages/api/src/routes/insolvency.ts`, `useInsolvency`, `useInitInsolvency`, `useUpdateChecklistItem`, `useSendInsolvencyNotify` hooks, migration `029`. | **Missing**: No dedicated page in `router/index.tsx`. No insolvency route registered. | Debt-arrangement workflow exists in backend; attorneys cannot access it. |
| 4 | Case Law Registry | **Complete**: `packages/api/src/routes/case-law.ts`, `useCaseLaw`, `useCreateCaseLaw`, `useRunCaseLawTest` hooks, migration `030`. | **Missing**: No dedicated page. No route in `router/index.tsx`. | Precedent testing functionality inaccessible from UI. |
| 5 | Citation Harvesting | **Complete**: `POST /api/citations/harvest/:documentId`, `useHarvestCitations` hook. | **No UI trigger**: Hook exists in `hooks.ts` but no component calls it. `CaseCitations` only displays pre-harvested citations. | Attorney cannot manually trigger citation extraction from a document. |
| 6 | Entity Knowledge Graph | **Complete**: `packages/api/src/routes/entities.ts` — `/api/entities/graph/stats`, `/api/entities/backfill`. `Entities`/`EntityRelations` tables (migration 042) populated via RAG enrichment. | **Partial**: `EntitiesPage.tsx` shows flat lists (judges/courts). No graph visualization. No backfill trigger in UI. | Knowledge graph exists but cannot be visualized. The relationship network is invisible. |
| 7 | Canvas / Workflow | **Complete**: `packages/api/src/routes/canvas.ts`, `useCanvasDocument`, `useCreateCanvasTask`. Route `/canvas/:id` in router. | **Hidden**: Route exists in `router/index.tsx` (line 89) but is **absent from `nav-config.tsx`**. Only reachable from MatterWorkbench via internal link. | Canvas is effectively invisible from navigation. |
| 8 | Tabular Data Engine | **Present**: `useCaseScales()` → `GET /api/tabular/case-scales`, `useIngestTabular()`. | **Missing**: No UI page registered. Hooks exist in `hooks.ts` lines 473–492 but no component uses them. | Feature is completely invisible. |
| 9 | AI Guardrails Visibility | **Complete**: `packages/ai-guardrails` — hallucination detector, citation verifier, confidence gate. GuardrailsLog table (migration 048). | **Not surfaced**: No admin panel or UI view for guardrail decisions, confidence gate results, or hallucination detections. | Attorneys cannot review AI safety decisions. |
| 10 | Agent Execution Journal | **Complete**: `AgentExecutionEvents` table (migration 053), `execution-journal.ts`. API: `GET /api/admin/journal` planned in TASKS.md. | **Partially surfaced**: `JournalPage.tsx` exists at `/admin/journal` but routes to `useUpdateStatus` (software update log), not agent execution events. Wiring mismatch. | Agent execution history is captured but not viewable. |

### 1.3 Stubbed / Dead Code / Experimental

| # | Capability | Evidence | State |
|---|-----------|---------|-------|
| 1 | WhatsApp (C2) | Architecture decision in TASKS.md. `Puppeteer + WebView2` approach documented. | Architecture decision only — not implemented. `Evidence not found in repository.` |
| 2 | `LedgerPage` component | Referenced in Explore agent inventory as `features/ledger/LedgerPage.tsx`. | Component exists, NOT registered in router. Unreachable dead code. |
| 3 | Worksheet Export | `useExportWorksheet(caseId)` → `POST /api/cases/:caseId/worksheet/export`. Hook exists in `hooks.ts`. | No UI trigger found. No button or menu item calls this hook. |
| 4 | Enterprise Hooks | `packages/enterprise-hooks` — capability registry, all disabled at beta tier. | Stubbed with all capabilities disabled. TASKS.md: "all disabled at beta tier". |
| 5 | Gmail Sync | `packages/api/src/routes/gmail.ts`. `GmailBridgePage.tsx`. `GMAIL_ENABLED` env var controls it. | Implementation present but gated by optional env config. Feature requires external OAuth. |
| 6 | Local Whisper Transcription | `WHISPER_CMD` injection, 409 returned without Whisper. | Environment-blocked. Code ready, binary not bundled in default install. |
| 7 | Telegram Live Delivery | `modules/telegram/` (C1). | Environment-blocked — `api.telegram.org` not in network allowlist. Code ready. |
| 8 | pixel-level PDF highlights | `highlight.ts` exists, `DocumentReader.tsx` supports `?highlight=` param. | hOCR output from OCR pipeline not implemented. Coordinate-level annotation deferred. |

---

## Phase 2 — Complete UI Surface Mapping

### 2.1 Navigation Architecture

**Source:** `apps/dashboard/src/components/layout/nav-config.tsx` (lines 35–108)  
**Source:** `apps/dashboard/src/router/index.tsx` (lines 48–100)

The sidebar uses 8 accordion groups with 32 navigation items total.

| Group | Open by Default | Items | Key Routes |
|-------|----------------|-------|-----------|
| עבודה שוטפת (Current Work) | ✅ Yes | 5 | dashboard, calendar, deadlines, tasks, activity |
| תיקים ולקוחות (Cases & Clients) | ✅ Yes | 4 | cases, clients, contacts, traffic |
| מסמכים וראיות (Documents & Evidence) | ✅ Yes | 7 | documents, collections, queue, action-queue, action-plan, media, evidence |
| מנוע משפטי (Legal Engine) | ❌ Collapsed | 5 | templates, rules, stens, precedents, entities |
| בינה וסוכנים (AI & Agents) | ❌ Collapsed | 1 | agents |
| תקשורת (Communications) | ❌ Collapsed | 3 | communications, mail, gmail |
| לימודים (Studies) | ❌ Collapsed | 1 | studies |
| מערכת (System/Admin) | ❌ Collapsed | 6 | admin, mission-control, journal, rbac, backup-settings, recovery |

### 2.2 Routes in Router vs. Navigation

**Routes registered in `router/index.tsx` but ABSENT from `nav-config.tsx`:**

| Route | Component | How to Reach | Problem |
|-------|-----------|-------------|---------|
| `/search` | `SearchPage` | Cmd+K SpotlightSearch only | Poor discoverability. Not a sidebar item. |
| `/canvas/:id` | `CanvasPage` | Only via internal link in `MatterWorkbench.tsx` | Effectively invisible. |
| `/cases/:id/workbench` | `MatterWorkbench` | "שולחן עבודה" button in CaseDetail only | No direct nav path to the flagship workspace. |
| `/cases/:id/hearing-prep` | `HearingPrepPage` | "הכנה לדיון" button in CaseDetail only | No direct nav path to hearing preparation. |
| `/documents/:id/read` | `DocumentReader` | "קרא מסמך" button in DocumentDetail only | Expected — detail sub-route. |

**Hooks that exist but have NO corresponding route in `router/index.tsx`:**

| Hooks | Backend Route | Missing UI Route | Impact |
|-------|-------------|-----------------|--------|
| `useLedger`, `useCreatePaymentSchedule`, `useMarkPaid` | `GET/POST /api/ledger` | `/ledger` — not in router | Billing/payment tracking inaccessible |
| `useInsolvency`, `useInitInsolvency`, `useUpdateChecklistItem` | `GET/POST /api/insolvency/:id` | `/insolvency` — not in router | Insolvency procedure inaccessible |
| `useCaseLaw`, `useCreateCaseLaw`, `useRunCaseLawTest` | `GET/POST /api/case-law` | `/case-law` — not in router | Precedent testing inaccessible |
| `useHarvestCitations` | `POST /api/citations/harvest/:id` | No UI trigger | Citation harvesting inaccessible |
| `useExportWorksheet` | `POST /api/cases/:id/worksheet/export` | No UI trigger | Report export inaccessible |

### 2.3 Capability Coverage Matrix

| Capability | Backend | UI Exists | In Nav | Discoverable | Usable | Complete |
|-----------|---------|-----------|--------|-------------|--------|----------|
| Client Management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Case Management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Document Registry | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Document Reader | ✅ | ✅ | ❌ | Partial | ✅ | ✅ |
| Document Annotations | ✅ | ✅ | ❌ | Partial | ✅ | Partial |
| OCR Pipeline | ✅ | Partial | ❌ | ❌ | ❌ | Partial |
| FTS5 Search | ✅ | ✅ | ❌ | Cmd+K only | ✅ | ✅ |
| 5 AI Agents | ✅ | ✅ | ✅ | Partial | ✅ | ✅ |
| Case Timeline | ✅ | ✅ | ❌ | Tab in CaseDetail | ✅ | ✅ |
| Citation Intelligence | ✅ | ✅ | ❌ | Tab in CaseDetail | ✅ | ✅ |
| Risk Dashboard | ✅ | ✅ | ❌ | Embedded in CaseDetail | ✅ | ✅ |
| Matter Workbench | ✅ | ✅ | ❌ | Button in CaseDetail | ✅ | ✅ |
| Hearing Prep | ✅ | ✅ | ❌ | Button in CaseDetail | ✅ | ✅ |
| Smart Collections | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Evidence Locker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task Management | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deadline Radar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | Bell icon | Partial | ✅ | ✅ |
| Rules Engine | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| Legal Templates | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| Forms Library (Stens) | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| Contact CRM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Entity Navigation | ✅ | ✅ | ✅ | Collapsed group | ✅ | Partial |
| Communications | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| Call Logging | ✅ | ✅ | ❌ | In Communications | ✅ | ✅ |
| Gmail Bridge | ✅ | ✅ | ✅ | Collapsed group | Partial | Partial |
| Mail Reply Generator | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| Traffic Cases | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Academic Hub | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| AI Streaming | ✅ | ✅ | ❌ | Toggle in Agents | ✅ | ✅ |
| Document Signatures | ✅ | ✅ | ❌ | In DocumentDetail | Partial | Partial |
| Precedents Registry | ✅ | ✅ | ✅ | Collapsed group | ✅ | ✅ |
| **Legal Corpus (1,077 laws)** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |
| **Payment Ledger** | ✅ | Orphaned | **❌** | **❌** | **❌** | **❌** |
| **Insolvency Module** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |
| **Case Law Registry** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |
| **Citation Harvesting** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |
| **Entity Knowledge Graph** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |
| **Canvas / Workflow** | ✅ | ✅ | **❌** | Hidden | Partial | Partial |
| **Tabular Data Engine** | ✅ | **❌** | **❌** | **❌** | **❌** | **❌** |

### 2.4 UI Surface Coverage Summary

- **Total implemented backend capabilities:** ~48
- **Fully surfaced in UI and navigation:** 26 (54%)
- **Partially surfaced (accessible but buried or missing UI):** 14 (29%)
- **Not surfaced at all (backend only, no UI):** 8 (17%)

---

## Phase 3 — Attorney Workflow Audit

### 3.1 Client Intake

**Can attorneys create clients?** ✅ Yes — `ClientsPage.tsx` has a "לקוח חדש" form.  
**Can attorneys create matters?** ✅ Yes — `CasesPage.tsx` has a case creation flow. Also via Cmd+K "צור תיק" command.  
**Can attorneys organize client information?** ✅ Partially — `ClientCard.tsx` shows client detail with timeline and communication tabs.  
**Can attorneys attach documents?** ❌ No direct intake-to-document flow. Documents are ingested via watcher pipeline, not manually attached during intake.  
**Can attorneys maintain client records?** ✅ Yes — `useUpdateClient` hook, contacts linked via `useLinkContactToCase`.

**Friction points:**
- No explicit intake wizard that guides: create client → create matter → define procedure type → attach initial documents. The `NewCaseWizard.tsx` component exists in `features/legal-engine/` but is not registered as a route and not linked from intake flow.
- `NewCaseWizard` exists as a component (`features/legal-engine/NewCaseWizard.tsx`) but there is no route for it in `router/index.tsx`. Evidence: the component exists but is not imported or rendered anywhere accessible.
- Document attachment during intake requires the file watcher pipeline — no manual "attach file to this matter" workflow.

### 3.2 Legal Research

**Can attorneys search legislation?** ❌ No. The legal corpus (1,077 Israeli laws, full text) has API endpoints (`GET /api/legal-corpus/search`) but no UI browser or search interface.  
**Can attorneys search case law?** Partial — `PrecedentsPage.tsx` is a manual citation registry. Attorneys can add citations and verify them with AI, but this is not a searchable corpus of actual case law.  
**Can attorneys search uploaded documents?** ✅ Yes — `SearchPage.tsx` at `/search` performs FTS5 search across documents, clients, and cases. However, this route is NOT in the sidebar navigation. Access is only via Cmd+K SpotlightSearch.  
**Can attorneys search legal materials?** ❌ No dedicated research interface connecting to the legal corpus.  
**Can attorneys follow citations?** ✅ Partial — `CaseCitations` tab shows citations linked to a case. `CitationRegistry` (migration 031) and `citation-engine` package exist, but citation traversal UI (follow a citation to its source law) is not implemented.  
**Can attorneys compare authorities?** ❌ No comparison view exists.

**Critical gap: Search is not in the sidebar navigation.**  
Source: `apps/dashboard/src/components/layout/nav-config.tsx` — no `/search` entry in any group.  
The SearchPage exists and works (`features/search/SearchPage.tsx` — full FTS5 integration post F-A fix) but is only reachable via the Spotlight search shortcut (`n` or `+` keys, or Cmd+K). This is a critical discoverability failure for a legal platform where search is a primary workflow.

### 3.3 Matter Preparation

**Can attorneys organize documents?** ✅ Yes — documents are filterable by case in `DocumentsPage.tsx`. CaseDetail "documents" tab shows case-filtered docs.  
**Can attorneys manage evidence?** ✅ Yes — `EvidenceLockerPage.tsx` with chain-of-custody locking.  
**Can attorneys build case theories?** ❌ No drafting or note-taking workspace. No free-text matter notes feature.  
**Can attorneys maintain notes?** ❌ Evidence not found in repository. No notes/memo feature.  
**Can attorneys track research?** Partial — Precedents registry is a manual citation list, not a structured research workspace.  
**Can attorneys build timelines?** ✅ Yes — `CaseTimeline.tsx` (automated from documents/hearings/tasks) + AI Timeline agent.  
**Can attorneys organize legal issues?** ❌ No issue tracking within a matter.

### 3.4 Legal Drafting

**Can attorneys draft claims?** ❌ No document editor. No drafting interface.  
**Can attorneys draft motions?** ❌ Same — no drafting. The `StensLibraryPage.tsx` fills form fields (structured templates) but does not provide a free-text drafting environment.  
**Can attorneys draft contracts?** ❌ No drafting workspace. The contract-review agent reviews uploaded contracts but cannot generate new ones.  
**Can attorneys draft legal opinions?** ❌ No drafting workspace.  
**Can attorneys reuse research?** Partial — Precedents can be added and verified. Research agent outputs can be copied manually but there is no "save to matter" or "insert into draft" flow.  

**Critical gap: No drafting workspace.**  
This is the single largest gap between Factum-IL's capabilities and what practicing attorneys need. The platform can analyze documents, extract entities, verify citations, and score risk — but provides no environment for the attorney to compose the actual work product (briefs, motions, contracts, opinions).

### 3.5 Knowledge Management

**Can attorneys reuse previous work?** Partial — Smart Collections groups recent/OCR-pending/unverified docs. No explicit "prior matter" search.  
**Can attorneys search prior matters?** Partial — Global search covers all cases and documents. No matter-to-matter comparison.  
**Can attorneys build institutional knowledge?** Partial — Precedents registry, entity knowledge graph (backend). No knowledge-base browsing UI.  
**Can attorneys preserve legal insights?** Partial — `DocumentInsights` are persisted and verifiable. But insights are per-document, not aggregated into a searchable knowledge layer.

### 3.6 Litigation Workflow

**Can attorneys track deadlines?** ✅ Yes — `DeadlineMonitorPage.tsx` ("ראדאר מועדים"), calendar integration, risk panel.  
**Can attorneys manage tasks?** ✅ Yes — `TasksPage.tsx` with CRUD.  
**Can attorneys track procedural events?** ✅ Yes — `CalendarPage.tsx` aggregates court hearings, statute deadlines, and tasks.  
**Can attorneys manage evidence?** ✅ Yes — Evidence Locker with chain of custody.  
**Can attorneys monitor case status?** ✅ Yes — CaseRiskPanel + procedural checklist + activity feed.

### 3.7 Client Deliverables

**Can attorneys export work product?** ❌ No export functionality. `useExportWorksheet(caseId)` hook exists but no UI trigger. HearingPrepPage has a "הדפס דף הכנה" (print) button, which is browser print only.  
**Can attorneys generate reports?** ❌ No report generation.  
**Can attorneys generate summaries?** ✅ Partial — AI Case Summarizer agent generates a Hebrew summary. No way to export or format it as a deliverable.  
**Can attorneys share findings?** ❌ No sharing or export mechanism.

---

## Phase 4 — Information Architecture and UX Review

### 4.1 Navigation Assessment

**Current navigation structure:** 8-group accordion sidebar with 32 items.

**What works well:**
- Accordion groups reduce visual noise and allow contextual focus.
- The "Current Work" and "Cases & Clients" groups are open by default — reflecting the primary daily workflow.
- `nav-config.tsx` is a clean, declarative model that centralizes navigation logic.
- Active-route auto-expansion works correctly via `groupIdForPath()`.

**What is problematic:**

1. **Search is not in the navigation.** The most fundamental capability in any information system is absent from the sidebar. Source: `nav-config.tsx` — no entry for `/search` in any of the 8 groups. An attorney who has not discovered the Cmd+K shortcut cannot find global search at all.

2. **The flagship Matter Workbench has no direct navigation entry.** The `/cases/:id/workbench` route — the most sophisticated feature in the platform — is only reachable after navigating to a specific case and clicking "שולחן עבודה". There is no way to open the workbench directly from the sidebar or from the dashboard.

3. **5 of 8 navigation groups are collapsed by default.** The Legal Engine group (templates, rules, forms, precedents, entities) and AI group (agents) are collapsed. An attorney who does not know these groups exist will not find these capabilities through navigation. Discovery depends on exploration, not design.

4. **Only 1 item in the AI group.** The "בינה וסוכנים" group contains a single entry: "סוכני AI". The 5 agents are individually accessible only from within that page, or contextually from CaseDetail (collapsed section) and DocumentDetail. The fragmented agent access (agent workspace + CaseDetail section + DocumentDetail button) creates inconsistency.

5. **Communications is 3 items in a collapsed group.** The communications module (Telegram, call logging, template matching) is buried. Attorneys working with clients via Telegram will not discover this feature without guidance.

6. **No "New Matter" or "Quick Start" prominent action.** The dashboard has an empty-state button ("בחר תיקייה לסריקה") but no always-visible "Create New Case" or "Start New Matter" primary action.

### 4.2 Workspace Design

**Is Factum-IL a unified operating system or a collection of disconnected tools?**

**Verdict: Currently a collection of connected modules with emerging unification, not yet a unified operating system.**

Evidence for fragmentation:
- The Matter Workbench (`MatterWorkbench.tsx`) is the closest thing to a unified cockpit. It composes Timeline + Document Viewer + Insights + Risk + Citations in a 3-pane layout. But it is reachable only via a button inside CaseDetail — not a first-class nav entry.
- AI agents are exposed in three separate, inconsistent surfaces: the `/agents` page, a collapsed section in CaseDetail, and a button in DocumentDetail. Each surface has different capabilities (CaseDetail offers 3 agents, `/agents` offers 5, DocumentDetail offers contract-review only).
- Research capabilities are split across: `/search` (FTS5), `/precedents` (manual registry), `/agents` (research agent), `/rules` (procedural rules), `/entities` (judge/court lookup), and the legal corpus API (no UI). These are not integrated into a coherent research workflow.
- Communications (Telegram/call logging) is disconnected from the matter workflow. Saving a message as evidence creates an `CommEvidence` record, but there is no link from `CaseCitations` or the Timeline to show that evidence.

Evidence for unification:
- The `CalendarPage` successfully aggregates hearings, deadlines, and tasks from three different data sources into a single chronological view.
- `HearingPrepPage` composes `CaseRiskPanel` + `CaseTimeline` + `CaseCitations` — a genuine workflow convergence.
- `CaseRiskPanel` appears in both `CaseDetail`, `MatterWorkbench`, and `HearingPrepPage` — good component reuse.
- Notifications service auto-resolves when tasks are completed or cases are closed.

### 4.3 Context Preservation

**Across Research → Documents:** Losing context. When an attorney opens a document from the search results page, they navigate away from the search. There is no "back to search" breadcrumb other than the browser back button.

**Across Matter → AI:** Losing context. When an attorney triggers an AI agent from CaseDetail, the output appears inline. But navigating to `/agents` resets the agent workspace — prior agent results are not persisted between navigation events.

**Across Research → Matter:** Losing context. Researching a legal question in `/agents` (research agent) with a case ID set does not create any persistent link between that research output and the case record.

**Within the 3-pane Workbench:** Context is preserved. Clicking a timeline event loads the document in the center pane without navigation. This is the strongest context-preservation in the product.

**Calendar → Case:** Partially preserved. Calendar events link to cases (`/cases/:id`) but not to specific documents or workbench views.

### 4.4 Attorney Cognitive Flow

**Deep legal research:** Poor. No research workspace. No legislation reading. Search is hidden. Precedent registry is manual.

**Long drafting sessions:** Not supported. No drafting environment exists.

**Multi-document analysis:** Partially supported. SmartCollections groups documents. The 3-pane Workbench shows one document at a time. No multi-document comparison view.

**Complex litigation matters:** Moderate. The combination of Timeline + Risk + Citations + DeadlineRadar covers litigation management well. The gap is in drafting and outgoing work product.

**Knowledge-intensive work:** Poor. The knowledge graph (entities, relations) exists in the database but has no browsable/visualizable UI. The legal corpus (1,077 laws) is loaded but has no reading interface.

---

## Phase 5 — Feature-to-UI Alignment Analysis

### 5.1 Surfacing Assessment by Feature

| Feature | UI Surfacing Level | Root Cause of Gap |
|---------|------------------|-------------------|
| Legal Corpus | Not surfaced | Component was never built (F-B from TASKS.md, still open) |
| Search | Hidden (nav absent) | Route exists, not in nav-config |
| Payment Ledger | Not surfaced | LedgerPage component not in router |
| Insolvency Module | Not surfaced | No page component built |
| Case Law Registry | Not surfaced | No page component built |
| Matter Workbench | Hard to reach | Only accessible from CaseDetail button |
| Hearing Prep | Hard to reach | Only accessible from CaseDetail button |
| Canvas | Hidden (nav absent) | Route in router, not in nav-config |
| Entity Knowledge Graph | Not visualized | Component showing flat list, not graph |
| AI Agents (contextual) | Fragmented | Three separate surfaces, inconsistent |
| Document Signatures | Embedded only | No dedicated signatures workflow page |
| Citation Harvesting | No UI trigger | Hook exists, no button anywhere |
| Agent Execution Journal | Wired incorrectly | JournalPage shows update log, not agent events |
| Tabular Data Engine | Not surfaced | No page or component |
| Worksheet Export | No UI trigger | Hook exists, no button |
| Insolvency Nudge | No UI | `useSendInsolvencyNotify` exists but no page |

### 5.2 Quantified Coverage

- **Fully exposed (accessible, in nav or clearly reachable):** ~26 of 48 capabilities = **54%**
- **Partially exposed (accessible but buried, fragmented, or hard to find):** ~14 of 48 = **29%**
- **Hidden (backend complete, no UI or unreachable):** ~8 of 48 = **17%**

### 5.3 Highest-Value Hidden Capabilities

1. **Legal Corpus (1,077 laws)** — the entire Israeli legislation library is loaded into SQLite. Zero UI exposure. This is potentially the most valuable research capability in the platform.
2. **Payment Ledger** — billing/payment tracking with hooks for schedules, payments, and client billing. Hidden behind an orphaned component.
3. **Insolvency Module** — structured debt-arrangement workflow with checklist and notifications. Complete backend, no UI.
4. **Citation Harvesting** — automated citation extraction from documents. Hook and API exist; no button to press.
5. **Entity Knowledge Graph** — judges, courts, cases, and their relationships are in the database. No visualization.

---

## Phase 6 — Unified Attorney Workstation Assessment

### Legal Research
**What exists:** FTS5 search across documents, clients, cases. Research AI agent. Precedents registry. Legal corpus API. Legal corpus FTS5 index (`fts_legal_sections`). Rules Engine (20 Israeli procedural rules).  
**What is missing:** Search UI in sidebar. Legal corpus browser. Legislation reading interface. Citation traversal. Cross-matter research reuse.  
**What is hidden:** Legal corpus (1,077 laws accessible via API but no UI). Citation harvesting.  
**What is fragmented:** Research capabilities are scattered across 6+ locations with no unified research workspace.  
**Professional standard:** Westlaw, Nevo, and Psakdin all provide searchable full-text legislation access as the entry point. Factum-IL has the data but not the interface.

### Matter Management
**What exists:** Full case CRUD. Client CRUD. Contacts linked to cases. Timeline. Risk panel. Citations tab. Activity feed. Tasks linked to cases.  
**What is missing:** Matter-level notes. Issue tracking within matters. Linking communications to specific timeline events. Matter-level research workspace.  
**What is hidden:** Hearing prep and workbench only accessible from within CaseDetail.  
**Professional standard:** Clio, MyCase, and similar platforms provide a single matter page with all sub-items accessible from one navigation level. Factum-IL approximates this with CaseDetail tabs, but the workbench (the most advanced view) is not the default.

### Document Management
**What exists:** Document ingestion pipeline (OCR, enrichment). Document registry. DocumentDetail with insights and annotations. DocumentReader with PDF viewer. SmartCollections. Evidence Locker.  
**What is missing:** Manual document upload without file watcher. Bulk document operations. Document version comparison. Folder/tagging organization within a matter.  
**What is fragmented:** Document annotation (in reader), document insights (in detail), document signing (in detail) are three separate panels with no unified document management view.  
**Professional standard:** Clio and PracticePanther provide drag-and-drop upload, folder organization, and version history. Factum-IL's pipeline approach is powerful but passive.

### Drafting
**What exists:** AI agent outputs (summaries, timelines, research results). Stens forms (structured templates). `MailWorkspacePage` (email reply generation).  
**What is missing:** Rich text editor or document editor. Draft composition workspace. Precedent insertion. Research-to-draft linking. No blank page for attorneys to write.  
**Professional standard:** All major legal platforms include a document editor. This is the most critical missing piece for professional daily use. The Stens forms library is structured but cannot substitute for free-text drafting.

### AI Assistance
**What exists:** 5 fully implemented agents (summarize, timeline, research, contract-review, discovery). Streaming output. Progress indicators. Confidence scoring. AI guardrails. Insight verification.  
**What is missing:** Proactive suggestions (AI noticing a deadline from a document without attorney triggering it). Contextual inline AI assistance while drafting. AI inside the legal corpus browser.  
**What is fragmented:** Agents are in 3 places with inconsistent UX. Research agent in the workspace requires manual question entry — no pre-filled context from the current matter.  
**Professional standard:** Harvey AI, Spellbook, and Lexis+ AI integrate AI contextually within the document/matter view. Factum-IL's agents are capable but require deliberate navigation.

### Knowledge Management
**What exists:** Entity knowledge graph (judge/court/case relations in DB). Precedents registry with AI verification. FTS5 search. Smart Collections.  
**What is missing:** Knowledge graph visualization. Cross-matter search ("find all documents where Judge X ruled on procedure type Y"). Institutional knowledge base browsing. The legal corpus (1,077 laws) has no reading interface.  
**Professional standard:** Knowledge management is a major differentiator in legal tech. Factum-IL has the infrastructure (graph, corpus, embeddings) but has not exposed it through any attorney-facing interface.

### Citation Analysis
**What exists:** `citation-engine` package (Nevo 2021 citation parser). `CitationRegistry` (migration 031). `CaseCitations` component showing frequency and matter usage. Automated citation harvesting from documents.  
**What is missing:** Citation harvesting is not triggerable from the UI (hook exists, no button). No citation-to-source navigation (click a citation and read the actual law section). No cross-matter citation comparison.  
**Professional standard:** Citation analysis is incomplete without source access. Nevo and Psakdin allow clicking a citation to read the source ruling.

### Task Management
**What exists:** Full task CRUD. Tasks linked to cases. Deadline monitoring. Calendar integration of tasks. Notifications for due tasks.  
**What is missing:** Task templates by procedure type. Recurring tasks. Task assignment to specific attorneys (RBAC v2 noted as future work). Time tracking linked to tasks.  
**Professional standard:** Competitive with practice management platforms at the current implementation level.

### Collaboration
**What exists:** Multi-role RBAC system (admin/attorney/assistant/reviewer/read_only). Communications module.  
**What is missing:** Real-time collaboration. Shared notes. Document co-editing. Assignment notifications. Client portal.  
**Professional standard:** Collaboration is a systemic gap. All major legal platforms provide at minimum attorney-level multi-user workflows.

### Reporting / Client Deliverables
**What exists:** AI case summary (exportable via copy). HearingPrepPage print button (browser print).  
**What is missing:** Formatted PDF export. Matter report generation. Client-facing summary output. Time/billing reports (payment ledger is hidden). Exhibit preparation.  
**Professional standard:** This is a significant gap. No attorney can deliver a professional work product from within Factum-IL today without external tools.

---

## Phase 7 — Competitive Standards Review

### Research Experience

| Standard | Factum-IL | Status |
|----------|-----------|--------|
| Searchable legislation | Nevo, Psakdin, Westlaw — legislation full-text search | ❌ Data exists, no UI |
| Citation-to-source navigation | Psakdin, Nevo — click citation to read source | ❌ Not implemented |
| FTS5 document search | Standard across all platforms | ✅ Implemented (buried in nav) |
| AI-powered research | Harvey, Lexis+ AI — contextual AI research | ✅ Partial (agents, isolated) |
| Legal corpus browser | All Israeli legal research platforms | ❌ Critical gap |

### Drafting Experience

| Standard | Factum-IL | Status |
|----------|-----------|--------|
| Document editor | Every legal platform | ❌ Not implemented |
| AI-assisted drafting | Spellbook, Harvey, Klarity | ❌ Not implemented |
| Template-based drafting | Clio, Rocket Lawyer | ✅ Partial (Stens forms) |
| Precedent insertion | Practice-focused platforms | ❌ Not implemented |

### Matter Management

| Standard | Factum-IL | Status |
|----------|-----------|--------|
| Matter-centric dashboard | Clio, MyCase, PracticePanther | ✅ Strong — CaseDetail with tabs |
| Timeline | Clio, Filevine | ✅ Implemented and well-integrated |
| Risk scoring | Specialized platforms | ✅ Implemented — ahead of most general platforms |
| AI case analysis | Harvey, Luminance | ✅ Implemented — 5 agents |

### Document Intelligence

| Standard | Factum-IL | Status |
|----------|-----------|--------|
| OCR | Luminance, Kira, Diligen | ✅ Full (OCRmyPDF + Docling) |
| Entity extraction | Luminance, eBrevia | ✅ Implemented (pipeline) |
| Contract review | Kira, Luminance, ContractPodAi | ✅ Implemented (agent) |
| Clause chunking | Kira, eBrevia | ✅ Implemented (retrieval package) |
| Document comparison | Nearly all platforms | ❌ Not implemented |

### Attorney Productivity

| Standard | Factum-IL | Status |
|----------|-----------|--------|
| Deadline tracking | All platforms | ✅ Strong |
| Calendar integration | All platforms | ✅ Implemented |
| Notifications | All platforms | ✅ Implemented |
| Quick actions (Cmd+K) | Modern platforms | ✅ Implemented |
| Time tracking | Clio, Cosmolex | ❌ Not implemented |
| Billing | All practice management platforms | ❌ Hidden (ledger inaccessible) |
| Client portal | Clio, MyCase, Smokeball | ❌ Not implemented |

### Competitive Summary

**Areas where Factum-IL is already competitive or ahead:**
- AI integration depth (5 specialized agents, Hebrew legal AI)
- Document intelligence (OCR + enrichment pipeline)
- Israeli legal specificity (procedures, citations, entity recognition)
- Infrastructure depth (vector search, knowledge graph, event bus)
- Deadline/risk management

**Areas where Factum-IL significantly lags:**
- Legal drafting (no editor at all — critical gap)
- Legal corpus access (data exists, no UI — embarrassing gap given the backend work)
- Knowledge management UI (graph invisible, corpus invisible)
- Client deliverables / report export
- Billing / time tracking (hidden)
- Collaboration features
- Discoverability of advanced features

---

## Phase 8 — Gap Analysis

### Gap 1: No Legal Corpus Reading Interface

**Current state:** 1,077 Israeli laws are loaded into SQLite via the `legal-corpus-ingest` package. Full text is stored in `LegalSections` table. FTS5 index `fts_legal_sections` exists. API endpoints `/api/legal-corpus/sources`, `/api/legal-corpus/search` are registered and functional.  
**Desired state:** Attorneys should be able to browse, search, and read Israeli legislation directly within the platform.  
**Impact:** Attorneys must leave Factum-IL and open Nevo or Psakdin to read a law — defeating the "no-tool-switching" vision. The most expensive backend investment in the platform (OData + WikiSource ingestion, verbatim section storage, FTS5 indexing) produces zero attorney-visible value.

### Gap 2: Search Hidden from Navigation

**Current state:** `/search` route exists, `SearchPage.tsx` is fully connected to FTS5 (`useSearch` hook, grouping, highlighting). Access is via Cmd+K SpotlightSearch or keyboard shortcut `n`/`+`.  
**Desired state:** Search should be a prominent first-level navigation item visible in the sidebar.  
**Impact:** Attorneys who are not power users will not discover search. Search is the entry point to any information-retrieval workflow. Its absence from the nav is a fundamental discoverability failure.

### Gap 3: No Drafting Workspace

**Current state:** No rich text editor, no document composition interface, no draft management exists anywhere in the codebase.  
**Desired state:** Attorneys should be able to compose legal documents within Factum-IL — motions, briefs, contracts, opinions — with AI assistance and research context.  
**Impact:** Attorneys cannot produce any work product within the platform. This is the single most important capability gap relative to professional expectations. Every other platform in this market segment includes some form of document drafting.

### Gap 4: Payment Ledger and Billing Inaccessible

**Current state:** `useLedger`, `useCreatePaymentSchedule`, `useMarkPaid` hooks exist. Backend routes exist. `LedgerPage.tsx` component exists. None of this is in the router or navigable.  
**Desired state:** Billing workflow is accessible from the client record and from matter management.  
**Impact:** The platform cannot support any billing workflow despite having implemented one. Attorneys must use external billing software for something Factum-IL has already built.

### Gap 5: Insolvency Module Inaccessible

**Current state:** Complete backend API. Four hooks. Migration 029. No UI page, no route.  
**Desired state:** Dedicated insolvency workflow accessible from case management for relevant case types.  
**Impact:** The insolvency practice area — a significant part of Israeli legal practice — has a complete backend implementation that attorneys cannot use.

### Gap 6: Matter Workbench Has No Direct Navigation Path

**Current state:** `MatterWorkbench` is the most capable attorney workspace in the platform. It requires: navigate to `/cases` → select a case → click "שולחן עבודה".  
**Desired state:** The workbench should be reachable from the main navigation, and ideally should be the default view when opening a case (or clearly promoted).  
**Impact:** The best feature is the hardest to reach. Attorneys who have not been shown the workbench may never discover it.

### Gap 7: AI Agents are Fragmented Across 3 Surfaces

**Current state:** Agents appear in (a) `/agents` workspace with full 5-agent access, (b) CaseDetail collapsed "בינה מלאכותית" section with 3 agents, (c) DocumentDetail contract-review button. The three surfaces have different capabilities and different UX patterns.  
**Desired state:** Consistent, integrated AI assistance embedded within the matter/document context without requiring navigation.  
**Impact:** Inconsistency creates confusion. An attorney using the CaseDetail section does not know they have 2 additional agents in the dedicated workspace.

### Gap 8: Knowledge Graph and Entity Network Invisible

**Current state:** `Entities` and `EntityRelations` tables (migration 042) are populated via RAG enrichment (`entity-graph.ts`). `EntitiesPage.tsx` shows flat lists of judges and courts. No visualization.  
**Desired state:** A graph view showing how judges, courts, cases, and documents are related — "Which matters involve Judge X? What courts has this client appeared in?"  
**Impact:** A high-value institutional knowledge feature exists in the database but is completely invisible to attorneys.

### Gap 9: Citation Harvesting Has No UI Trigger

**Current state:** `useHarvestCitations` → `POST /api/citations/harvest/:documentId` exists in `hooks.ts`. No component calls this hook.  
**Desired state:** A "Extract Citations" button visible on each document and within the CaseCitations view.  
**Impact:** The citation-engine package (designed for automatic Israeli citation parsing) never runs from any attorney action. Citations are shown but cannot be refreshed or triggered manually.

### Gap 10: No Client Deliverable / Export Capability

**Current state:** AI summaries are shown inline. HearingPrepPage has a browser-print button. No formatted export, no PDF generation, no report template.  
**Desired state:** Attorney can export a formatted case summary, hearing preparation brief, or risk report as a professional PDF.  
**Impact:** Every attorney output must be produced externally. The platform provides analysis but cannot package it as a deliverable. This limits adoption to partial workflow integration rather than full replacement.

---

## Phase 9 — Corrective Recommendations

### Recommendation 1: Add Global Search to Sidebar Navigation

**Current situation:** `SearchPage.tsx` fully implemented at `/search`. Not in `nav-config.tsx`.  
**Problem:** Search is the most fundamental attorney workflow. Its absence from the nav means discovery depends on knowing a keyboard shortcut.  
**Recommendation:** Add `{ to: '/search', label: 'חיפוש', Icon: MagnifyingGlassIcon }` to the `work` group in `nav-config.tsx`, above or below "לוח בקרה". This is a single-line change with immediate attorney impact.  
**Ideal experience:** Attorney sees "חיפוש" prominently in the always-visible "Current Work" group. Clicking opens the dedicated search page. Cmd+K continues to work as a power-user alternative.  
**Expected outcome:** Search discoverability increases from ~0% (knowledge-dependent) to 100% (visible). Every attorney finds search on day one.

---

### Recommendation 2: Build a Legal Corpus Browser

**Current situation:** 1,077 Israeli laws (full text, verbatim sections) are stored in SQLite. FTS5 index and API endpoints exist. Zero UI.  
**Problem:** The entire investment in legal corpus ingestion produces no attorney-visible value. Attorneys using Factum-IL for research must still open Nevo or Psakdin.  
**Recommendation:** Build `features/legal/LegalCorpusPage.tsx` with:
- Law list with search (`GET /api/legal-corpus/sources`)
- Full-text section search (`GET /api/legal-corpus/search?q=&sourceKey=`)
- Law detail view showing verbatim sections
- "Cite in Research" action linking a law section to the current matter  
Register route `/legal-corpus` and add to nav under "מנוע משפטי" group.  
**Ideal experience:** Attorney types "חוק העונשין" into the corpus search, reads the relevant sections verbatim, and clicks "הוסף לאסמכתאות" to link it to the open matter.  
**Expected outcome:** The legal corpus becomes the primary legislation research tool. Attorneys no longer need to leave the platform to read a law.

---

### Recommendation 3: Register the Payment Ledger

**Current situation:** `LedgerPage.tsx` exists as a component. `useLedger`, `useCreatePaymentSchedule`, `useMarkPaid`, `usePatchPaymentSchedule` hooks exist. No route in `router/index.tsx`.  
**Problem:** Billing functionality is implemented but inaccessible.  
**Recommendation:** Register `/ledger` in `router/index.tsx` and add to the "תיקים ולקוחות" nav group. Add "פנקס חיובים" entry with appropriate icon. Link from `ClientCard.tsx`.  
**Ideal experience:** Attorney opens a client card, sees a "פנקס חיובים" tab, creates a payment schedule, and marks installments as paid.  
**Expected outcome:** The billing workflow becomes usable without external software.

---

### Recommendation 4: Register the Insolvency Module

**Current situation:** Complete API backend. Four hooks. No page, no route.  
**Problem:** Entire insolvency practice area has no UI access.  
**Recommendation:** Build `features/cases/InsolvencyPage.tsx` or embed as a CaseDetail tab for cases with `procedureType = 'insolvency'`. Register route `/cases/:id/insolvency`. Expose in CaseDetail header when applicable.  
**Ideal experience:** When an attorney opens a case of type "חדלות פירעון", a dedicated insolvency workflow tab appears automatically.  
**Expected outcome:** Insolvency practitioners can use Factum-IL for their specific procedure.

---

### Recommendation 5: Promote Matter Workbench to Primary Case View

**Current situation:** `MatterWorkbench` is the best interface in the platform but requires 3 navigation steps to reach.  
**Problem:** The flagship feature is hidden behind navigation steps.  
**Recommendation:** Make the Matter Workbench the default view for a case (`/cases/:id` redirects to `/cases/:id/workbench`), or add a prominent "פתח שולחן עבודה" card on the CasesPage list for each case. Add a "שולחן עבודה אחרון" quick link on the dashboard.  
**Ideal experience:** Attorney clicks a case name from the cases list and is immediately in the 3-pane workbench, not a detail/tab view.  
**Expected outcome:** The workbench becomes the standard way attorneys interact with matters, not a discoverable extra.

---

### Recommendation 6: Unify AI Agent Access

**Current situation:** Agents appear in three places with different capabilities and UX patterns.  
**Problem:** Inconsistency creates confusion and prevents attorneys from knowing their full AI toolkit.  
**Recommendation:** Replace the CaseDetail "בינה מלאכותית" collapsed section with an `AgentBar` component that shows all 5 agents as action buttons (enabled/disabled based on context). Embed the same `AgentBar` in MatterWorkbench. Remove the `/agents` workspace as a separate page and make it the advanced/full-screen version of the same `AgentBar`.  
**Ideal experience:** Wherever an attorney is working on a matter or document, they see the same consistent set of AI tools.  
**Expected outcome:** AI tool discovery improves. Attorney knows the full agent capability regardless of entry point.

---

### Recommendation 7: Add a Drafting Workspace

**Current situation:** No document editor anywhere in the codebase.  
**Problem:** Attorneys cannot produce work product within the platform.  
**Recommendation:** Integrate a lightweight RTL-native rich text editor (e.g., Tiptap or Lexical with RTL configuration). Build a `DraftingPage` at `/drafting/:caseId` that:
- Provides blank RTL canvas for Hebrew legal text
- Sidebar shows matter context (timeline, risk, citations)
- AI sidebar allows research agent queries without leaving the document
- "Insert Precedent" button pulls from the citations registry
- "Export as PDF" generates a printable document  
**Ideal experience:** Attorney opens a drafting session linked to a matter, writes a motion in Hebrew with the case timeline visible in the sidebar, inserts a verified precedent from the CaseCitations panel, and exports a formatted PDF.  
**Expected outcome:** Factum-IL becomes the attorney's primary drafting environment — the most important adoption driver.

---

### Recommendation 8: Surface the Citation Harvesting Button

**Current situation:** `useHarvestCitations(documentId)` hook exists. No UI trigger in any component.  
**Problem:** Citation extraction is implemented but never runs from attorney action.  
**Recommendation:** Add "חלץ אסמכתאות" button to `DocumentDetail.tsx` alongside the existing AI enrichment status. Also add to `CaseCitations.tsx` as "עדכן אסמכתאות".  
**Expected outcome:** Attorneys can trigger citation extraction on any document. The citations tab becomes actively populated from attorney actions.

---

### Recommendation 9: Add Search to the Sidebar Navigation

(See Recommendation 1 — repeated for emphasis given critical nature.)

---

### Recommendation 10: "Today's View" Dashboard

**Current situation:** `DashboardPage.tsx` shows KPI cards (clients, cases, documents, tasks) and module tiles. No task-based daily view. TASKS.md identifies this as F-D gap.  
**Problem:** Attorneys cannot answer "What do I need to do today?" from the dashboard.  
**Recommendation:** Replace or augment the module tiles with a task-priority inbox showing: (a) tasks due today, (b) hearings this week, (c) unread notifications, (d) unverified AI insights awaiting review, (e) pending document signatures.  
**Ideal experience:** Attorney opens Factum-IL in the morning and immediately sees their prioritized daily work — no navigation required.  
**Expected outcome:** The dashboard becomes the productive starting point for every attorney session.

---

### Recommendation 11: Connect HearingPrepPage and Workbench to the Sidebar

**Current situation:** Both `/cases/:id/hearing-prep` and `/cases/:id/workbench` are absent from `nav-config.tsx`.  
**Recommendation:** Since these are case-specific, add them as dynamic "recently accessed" items in the sidebar, or add a global "Hearing Prep" shortcut in the "Current Work" group that shows upcoming hearings and links to their prep pages.

---

### Recommendation 12: Knowledge Graph Visualization

**Current situation:** Entities/EntityRelations tables populated. `GET /api/entities/graph/stats` and `GET /api/entities/backfill` endpoints exist. EntitiesPage shows flat list.  
**Recommendation:** Add a simple force-directed graph visualization (D3 or vis-network, which is RTL-compatible) to `EntitiesPage.tsx` showing the judge-court-case relationship network. Add a "הצג גרף" toggle next to the existing list view.  
**Ideal experience:** Attorney clicks "ישויות" in the sidebar and sees a network graph of all known judges, courts, and cases with hoverable nodes linking to matter details.

---

## Phase 10 — Future-State Factum-IL Vision

Based exclusively on repository evidence (components, routes, packages, and migrations already implemented), the following future state is achievable with incremental changes to existing code.

### Ideal Navigation Structure

```
עבודה שוטפת (Current Work — always visible)
  ├── לוח בקרה / "היום שלי"     → dashboard (task-based today view)
  ├── חיפוש                    → /search  [ADD TO NAV]
  ├── יומן                     → /calendar
  ├── ראדאר מועדים             → /deadlines
  ├── משימות                   → /tasks
  └── פעילות                   → /activity

תיקים ולקוחות (Cases & Clients)
  ├── תיקים                    → /cases
  ├── שולחן עבודה אחרון         → last-opened workbench [ADD]
  ├── לקוחות                   → /clients
  ├── אנשי קשר                 → /contacts
  ├── תיקי תנועה               → /traffic
  └── פנקס חיובים              → /ledger  [ADD]

מחקר משפטי (Legal Research — NEW GROUP)
  ├── חיפוש מאגר               → /search
  ├── ספריית חקיקה             → /legal-corpus  [ADD]
  ├── תקדימים                  → /precedents
  ├── כללי סדרי דין            → /rules
  └── ישויות                   → /entities

מסמכים וראיות (Documents & Evidence)
  ├── כל המסמכים              → /documents
  ├── אוספים חכמים            → /collections
  ├── כספת ראיות              → /evidence
  ├── מדיה וסריקות            → /media
  ├── תור קליטה               → /queue
  ├── תור אישורים             → /action-queue
  └── תוכנית פעולה            → /action-plan

ניסוח וטיוטות (Drafting — NEW SECTION)
  ├── עורך מסמכים             → /drafting  [BUILD]
  ├── טפסים (Stens)           → /stens
  └── תבניות הליך             → /templates

בינה וסוכנים (AI & Agents)
  └── (embedded contextually in matter/document — not a separate page)

תקשורת (Communications)
  ├── מרכז תקשורת             → /communications
  ├── מחולל מייל              → /mail
  └── חיבור Gmail             → /gmail

לימודים | מערכת (Studies | Admin — collapsed)
```

### Ideal Dashboard ("היום שלי")

1. **Priority Inbox** — tasks due today + overdue (from `TasksPage` data)
2. **Upcoming Hearings** — next 7 days (from `CalendarRepository`)
3. **AI Review Queue** — unverified document insights awaiting attorney approval
4. **Pending Signatures** — documents awaiting signature (from `DocumentSignatures`)
5. **Unread Notifications** — from `NotificationBell` data  
6. **Quick Actions** — "צור תיק", "צור לקוח", "צור משימה", "חפש" buttons

### Ideal Matter Workspace

The **MatterWorkbench** is already close to ideal. Improvements needed:
- Make it the default case view (or second tab after a minimal case header)
- Add a drafting pane as a 4th panel
- Add "הפעל סוכן" agent controls inline in the insights pane (not requiring separate navigation)
- Add "ציין אסמכתא" from within the document viewer to link to a law section in the corpus

### Ideal Research Workspace

New dedicated `/legal-research` workspace:
1. **Left panel:** Law/corpus search — search 1,077 laws by name, keyword, section
2. **Center panel:** Law text reader — verbatim Hebrew sections, scrollable
3. **Right panel:** Matter context — which of my cases is this relevant to? Related precedents.
4. **Bottom bar:** "הוסף לתיק" — link the law section to a specific case's citation register

### Ideal Drafting Workspace

At `/drafting/:caseId`:
1. **RTL rich text editor** — main composition area, Hebrew-first
2. **Left sidebar:** Matter context (timeline, risk, relevant entities)  
3. **Right sidebar:** AI research (research agent results, precedent snippets)
4. **Toolbar:** Insert citation | Insert entity | Ask AI | Export PDF | Save version

### Ideal AI Workspace

Instead of a standalone `/agents` page:
- Integrated `AgentBar` component that appears in the right panel of every matter view
- Each agent is contextually enabled/disabled based on the current view
- Research agent has pre-filled context from the current matter/document
- Agent results auto-persist to `AgentResults` table (already exists via migration 045) and appear in the matter's activity feed

### Ideal Knowledge Management Experience

`/knowledge`:
1. **Entity Graph** — D3 force-directed graph of judges, courts, cases (from EntityRelations)
2. **Cross-Matter Search** — "Search all matters" with entity filters
3. **Legal Corpus** — Browse 1,077 laws by procedure type
4. **Institutional Insights** — AI-verified insights aggregated across all matters

---

## Phase 11 — UX and Product Maturity Scores

| Category | Score | Justification |
|---------|-------|--------------|
| **Information Architecture** | 5/10 | 8-group sidebar covers all routes but 5 groups are collapsed. Search missing from nav. Flagship features buried. |
| **Navigation** | 5/10 | All routes technically accessible. Critical routes (search, workbench, hearing-prep) not in nav. Discoverability poor for non-power users. |
| **Discoverability** | 4/10 | Cmd+K palette exists and works. But 17% of capabilities have no UI, 29% are buried. Legal corpus, billing, insolvency = completely hidden. |
| **Research Experience** | 3/10 | FTS5 search works but hidden. Legal corpus inaccessible. No legislation browser. Research agent functional but isolated. |
| **Drafting Experience** | 1/10 | No drafting workspace exists. Stens forms are structured templates only. This is the platform's most critical gap. |
| **Matter Management** | 7/10 | CaseDetail with 6 tabs is strong. Risk panel, timeline, citations are well-implemented. Workbench is excellent once reached. |
| **Knowledge Management** | 3/10 | Infrastructure exists (graph, corpus, embeddings). Zero browsable UI for the knowledge layer. Precedents registry is manual only. |
| **AI Integration** | 7/10 | 5 specialized agents, streaming, confidence scoring, verification, guardrails. Fragmented across 3 surfaces. No inline contextual AI. |
| **Workflow Efficiency** | 5/10 | Calendar + deadlines + tasks = strong daily workflow. Navigation steps to reach advanced features = inefficient. No quick-start automation. |
| **Context Preservation** | 4/10 | Within workbench: excellent. Across navigation: poor. Agent results don't persist to matter. Research doesn't link to drafting. |
| **Professional Readiness** | 5/10 | Can manage matters, documents, and deadlines professionally. Cannot draft, cannot export, cannot deliver client-facing work product. |
| **Attorney Productivity** | 5/10 | Strong document intelligence + AI. Weak on the output side (no drafting, no export). Medium on discovery (too many buried features). |
| **Enterprise Readiness** | 4/10 | RBAC exists. Audit logging exists. Encrypted backup exists. Multi-user workflows are single-user oriented (no assignments). |
| **Unified Workstation Readiness** | 4/10 | The infrastructure is there. The integration layer is partial. Attorneys must still switch to external tools for drafting, legal research, and deliverables. |

---

## Phase 12 — Final Executive Verdict

### What Factum-IL Currently Is

Factum-IL is a **professionally engineered local-first legal intelligence platform** with an exceptionally deep backend infrastructure for Israeli legal practice: 66 database migrations, 25 packages, 5 AI agents, a 1,077-law legislation corpus, vector search, entity knowledge graph, OCR pipeline, RBAC, and communications management.

### What Users May Believe It Is

A document management and AI enrichment tool for Israeli legal practice, accessible via a Hebrew RTL dashboard with cases, documents, and AI agents.

### What It Actually Delivers Today

A capable **matter management and document intelligence platform** that excels at:
- Organizing cases, clients, contacts, and documents
- Extracting and verifying AI insights from documents
- Managing deadlines, hearings, and procedural risk
- Providing 5 specialized legal AI agents
- Supporting legal communications and call logging

### Which Capabilities Exist But Are Not Visible

1. **Legal corpus (1,077 Israeli laws, full text)** — backend complete, zero UI
2. **Payment ledger** — component exists, not in router
3. **Insolvency module** — backend complete, no page
4. **Case law registry** — backend complete, no page
5. **Citation harvesting trigger** — hook exists, no UI button
6. **Entity knowledge graph visualization** — data exists, no visualization
7. **Canvas/workflow** — route exists, not in nav
8. **Agent execution journal** — data captured, wiring incorrect
9. **Tabular data engine** — hooks exist, no page
10. **Worksheet export** — hook exists, no UI trigger

### Which Capabilities Are Missing Entirely

1. **Document drafting workspace** — No editor, no composer, no drafting environment
2. **Client deliverable / PDF export** — No formatted output generation
3. **Legal research workspace** — No unified research environment connecting corpus + precedents + research agent
4. **Multi-user collaboration** — Single-user-oriented throughout (no assignments, no shared notes)
5. **Time tracking** — No billable hour recording
6. **Matter-level notes** — No free-text note-taking within a matter
7. **Document comparison / versioning UI** — `DocumentVersions` table exists (migration 047), no UI
8. **Citation-to-source navigation** — No clickable citation linking to law text

### Whether Attorneys Can Use It as Their Primary Environment

**Not yet — but closer than the UI suggests.**

The gap between backend capability and UI exposure is the primary obstacle. If the legal corpus browser, the payment ledger, the search nav entry, and the drafting workspace were implemented, Factum-IL could serve as a primary working environment for document management, legal research, deadline management, and AI-assisted analysis.

Without a drafting workspace, attorneys must switch to Word, Google Docs, or Notion to produce any work product. This single gap prevents full adoption as a primary environment.

### Whether the Architecture Supports the Vision

**Yes — the architecture already supports a unified legal operating system.**

The infrastructure is correct: event bus, orchestrator, policy engine, vector search, knowledge graph, legal corpus, communications, RBAC. The platform's architectural ambition is visible in the code. What is missing is the **surface layer** — the UI components, navigation paths, and workflow integrations that expose this infrastructure to attorneys.

### What Prevents Full Achievement of the Vision Today

1. **No drafting environment** (most critical)
2. **Legal corpus not surfaced** (highest ROI per engineering day)
3. **Navigation gaps** for search, workbench, billing, insolvency
4. **Fragmented AI experience** (3 surfaces, inconsistent)
5. **No client deliverable output** (no export, no report generation)
6. **No matter-level notes** (attorneys cannot record their thinking)

---

## The 20 Highest-Value Improvements — Ranked

> **Implementation status (updated 2026-06-13):**
>
> | # | Title | Status | PR |
> |---|-------|--------|-----|
> | 1 | Global Search in sidebar nav | ✅ הושלם | #94 |
> | 2 | Legal Corpus reading interface | ✅ הושלם | #94 |
> | 3 | Drafting workspace | ⏳ טרם — גבוה-מורכב | — |
> | 4 | Register Payment Ledger | ⏳ טרם — קל | — |
> | 5 | "Today's View" dashboard | ⏳ טרם — בינוני | — |
> | 6 | Promote Matter Workbench | ✅ הושלם | #94 |
> | 7 | Unified AI agent experience | ✅ הושלם | #96 |
> | 8 | Citation harvesting button | ✅ הושלם | #94 |
> | 9 | Surface Insolvency module | ⏳ טרם — בינוני | — |
> | 10 | Connect legal research workflow | ✅ הושלם | #95 |
> | 11 | Client deliverable export (PDF + Word) | ✅ הושלם | #97 |
> | 12 | Knowledge graph visualization | ✅ הושלם | #96 |
> | 13 | Matter-level notes (Canvas surface) | ⏳ טרם — בינוני | — |
> | 14 | Fix agent execution journal | ⏳ טרם — קל | — |
> | 15 | AI insight batch review | ✅ הושלם | #95 |
> | 16 | Document version history UI | ✅ הושלם | #95 |
> | 17 | Communications ↔ matter timeline | ⏳ טרם — בינוני | — |
> | 18 | Procedure-type-aware onboarding | ⏳ טרם — קל | — |
> | 19 | Persistent agent results per matter | ✅ הושלם | #94 |
> | 20 | Scoped search within legal corpus | ⏳ טרם — קל (backend מוכן) | — |
>
> **סיכום:** 11/20 הושלמו (PRs #94–#97). נותרו 9 פריטים.

---

### #1 — Add Global Search to the Sidebar Navigation

**Why it matters:** Search is the most fundamental lawyer workflow. It is invisible in the current sidebar.  
**Problem solved:** Search discoverability — currently zero for attorneys who don't know the keyboard shortcut.  
**Workflows improved:** All research, document retrieval, client/case lookup.  
**Existing capabilities made more valuable:** FTS5 engine, `SearchPage.tsx`, `useSearch` hook — all already working.  
**Strengthens unified workstation:** Makes the foundation of information retrieval accessible.  
**Implementation:** One line in `nav-config.tsx`. Lowest effort / highest impact change in the platform.

---

### #2 — Build a Legal Corpus Reading Interface

**Why it matters:** 1,077 Israeli laws are loaded but invisible. This is the core legal research database.  
**Problem solved:** Attorneys must use Nevo/Psakdin to read legislation instead of Factum-IL.  
**Workflows improved:** All legal research, citation verification, statutory interpretation.  
**Existing capabilities made more valuable:** `legal-corpus-ingest` pipeline, `LegalCorpusRepository`, `fts_legal_sections` FTS5 index, `GET /api/legal-corpus/search` endpoint.  
**Strengthens unified workstation:** Eliminates the primary reason attorneys leave the platform during research.  
**Implementation:** New `LegalCorpusPage.tsx` + nav entry. Backend is complete.

---

### #3 — Build a Drafting Workspace

**Why it matters:** Attorneys cannot produce work product inside the platform.  
**Problem solved:** Eliminates mandatory tool-switching for document composition.  
**Workflows improved:** Motions, briefs, contracts, opinions, summaries.  
**Existing capabilities made more valuable:** Research agent (supplies content), precedents registry (supplies citations), case risk panel (supplies context), AI summaries (supplies starting material).  
**Strengthens unified workstation:** Closes the most critical gap in the end-to-end workflow.  
**Implementation:** RTL-capable rich text editor + `/drafting/:caseId` route + matter context sidebar.

---

### #4 — Register the Payment Ledger in the Router and Navigation

**Why it matters:** Billing functionality is fully implemented but completely inaccessible.  
**Problem solved:** Attorneys need external billing software despite Factum-IL having a billing module.  
**Workflows improved:** Client billing, payment tracking, fee schedules.  
**Existing capabilities made more valuable:** `useLedger`, `useCreatePaymentSchedule`, `useMarkPaid` hooks + backend routes.  
**Strengthens unified workstation:** Adds a critical practice management layer currently invisible.  
**Implementation:** Register `/ledger` in router. Add nav entry. One `import` + one route. `LedgerPage.tsx` already exists.

---

### #5 — "Today's View" Task-Priority Dashboard

**Why it matters:** Attorneys cannot see their day's work from the dashboard — only aggregate KPIs.  
**Problem solved:** Replaces a status-display page with an action-oriented daily planner.  
**Workflows improved:** Morning startup, daily planning, deadline awareness.  
**Existing capabilities made more valuable:** Task management, calendar events, notification system, AI insights requiring verification, pending signatures.  
**Strengthens unified workstation:** Makes Factum-IL the first screen an attorney opens every morning.  
**Implementation:** Refactor `DashboardPage.tsx` to show today's task list, upcoming hearings, and pending actions from existing hooks.

---

### #6 — Promote Matter Workbench to Primary Case View

**Why it matters:** The best feature in the platform requires 3 navigation steps to reach.  
**Problem solved:** Flagship feature hidden behind secondary button.  
**Workflows improved:** All matter work — document review, timeline analysis, risk monitoring.  
**Existing capabilities made more valuable:** `MatterWorkbench` already assembles Timeline + Viewer + Insights + Risk + Citations in an excellent 3-pane layout.  
**Strengthens unified workstation:** Makes the integrated workspace the default experience, not a discoverable extra.  
**Implementation:** Change `/cases/:id` default render from `CaseDetail` to `MatterWorkbench`, or add workbench as first-level tab.

---

### #7 — Unified AI Agent Experience

**Why it matters:** 5 agents in 3 surfaces with different capabilities creates confusion.  
**Problem solved:** Inconsistent AI access — attorneys don't know their full toolkit.  
**Workflows improved:** All AI-assisted analysis and research.  
**Existing capabilities made more valuable:** All 5 agents, streaming, confidence scoring — all already working.  
**Strengthens unified workstation:** Consistent AI presence throughout the platform, not isolated in a sub-page.  
**Implementation:** Extract `AgentBar` component. Embed in workbench. Remove standalone `/agents` or make it overflow view.

---

### #8 — Add Surface for Citation Harvesting

**Why it matters:** `useHarvestCitations` exists but no UI trigger — citation extraction never runs from attorney action.  
**Problem solved:** Citation intelligence requires re-enrichment but provides no way to initiate it.  
**Workflows improved:** Research, precedent tracking, case preparation.  
**Existing capabilities made more valuable:** `citation-engine` package, `CitationRegistry`, `CaseCitations` component.  
**Strengthens unified workstation:** Closes the loop between document ingestion and citation intelligence.  
**Implementation:** Add "חלץ אסמכתאות" button in `DocumentDetail.tsx` and `CaseCitations.tsx`.

---

### #9 — Surface Insolvency Module

**Why it matters:** Complete insolvency practice workflow exists, no attorney can access it.  
**Problem solved:** Insolvency practice area is blocked from using the platform.  
**Workflows improved:** Debt arrangement proceedings, creditor notifications, checklist compliance.  
**Existing capabilities made more valuable:** All four insolvency hooks and routes.  
**Strengthens unified workstation:** Expands platform coverage to another major practice area.  
**Implementation:** New `InsolvencyPage.tsx` + route registration. Backend is complete.

---

### #10 — Connect the Legal Research Experience

**Why it matters:** Research capabilities are siloed across search, agents, precedents, rules, entities, and corpus without workflow connection.  
**Problem solved:** An attorney must navigate 5+ pages to complete a single research workflow.  
**Workflows improved:** Statutory research, precedent verification, procedural analysis.  
**Existing capabilities made more valuable:** All research-related routes, the legal corpus, the research agent, the precedents registry, and the rules engine.  
**Strengthens unified workstation:** Transforms scattered tools into a coherent research workflow.  
**Implementation:** New "מחקר משפטי" nav group combining `/search`, `/legal-corpus`, `/precedents`, `/rules`, `/entities`.

---

### #11 — Implement Client Deliverable Export

**Why it matters:** Every attorney analysis and AI output cannot be delivered to clients without external tools.  
**Problem solved:** No professional output format available from within the platform.  
**Workflows improved:** Client updates, court filing preparation, opinion delivery.  
**Existing capabilities made more valuable:** AI case summaries, risk panels, citation lists, hearing prep page.  
**Strengthens unified workstation:** Allows the platform to become the end-to-end workflow, not only the analysis phase.  
**Implementation:** PDF generation for `HearingPrepPage` (already has print button — enhance to formatted PDF). Add export for AI summaries.

---

### #12 — Knowledge Graph Visualization

**Why it matters:** Entity relationships are captured but invisible. Judge-court-case networks are high-value institutional knowledge.  
**Problem solved:** Attorneys cannot see patterns across matters — which judges rule which way, which courts hear which case types.  
**Workflows improved:** Judge research, court preparation, matter strategy.  
**Existing capabilities made more valuable:** `EntityRelations` table, `EntitiesPage.tsx`, `EntitiesRepository`.  
**Strengthens unified workstation:** Surfaces the institutional knowledge layer that the platform already captures.  
**Implementation:** Add D3 or vis-network graph to `EntitiesPage.tsx`. Data is already in the database.

---

### #13 — Matter-Level Notes

**Why it matters:** Attorneys have no way to record their legal thinking within a matter.  
**Problem solved:** Attorneys must use external notes (Word, Notion, physical notebook) for case notes.  
**Workflows improved:** Legal analysis, strategy development, case preparation.  
**Existing capabilities made more valuable:** `CanvasDocuments` table (migration 019) — the canvas system already exists and supports tasks.  
**Strengthens unified workstation:** Captures attorney thinking inside the platform where it can be searched.  
**Implementation:** Surface `CanvasPage` within matter view as a "notes" panel. Add to nav.

---

### #14 — Fix the Agent Execution Journal

**Why it matters:** `JournalPage.tsx` is wired to `useUpdateStatus` (software update log), not agent execution events despite the `AgentExecutionEvents` table being available.  
**Problem solved:** Agent decisions and failures are invisible to administrators.  
**Workflows improved:** AI quality monitoring, debugging, compliance auditing.  
**Existing capabilities made more valuable:** `AgentExecutionEvents` table (migration 053), `execution-journal.ts`.  
**Implementation:** Connect `JournalPage.tsx` to `GET /api/admin/agent-journal` (needs route). Minimal change.

---

### #15 — AI Insight Batch Review Interface

**Why it matters:** Attorneys are notified of unverified insights but must review them document-by-document.  
**Problem solved:** No bulk insight review workflow.  
**Workflows improved:** AI oversight, quality control, morning review routine.  
**Existing capabilities made more valuable:** `DocumentInsights` repository, verify/edit hooks, `SmartCollections` "unverified" collection.  
**Strengthens unified workstation:** Supports the attorney oversight role for AI outputs.  
**Implementation:** New `InsightReviewPage` that lists all unverified insights across all matters with approve/reject controls.

---

### #16 — Document Version History UI

**Why it matters:** `DocumentVersions` table (migration 047) and `DocumentVersionsRepository` exist but have no UI.  
**Problem solved:** Attorneys cannot see document change history.  
**Workflows improved:** Document management, version control, evidence preservation.  
**Existing capabilities made more valuable:** All document versioning infrastructure.  
**Implementation:** Add "גרסאות" tab to `DocumentDetail.tsx`. Connect to existing repository.

---

### #17 — Communications Integration with Matter Timeline

**Why it matters:** `CommEvidence` records (saved messages) and `CallLogs` exist but do not appear in `CaseTimeline`.  
**Problem solved:** Communications are disconnected from the matter record — attorney cannot see "client called on day X and said Y" in the case history.  
**Workflows improved:** Client communication tracking, evidence organization.  
**Existing capabilities made more valuable:** `CommunicationsPanel`, `CallLogModal`, `CaseTimeline` (already has `call`/`evidence` event kinds in the KIND_META).  
**Implementation:** Surface `call` and `evidence` kind events in `CaseTimeline.tsx` with links to conversation/call records.

---

### #18 — Procedure-Type-Aware Onboarding

**Why it matters:** When a new case is created with a specific procedure type, no automatic procedural checklist, deadline rules, or task templates are applied.  
**Problem solved:** Attorneys must manually configure each new matter from scratch.  
**Workflows improved:** Matter intake, procedural compliance, deadline setup.  
**Existing capabilities made more valuable:** `Rules_Engine` table (20 rules), `ProceduralChecklist` table (migration 046), `CaseProcedure` templates, `seedProceduralChecklist` function.  
**Implementation:** Trigger `seedProceduralChecklist` when a new case is created with a `procedure_type`. All infrastructure exists.

---

### #19 — Persistent Agent Results per Matter

**Why it matters:** Agent results vanish when navigating away. `AgentResults` table (migration 045) exists for persistence but results are never loaded from it.  
**Problem solved:** Attorneys cannot review previous AI analyses.  
**Workflows improved:** Research continuity, AI output review, matter analysis history.  
**Existing capabilities made more valuable:** `AgentResults` table, all 5 agents.  
**Implementation:** Load stored `AgentResults` from the database on matter open. Display in an "AI ניתוחים קודמים" section.

---

### #20 — Embed Search within the Legal Corpus and Research Workflow

**Why it matters:** Once the legal corpus is browsable (#2 above), attorneys need to search within a specific law, not just globally.  
**Problem solved:** Law-scoped search is harder than global search but produces more targeted results.  
**Workflows improved:** Statutory interpretation, section-level research.  
**Existing capabilities made more valuable:** `fts_legal_sections` FTS5 index already supports per-source scoping via `sourceKey` parameter.  
**Strengthens unified workstation:** Completes the research workflow from "find the law" to "find the right section".  
**Implementation:** Add `sourceKey` filter to the corpus search UI. Backend already supports it.

---

## Appendix: Evidence Sources

All findings above are traceable to the following repository files:

| File | Role in Evidence |
|------|----------------|
| `apps/dashboard/src/router/index.tsx` | Complete route registry |
| `apps/dashboard/src/components/layout/nav-config.tsx` | Navigation structure (what is exposed) |
| `apps/dashboard/src/api/hooks.ts` | Complete hook inventory (what API is called) |
| `apps/dashboard/src/features/cases/CaseDetail.tsx` | Matter management UI tabs |
| `apps/dashboard/src/features/cases/MatterWorkbench.tsx` | 3-pane workbench evidence |
| `apps/dashboard/src/features/cases/HearingPrepPage.tsx` | Hearing prep workflow |
| `apps/dashboard/src/features/search/SearchPage.tsx` | Search implementation |
| `apps/dashboard/src/features/agents/AgentsWorkspacePage.tsx` | Agent workspace UI |
| `apps/dashboard/src/features/stens/StensLibraryPage.tsx` | Forms library (nearest to drafting) |
| `apps/dashboard/src/features/precedents/PrecedentsPage.tsx` | Precedents (not corpus browser) |
| `apps/dashboard/src/features/documents/DashboardPage.tsx` | Dashboard (KPI-only, not task-based) |
| `packages/api/src/routes/*.ts` | Backend capability inventory |
| `migrations/*.sql` | Database schema and data inventory |
| `TASKS.md` | Session history and known gaps (F-A through F-E) |
| `DEVELOPMENT.md` | Architecture and environment documentation |

---

*Document generated: 2026-06-06. All conclusions are evidence-based and traceable to repository sources. No speculation or assumption was used.*
