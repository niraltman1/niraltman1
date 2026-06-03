import type {
  DatabaseConnection,
  ClientRepository,
  CaseRepository,
  DocumentRepository,
  QueueRepository,
  ActionPlanRepository,
  BackupRepository,
  SearchEngine,
  DatabaseHardening,
  TaskRepository,
  LegalEngineRepository,
  ProcessedFilesRepository,
  TrafficCasesRepository,
  ContactsRepository,
  AcademicRepository,
  EvidenceRepository,
  StensRepository,
  GmailRepository,
  VacuumRepository,
  WatcherEventsRepository,
  PipelineLogsRepository,
  NotificationsRepository,
  CalendarRepository,
  CitationsRepository,
  EntitiesRepository,
  SmartCollectionsRepository,
  CommunicationsRepository,
  CommTemplatesRepository,
  CallLogsRepository,
  AnnotationRepository,
  RulesEngineRepository,
  LegalCorpusRepository,
} from '@factum-il/database';
import type { ConfigStore } from './utils/config-store.js';

export interface Repos {
  db:             DatabaseConnection;
  config:         ConfigStore;
  clients:        ClientRepository;
  cases:          CaseRepository;
  documents:      DocumentRepository;
  queue:          QueueRepository;
  actionPlan:     ActionPlanRepository;
  backups:        BackupRepository;
  search:         SearchEngine;
  hardening:      DatabaseHardening;
  tasks:          TaskRepository;
  legalEngine:    LegalEngineRepository;
  processedFiles: ProcessedFilesRepository;
  trafficCases:   TrafficCasesRepository;
  contacts:       ContactsRepository;
  academic:       AcademicRepository;
  evidence:       EvidenceRepository;
  stens:          StensRepository;
  gmail:          GmailRepository;
  vacuum:         VacuumRepository;
  watcherEvents:  WatcherEventsRepository;
  pipelineLogs:   PipelineLogsRepository;
  notifications:  NotificationsRepository;
  calendar:       CalendarRepository;
  citations:      CitationsRepository;
  entities:       EntitiesRepository;
  smartCollections: SmartCollectionsRepository;
  communications: CommunicationsRepository;
  commTemplates:  CommTemplatesRepository;
  callLogs:       CallLogsRepository;
  annotations:    AnnotationRepository;
  rules:          RulesEngineRepository;
  legalCorpus:    LegalCorpusRepository;
}
