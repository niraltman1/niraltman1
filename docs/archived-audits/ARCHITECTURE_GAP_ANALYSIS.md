# ARCHITECTURE GAP ANALYSIS
## Factum-IL — Product Maturity Program (Phases 1–3)
Generated: 2026-06-13

---

## 1. Existing Functionality Inventory

### Dashboard & UI
| Component | Location | Status |
|-----------|----------|--------|
| DashboardPage.tsx | apps/dashboard/src/features/dashboard/ | COMPLETE — agenda, deadlines, cases, comms, docs, AI workbench, KPIs |
| NotificationBell.tsx | apps/dashboard/src/components/notifications/ | COMPLETE — bell + panel with read/mute |
| NotificationPanel.tsx | apps/dashboard/src/components/notifications/ | COMPLETE — severity filter, mark-read |
| AppShell.tsx | apps/dashboard/src/components/layout/ | COMPLETE — header, sidebar, footer |
| nav-config.tsx | apps/dashboard/src/components/layout/ | COMPLETE — 8 groups, 40+ items |
| hooks.ts | apps/dashboard/src/api/ | COMPLETE — 150+ hooks covering all domains |

### API Routes (existing, must not break)
| Route | File | Status |
|-------|------|--------|
| /api/agents/* | routes/agents.ts | COMPLETE — summarize, timeline, research, contract-review, discovery |
| /api/diagnostics/* | routes/diagnostics.ts | COMPLETE — status, bundle, crashes |
| /api/communications/* | routes/communications.ts | COMPLETE — channels, convos, inbound, consent |
| /api/notifications/* | routes/notifications.ts | COMPLETE |
| /api/cases/* | routes/cases.ts | COMPLETE |
| /api/pipeline/* | routes/queue.ts | Partial — no /failures endpoint |
| /api/agents/runs | MISSING | Need to add to agents.ts |
| /api/communications/inbox/summary | MISSING | Need to add to communications.ts |
| /api/pipeline/failures | MISSING | Need to add to queue.ts |

### Agent Modules (existing)
| Agent | File | Status |
|-------|------|--------|
| Case Summarizer | modules/agents/case-summarizer.ts | COMPLETE |
| Timeline Builder | modules/agents/timeline-builder.ts | COMPLETE |
| Research Agent | modules/agents/research-agent.ts | COMPLETE |
| Contract Review | modules/agents/contract-review.ts | COMPLETE |
| Discovery Agent | modules/agents/discovery-agent.ts | COMPLETE |
| DB Tools (shared) | modules/agents/db-tools.ts | COMPLETE — 7 tool makers |
| Persist Result (shared) | modules/agents/persist-result.ts | COMPLETE |

### Infrastructure Packages
| Package | Status |
|---------|--------|
| packages/support-diagnostics | COMPLETE — DiagnosticsCollector, SupportBundleExporter, RedactionPipeline, CrashReporter, EnvironmentSnapshot |
| packages/update-core | COMPLETE — UpdateDownloader, UpdateValidator, UpdateRollback, PostUpdateHealthCheck |
| packages/agent-core | COMPLETE — runAgent, journalEvent, markAgentCompleted, markAgentFailed, withCaseExecutionGuard |
| packages/ai | COMPLETE — OllamaClient, streamGenerate, classifyInboundMessage |
| packages/ai-guardrails | COMPLETE — checkConfidence, SafetyPipeline |
| packages/database | COMPLETE — 35+ repositories |
| packages/litigation-intelligence | COMPLETE — analyzeEvidenceGaps, getCaseCompleteness |

### Database Tables (available for reuse)
| Table | Migration | Available |
|-------|-----------|-----------|
| AgentResults | 045 | YES — used by all agents |
| LegalDrafts | 071 | YES — for draft output |
| LegalBrainSessions | 073 | YES |
| AgentRunLog | (within agent-core) | YES |
| Notifications + NotificationsResolved | 058, 059 | YES |
| CourtHearings | 028 | YES |
| Rules_Engine | 060 | YES — 20 Israeli procedural rules |
| ProceduralChecklist | 046 | YES |
| CommMessages + CommInbox | 063, 068 | YES — with ai_urgency, ai_tags |
| EvidenceItems | 018 | YES |
| InsolvencyModule | 029 | YES |
| PaymentLedger | 027 | YES |
| Entities + EntityRelations | 042 | YES |

---

## 2. Reuse Strategy

### Phase 1 — Widget Extraction (5% duplication max)
**REUSE:** Extract code FROM DashboardPage.tsx into widgets. DashboardPage imports widgets.
- `AgendaRow`, `DeadlineRow` sub-components → `AgendaWidget.tsx`
- Case grid section → `ActiveCasesWidget.tsx`
- Communications section → `CommunicationsWidget.tsx`
- Document center section → `EvidenceWidget.tsx`
- `StatCard`, `PanelHeader`, `SectionRule`, `AttentionRow`, helpers → shared in `workspace/widgets/common.tsx`

**REUSE:** `NotificationBell` + `NotificationPanel` already implement severity filtering and mark-read. The `NotificationDrawer` in Section 7 IS the existing `NotificationPanel` — no rebuild needed.

**REUSE:** All data hooks from `hooks.ts` — extend, do not recreate.

### Phase 2 — Agent Pattern (0% new infrastructure)
**REUSE:** `runAgent` from `@factum-il/agent-core`
**REUSE:** `persistAgentResult` from `./persist-result.ts`
**REUSE:** All `db-tools.ts` tool makers (makeCaseTool, makeCaseHearingsTool, makeCaseEvidenceTool, etc.)
**REUSE:** `withCaseExecutionGuard`, `journalEvent`, `markAgentCompleted`, `markAgentFailed`
**REUSE:** `checkConfidence` from `@factum-il/ai-guardrails`
**EXTEND:** Add new route handlers to existing `agents.ts`

### Phase 3A — Support Platform
**REUSE:** `DiagnosticsCollector`, `SupportBundleExporter` from `packages/support-diagnostics`
**REUSE:** Existing `/api/diagnostics` route — add 2 endpoints to existing file
**CREATE:** `RepairRecommendationsEngine.ts`, `SelfHealingActions.ts` (new classes)

### Phase 3B — Database Intelligence
**CREATE:** New package `packages/database-intelligence` (no equivalent exists)

---

## 3. Duplication Risks

| Risk | Mitigation |
|------|-----------|
| DashboardPage + DashboardHomePage showing same sections twice | Extract to widgets, both pages import same components |
| New agent routes duplicating existing validation boilerplate | Extract to a helper function `caseAgentHandler()` in agents.ts |
| New notification UI duplicating NotificationPanel | Don't create a new drawer — reuse NotificationPanel via NotificationBell (already exists) |
| useWorkspaceOverview duplicating individual hooks | useWorkspaceOverview calls individual queries internally, hook results are not duplicated |

---

## 4. File Creation Justification

### New Files — Phase 1

| File | Justification |
|------|---------------|
| `workspace/widgets/common.tsx` | Shared sub-components (StatCard, PanelHeader, etc.) extracted from DashboardPage to avoid duplication |
| `workspace/widgets/AgendaWidget.tsx` | Extracted from DashboardPage; reused by both DashboardPage and DashboardHomePage |
| `workspace/widgets/ActiveCasesWidget.tsx` | Extracted from DashboardPage; reused by both pages |
| `workspace/widgets/CommunicationsWidget.tsx` | Extracted from DashboardPage; reused by both pages |
| `workspace/widgets/EvidenceWidget.tsx` | Extracted from DashboardPage; reused by both pages |
| `workspace/store/useWorkspaceOverview.ts` | Aggregates multiple queries into one model; prevents N×fetch in new page |
| `workspace/DashboardHomePage.tsx` | New /workspace route — the primary daily attorney cockpit |
| `workspace/widgets/LegalBrainWidget.tsx` | NEW section (AgentRunLog + LegalBrainSessions + LegalDrafts) — no equivalent in existing pages |
| `workspace/widgets/CaseIntelligenceCard.tsx` | NEW per-case actionable intelligence panel — no equivalent exists |

### New Files — Phase 2

| File | Justification |
|------|---------------|
| `modules/agents/insolvency-agent.ts` | New agent type — no equivalent; uses InsolvencyModule + PaymentLedger |
| `modules/agents/deadline-analysis-agent.ts` | New agent type — synthesizes Rules_Engine + CourtHearings + ProceduralChecklist |
| `modules/agents/hearing-prep-agent.ts` | New agent type — generates hearing briefs; no equivalent |
| `modules/agents/case-intake-agent.ts` | New agent type — onboarding workflow; no equivalent |

### New Files — Phase 3A

| File | Justification |
|------|---------------|
| `packages/support-diagnostics/src/RepairRecommendationsEngine.ts` | Confirmed missing via repository scan |
| `packages/support-diagnostics/src/SelfHealingActions.ts` | Confirmed missing via repository scan |
| `features/support/SupportPage.tsx` | New /support route — no dashboard UI for diagnostics exists |

### New Files — Phase 3B

| File | Justification |
|------|---------------|
| `packages/database-intelligence/*` | Entirely new capability — no equivalent package in repo |
| `features/data-migration/DataMigrationPage.tsx` | New /data-migration route — new capability |
| `packages/api/src/routes/data-migration.ts` | New API domain — no existing route serves this |

---

## 5. Implementation Sequence

```
Phase 1:
  1. workspace/widgets/common.tsx           (extract shared sub-components)
  2. workspace/widgets/AgendaWidget.tsx     (extract + parameterize)
  3. workspace/widgets/ActiveCasesWidget.tsx
  4. workspace/widgets/CommunicationsWidget.tsx
  5. workspace/widgets/EvidenceWidget.tsx
  6. workspace/widgets/LegalBrainWidget.tsx (new)
  7. workspace/widgets/CaseIntelligenceCard.tsx (new)
  8. workspace/store/useWorkspaceOverview.ts
  9. DashboardPage.tsx (refactor to use widgets — backward-compatible)
  10. API: GET /api/agents/runs (add to agents.ts)
  11. API: GET /api/communications/inbox/summary (add to communications.ts)
  12. API: GET /api/pipeline/failures (add to queue.ts)
  13. hooks.ts (add useAgentRuns, useCommInboxSummary, usePipelineFailures)
  14. workspace/DashboardHomePage.tsx
  15. router/index.tsx (add /workspace, /support, /data-migration)
  16. nav-config.tsx (add items)

Phase 2 Priority A:
  17. modules/agents/insolvency-agent.ts
  18. modules/agents/deadline-analysis-agent.ts
  19. modules/agents/hearing-prep-agent.ts
  20. modules/agents/case-intake-agent.ts
  21. routes/agents.ts (add 4 new POST routes)
  22. AgentsWorkspacePage.tsx (add cards)

Phase 3A:
  23. packages/support-diagnostics/src/RepairRecommendationsEngine.ts
  24. packages/support-diagnostics/src/SelfHealingActions.ts
  25. packages/support-diagnostics/src/index.ts (export new classes)
  26. routes/diagnostics.ts (add /recommendations, /heal)
  27. features/support/SupportPage.tsx

Phase 3B:
  28. packages/database-intelligence/* (all files)
  29. routes/data-migration.ts
  30. features/data-migration/DataMigrationPage.tsx
```
