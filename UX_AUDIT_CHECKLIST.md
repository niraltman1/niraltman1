# UX Audit Checklist — Factum-IL Phase 7

Generated: 2026-06-14  
Phase 7 is DONE only when every row below is fully checked (all ✅).

## How to Use

For each page, fill in PASS (✅) or FAIL (❌) for each column:

| Column | Meaning |
|---|---|
| RTL | `dir="rtl"` on tables, forms, dialogs, grids |
| Loading | Uses `<LoadingPanel>` (not inline spinner) |
| Error | Uses `<ErrorPanel>` with Hebrew message + retry |
| Empty | Uses `<EmptyPanel>` with contextual message + sub |
| Tokens | No hardcoded `#hex` colors — uses CSS custom properties |
| a11y | Tab nav, aria-labels on icon buttons, focus trap in modals |
| Status | ✅ = complete, 🔄 = in progress, ❌ = not started |

---

## Pages

| Page | File | RTL | Loading | Error | Empty | Tokens | a11y | Status |
|---|---|---|---|---|---|---|---|---|
| DashboardHomePage | workspace/DashboardHomePage.tsx | | | | | | | ❌ |
| AgentsWorkspacePage | agents/AgentsWorkspacePage.tsx | | | | | | | ❌ |
| CasesPage | cases/CasesPage.tsx | | | | | | | ❌ |
| CaseDetail | cases/CaseDetail.tsx | | | | | | | ❌ |
| MatterWorkbench | cases/MatterWorkbench.tsx | | | | | | | ❌ |
| CaseTimeline | cases/CaseTimeline.tsx | | | | | | | ❌ |
| CaseRiskPanel | cases/CaseRiskPanel.tsx | | | | | | | ❌ |
| DocumentsPage | documents/DocumentsPage.tsx | | | | | | | ❌ |
| DocumentDetail | documents/DocumentDetail.tsx | | | | | | | ❌ |
| InsightReviewPage | documents/InsightReviewPage.tsx | | | | | | | ❌ |
| ClientsPage | clients/ClientsPage.tsx | | | | | | | ❌ |
| ClientCard | clients/ClientCard.tsx | | | | | | | ❌ |
| CommunicationsInboxPage | communications/CommunicationsInboxPage.tsx | | | | | | | ❌ |
| CommunicationsPanel | communications/CommunicationsPanel.tsx | | | | | | | ❌ |
| EntitiesPage | entities/EntitiesPage.tsx | | | | | | | ❌ |
| EntityDetailPage | entities/EntityDetailPage.tsx | | | | | | | ❌ |
| GraphExplorerPage | graph/GraphExplorerPage.tsx | | | | | | | ❌ |
| SearchPage | search/SearchPage.tsx | | | | | | | ❌ |
| CalendarPage | calendar/CalendarPage.tsx | | | | | | | ❌ |
| DeadlineMonitorPage | calendar/DeadlineMonitorPage.tsx | | | | | | | ❌ |
| TasksPage | tasks/TasksPage.tsx | | | | | | | ❌ |
| CitationsPage | citations/CitationsPage.tsx | | | | | | | ❌ |
| LegalCorpusPage | legal/LegalCorpusPage.tsx | | | | | | | ❌ |
| LegalLibraryPage | legal/LegalLibraryPage.tsx | | | | | | | ❌ |
| PrecedentsPage | precedents/PrecedentsPage.tsx | | | | | | | ❌ |
| SupportPage | support/SupportPage.tsx | | | | | | | ❌ |
| DataMigrationPage | data-migration/DataMigrationPage.tsx | | | | | | | ❌ |
| UpdatesCenterPage | admin/updates/UpdatesCenterPage.tsx | | | | | | | ❌ |
| DiagnosticsPage | admin/DiagnosticsPage.tsx | | | | | | | ❌ |
| MissionControlPage | admin/MissionControlPage.tsx | | | | | | | ❌ |
| RBACManagePage | admin/RBACManagePage.tsx | | | | | | | ❌ |
| JournalPage | admin/JournalPage.tsx | | | | | | | ❌ |
| BackupSettingsPage | admin/BackupSettingsPage.tsx | | | | | | | ❌ |
| RecoveryPage | admin/RecoveryPage.tsx | | | | | | | ❌ |
| StensLibraryPage | stens/StensLibraryPage.tsx | | | | | | | ❌ |
| SmartCollectionsPage | collections/SmartCollectionsPage.tsx | | | | | | | ❌ |
| MailWorkspacePage | mail/MailWorkspacePage.tsx | | | | | | | ❌ |
| MediaRegistryPage | media/MediaRegistryPage.tsx | | | | | | | ❌ |
| TrafficAlertsPage | traffic/TrafficAlertsPage.tsx | | | | | | | ❌ |
| QueueMonitor | queue/QueueMonitor.tsx | | | | | | | ❌ |
| ActionPlanPage | action-plan/ActionPlanPage.tsx | | | | | | | ❌ |
| SetupWizard | setup/SetupWizard.tsx | | | | | | | ❌ |
| ActivityFeedPage | activity/ActivityFeedPage.tsx | | | | | | | ❌ |

---

## Completion Status

| Phase 7 Gate | Target | Current |
|---|---|---|
| Pages audited | 44 | 0 |
| Pages passing all checks | 44 | 0 |
| Design tokens created | Yes | ✅ apps/dashboard/src/styles/tokens.css |
| CyberCard.tsx exists | Yes | ✅ apps/dashboard/src/components/common/CyberCard.tsx |
| SeverityBadge.tsx exists | Yes | ✅ apps/dashboard/src/components/common/SeverityBadge.tsx |
| LoadingPanel.tsx exists | Yes | ✅ apps/dashboard/src/components/common/LoadingPanel.tsx |
| ErrorPanel.tsx exists | Yes | ✅ apps/dashboard/src/components/common/ErrorPanel.tsx |
| EmptyPanel.tsx exists | Yes | ✅ apps/dashboard/src/components/common/EmptyPanel.tsx |

Phase 7 shared components and design tokens: **COMPLETE**.
Phase 7 per-page UX adoption: **IN PROGRESS** — see table above (audit pending).

---

## Empty State Standards

**BAD:** `<EmptyState message="אין נתונים" />`

**GOOD:** `<EmptyPanel message="אין תיקים פעילים." sub="ניתן ליצור תיק חדש דרך 'תיק חדש' בתפריט." />`

Every EmptyPanel must:
- Have a contextual `message` specific to the data being shown
- Have a `sub` with a recommended next action  
- Have `dir="rtl"` (default on EmptyPanel)

---

## RTL Rules

- Tables: `<table dir="rtl">`
- Forms: `<form dir="rtl">`
- Dialogs: `<dialog dir="rtl">` or `role="dialog"` wrapper
- Grids: `<div dir="rtl" className="grid ...">`

---

## Accessibility Rules

- Icon-only buttons: `aria-label` is mandatory
- Modals: `role="dialog"`, `aria-modal="true"`, focus trap
- Dialog buttons: RTL order = `[אישור] [ביטול]` (confirm LEFT of cancel)
- Keyboard: every interactive element reachable via Tab
