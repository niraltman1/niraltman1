export { DatabaseConnection } from './connection.js';
export { MigrationRunner } from './migrations/runner.js';
export { DatabaseHardening } from './hardening.js';
export { SearchEngine } from './search/engine.js';
export { QueueRepository } from './queries/queue.js';
export { BackupRepository } from './queries/backups.js';
export * from './queries/documents.js';
export * from './queries/clients.js';
export { CaseRepository } from './queries/cases.js';
export { ActionPlanRepository } from './queries/action-plan.js';
export type { CreateActionPlanInput } from './queries/action-plan.js';
export { TaskRepository } from './queries/tasks.js';
export { LegalEngineRepository } from './queries/legal-engine.js';
export { ProcessedFilesRepository } from './queries/processed-files.js';
export type { ProcessedFile, RegisterInput } from './queries/processed-files.js';
export { TrafficCasesRepository } from './queries/traffic-cases.js';
export type { TrafficCase, TrafficCaseAlert, TrafficLifecycleState, CreateTrafficCaseInput } from './queries/traffic-cases.js';
export { ContactsRepository } from './queries/contacts.js';
export type { Contact, CaseContact, ContactRole, CreateContactInput } from './queries/contacts.js';
export { AcademicRepository } from './queries/academic.js';
export type { AcademicSubject, AcademicCourse, StudyQuestion, GraphNode } from './queries/academic.js';
export { EvidenceRepository } from './queries/evidence.js';
export type { EvidenceItem, CreateEvidenceInput } from './queries/evidence.js';
export { StensRepository } from './queries/stens.js';
export { PipelineLogsRepository } from './queries/pipeline-logs.js';
export type { PipelineLogEntry, PipelineLogStatus, CreatePipelineLogInput, ScanSummary } from './queries/pipeline-logs.js';
export type { StensTemplate, StensSubmission, CreateStensTemplateInput, CreateStensSubmissionInput } from './queries/stens.js';
export { GmailRepository } from './queries/gmail.js';
export type { GmailSyncConfig, GmailSyncLog, CreateGmailConfigInput, LogSyncInput } from './queries/gmail.js';
export { VacuumRepository } from './queries/vacuum.js';
export type { VacuumSession, VacuumStatus } from './queries/vacuum.js';
export type { IntegrityReport, BackupResult, WALCheckpointMode } from './hardening.js';
export type { SearchHit, SearchOptions } from './search/engine.js';
export type { BackupSnapshot } from './queries/backups.js';
export { DocumentVersionRepository } from './queries/document-versions.js';
export type { DocumentVersion, DocumentVersionCreateInput } from './queries/document-versions.js';
export { AnnotationRepository } from './queries/annotations.js';
export type { Annotation, AnnotationCreateInput } from './queries/annotations.js';
export { CalendarRepository } from './queries/calendar.js';
export type { CalendarEvent, CalendarEventKind, DeadlineRisk, DeadlineRiskLevel } from './queries/calendar.js';
export { CitationsRepository } from './queries/citations.js';
export type { CitationGroup, CitationLocation } from './queries/citations.js';
export { EntitiesRepository } from './queries/entities.js';
export type { EntityReference } from './queries/entities.js';
export { SmartCollectionsRepository } from './queries/smart-collections.js';
export type { SmartCollectionKey, SmartCollectionItem, SmartCollectionMeta } from './queries/smart-collections.js';
export { CommunicationsRepository } from './queries/communications.js';
export type {
  CommChannel, CommDirection, ConversationStatus, ChannelStatus,
  CommConversation, CommMessage, CommChannelRow, UnknownInboxRow,
  InboundInput, RoutingResult, SendInput, SendResult,
} from './queries/communications.js';
export { CommTemplatesRepository } from './queries/comm-templates.js';
export type { CommTemplate, TemplateContext, SecureLinkInput } from './queries/comm-templates.js';
export { NotificationsRepository } from './queries/notifications.js';
export type {
  NotificationRow,
  NotificationKind,
  NotificationSeverity,
  NotificationLinkType,
  UpsertNotificationInput,
} from './queries/notifications.js';
