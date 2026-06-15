# Repository Coverage Report

Generated: 2026-06-15T00:03:39.966Z

Scanned `packages/database/src/queries` — found **35** repository class(es).

## Repository → Table Mapping

| Repository Class | Source File | Tables Used |
|------------------|-------------|-------------|
| `AcademicRepository` | `packages/database/src/queries/academic.ts` | `AcademicCourses`, `AcademicSubjects`, `GraphNodes`, `StudyQuestions` |
| `ActionPlanRepository` | `packages/database/src/queries/action-plan.ts` | `ActionPlan` |
| `AnnotationRepository` | `packages/database/src/queries/annotations.ts` | `Annotations` |
| `BackupRepository` | `packages/database/src/queries/backups.ts` | `BackupSnapshots`, `Documents` |
| `CalendarRepository` | `packages/database/src/queries/calendar.ts` | `CallLogs`, `Cases`, `CommEvidence`, `Documents`, `Tasks` |
| `CallLogsRepository` | `packages/database/src/queries/call-logs.ts` | `CallLogs` |
| `CaseRepository` | `packages/database/src/queries/cases.ts` | `Cases`, `Documents`, `ProcessingStatus` |
| `CitationsRepository` | `packages/database/src/queries/citations.ts` | _none detected_ |
| `ClientRepository` | `packages/database/src/queries/clients.ts` | `Clients` |
| `CommTemplatesRepository` | `packages/database/src/queries/comm-templates.ts` | `CommSecureLinks`, `CommTemplates` |
| `CommunicationsRepository` | `packages/database/src/queries/communications.ts` | `CaseAssignments`, `Cases`, `CommAudit`, `CommChannels`, `CommConsent`, `CommContactIdentities`, `CommConversations`, `CommEvidence`, `CommMessages`, `CommUnknownInbox` |
| `ContactsRepository` | `packages/database/src/queries/contacts.ts` | `CaseContacts`, `Cases`, `Contacts` |
| `DocumentRepository` | `packages/database/src/queries/documents.ts` | `DocumentInsights`, `Documents` |
| `DocumentVersionRepository` | `packages/database/src/queries/document-versions.ts` | `DocumentVersions` |
| `DraftsRepository` | `packages/database/src/queries/drafts.ts` | `DraftCitations`, `DraftVersions`, `EvidenceShelf`, `LegalDrafts` |
| `EntitiesRepository` | `packages/database/src/queries/entities.ts` | `DocumentInsights`, `Documents` |
| `EvidenceRepository` | `packages/database/src/queries/evidence.ts` | `EvidenceItems` |
| `GmailRepository` | `packages/database/src/queries/gmail.ts` | `GmailSyncConfig`, `GmailSyncLog` |
| `LegalBrainSessionsRepository` | `packages/database/src/queries/legal-brain-sessions.ts` | `LegalBrainMessages`, `LegalBrainSessions` |
| `LegalCorpusRepository` | `packages/database/src/queries/legal-corpus.ts` | `LegalSectionEmbeddings`, `LegalSections`, `LegalSources` |
| `LegalEngineRepository` | `packages/database/src/queries/legal-engine.ts` | `CaseProcedures`, `RegulationTemplates`, `TemplateMilestones` |
| `NotificationsRepository` | `packages/database/src/queries/notifications.ts` | `Notifications` |
| `PipelineLogsRepository` | `packages/database/src/queries/pipeline-logs.ts` | `PipelineLogs` |
| `PrecedentLibraryRepository` | `packages/database/src/queries/precedent-library.ts` | `Documents`, `PrecedentDocuments` |
| `ProcessedFilesRepository` | `packages/database/src/queries/processed-files.ts` | `ProcessedFiles` |
| `QueueRepository` | `packages/database/src/queries/queue.ts` | `ProcessingQueue` |
| `RulesEngineRepository` | `packages/database/src/queries/rules-engine.ts` | `Rules_Engine` |
| `SavedFiltersRepository` | `packages/database/src/queries/saved-filters.ts` | `SavedFilters` |
| `SmartCollectionsRepository` | `packages/database/src/queries/smart-collections.ts` | `DocumentInsights`, `Documents` |
| `StensRepository` | `packages/database/src/queries/stens.ts` | `StensSubmissions`, `StensTemplates` |
| `TaskRepository` | `packages/database/src/queries/tasks.ts` | `Clients`, `Tasks` |
| `TrafficCasesRepository` | `packages/database/src/queries/traffic-cases.ts` | `Cases`, `Clients`, `TrafficCases` |
| `VacuumRepository` | `packages/database/src/queries/vacuum.ts` | `VacuumSessions` |
| `VerdictCorpusRepository` | `packages/database/src/queries/verdict-corpus.ts` | `VerdictCorpus`, `VerdictCorpusEmbeddings` |
| `WatcherEventsRepository` | `packages/database/src/queries/watcher-events.ts` | `WatcherEvents` |

## Import Coverage

| Status | Count |
|--------|-------|
| Referenced outside `packages/database` | 35 |
| Defined but not imported elsewhere | 0 |

> All repositories are referenced outside `packages/database`. No dead code detected.

## Notes

- Table names are inferred from SQL string literals via regex (FROM, JOIN, INTO, UPDATE, CREATE TABLE).
- Import coverage is determined by checking for the class name across all non-test TypeScript source files.
- "Not imported" does not necessarily mean dead code — some classes may be re-exported via an index barrel.
