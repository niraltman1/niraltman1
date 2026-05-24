export type IdType = 'personal' | 'company' | 'passport' | 'other';
export type CaseStatus = 'open' | 'closed' | 'suspended' | 'archived';
export type CaseType = 'civil' | 'criminal' | 'family' | 'labour' | 'administrative';

export interface Client {
  readonly id: number;
  readonly externalId: string | null;
  readonly nameHe: string;
  readonly nameEn: string | null;
  readonly idNumber: string | null;
  readonly idType: IdType;
  readonly phone: string | null;
  readonly email: string | null;
  readonly addressHe: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Lawyer {
  readonly id: number;
  readonly barNumber: string;
  readonly nameHe: string;
  readonly nameEn: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly specialties: string[];
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Judge {
  readonly id: number;
  readonly nameHe: string;
  readonly nameEn: string | null;
  readonly courtName: string | null;
  readonly courtType: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Case {
  readonly id: number;
  readonly caseNumber: string;
  readonly caseType: CaseType;
  readonly titleHe: string;
  readonly titleEn: string | null;
  readonly clientId: number;
  readonly leadLawyerId: number | null;
  readonly judgeId: number | null;
  readonly courtName: string | null;
  readonly openedDate: string | null;
  readonly closedDate: string | null;
  readonly status: CaseStatus;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─────────────────────────────────────────────
//  Input types
// ─────────────────────────────────────────────

export interface ClientCreateInput {
  nameHe:     string;
  nameEn?:    string | null;
  idNumber?:  string | null;
  idType?:    IdType;
  phone?:     string | null;
  email?:     string | null;
  addressHe?: string | null;
  notes?:     string | null;
}

export interface CaseCreateInput {
  caseNumber:    string;
  caseType?:     CaseType;
  titleHe:       string;
  titleEn?:      string | null;
  clientId:      number;
  leadLawyerId?: number | null;
  judgeId?:      number | null;
  courtName?:    string | null;
  openedDate?:   string | null;
  status?:       CaseStatus;
  notes?:        string | null;
}

// ─────────────────────────────────────────────
//  Action Plan
// ─────────────────────────────────────────────

export type ActionPlanStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';

export interface ActionPlanEntry {
  readonly planId:        string;
  readonly documentId:    number | null;
  readonly originalName:  string;
  readonly suggestedName: string | null;
  readonly sourceFolder:  string;
  readonly originalPath:  string;
  readonly suggestedPath: string | null;
  readonly actionType:    'RENAME' | 'MOVE' | 'RENAME_AND_MOVE' | 'SKIP';
  readonly status:        ActionPlanStatus;
  readonly aiEnriched:    boolean;
  readonly confidence:    number | null;
  readonly signedAt:      string | null;
  readonly executedAt:    string | null;
  readonly errorMessage:  string | null;
  readonly createdAt:     string;
  readonly updatedAt:     string;
}

export interface SignedActionPlan {
  readonly signedAt:     string;
  readonly entries:      ActionPlanEntry[];
  readonly totalEntries: number;
}

// ─────────────────────────────────────────────
//  Tasks
// ─────────────────────────────────────────────

export type TaskStatus   = 'pending' | 'in_progress' | 'checked' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskSource   = 'manual' | 'vacuum_protocol' | 'action_plan' | 'system';
export type TaskUrgency  = 'normal' | 'warning' | 'critical';

export interface Task {
  readonly id:          number;
  readonly title:       string;
  readonly description: string | null;
  readonly status:      TaskStatus;
  readonly priority:    TaskPriority;
  readonly dueDate:     string | null;
  readonly urgency:     TaskUrgency;
  readonly clientId:    number | null;
  readonly clientName:  string | null;
  readonly caseId:      number | null;
  readonly documentId:  number | null;
  readonly source:      TaskSource;
  readonly createdAt:   string;
  readonly updatedAt:   string;
}

export interface TaskCreateInput {
  title:        string;
  description?: string | null;
  status?:      TaskStatus;
  priority?:    TaskPriority;
  dueDate?:     string | null;
  clientId?:    number | null;
  caseId?:      number | null;
  documentId?:  number | null;
  source?:      TaskSource;
}

export interface TaskUpdateInput {
  title?:       string;
  description?: string | null;
  status?:      TaskStatus;
  priority?:    TaskPriority;
  dueDate?:     string | null;
  caseId?:      number | null;
}

// ─────────────────────────────────────────────
//  Timeline
// ─────────────────────────────────────────────

export interface TimelineEvent {
  readonly id:           number;
  readonly documentId:   number;
  readonly documentName: string;
  readonly documentType: string | null;
  readonly state:        string;
  readonly prevState:    string;
  readonly agent:        string;
  readonly success:      boolean;
  readonly errorMessage: string | null;
  readonly occurredAt:   string;
}

// ─────────────────────────────────────────────
//  Legal Engine — Regulation Templates
// ─────────────────────────────────────────────

export type TemplateStatus = 'draft' | 'active' | 'deprecated';
export type MilestoneAnchor = 'filing' | 'previous' | 'court_order';

export interface RegulationTemplate {
  readonly id:          number;
  readonly caseType:    string;
  readonly nameHe:      string;
  readonly nameEn:      string | null;
  readonly legalBasis:  string | null;
  readonly sourceUrl:   string | null;
  readonly sourceText:  string | null;
  readonly status:      TemplateStatus;
  readonly aiGenerated: boolean;
  readonly approvedAt:  string | null;
  readonly createdAt:   string;
  readonly updatedAt:   string;
}

export interface TemplateMilestone {
  readonly id:            number;
  readonly templateId:    number;
  readonly sequenceOrder: number;
  readonly titleHe:       string;
  readonly titleEn:       string | null;
  readonly description:   string | null;
  readonly dayOffset:     number | null;
  readonly anchor:        MilestoneAnchor;
  readonly isMandatory:   boolean;
  readonly taskPriority:  'low' | 'normal' | 'high' | 'critical';
  readonly createdAt:     string;
}

export interface CaseProcedure {
  readonly id:           number;
  readonly caseId:       number;
  readonly templateId:   number;
  readonly templateName: string | null;
  readonly anchorDate:   string;
  readonly status:       'active' | 'completed' | 'suspended';
  readonly notes:        string | null;
  readonly createdAt:    string;
  readonly updatedAt:    string;
}

export interface CreateTemplateInput {
  caseType:     string;
  nameHe:       string;
  nameEn?:      string | null;
  legalBasis?:  string | null;
  sourceUrl?:   string | null;
  sourceText?:  string | null;
  status?:      TemplateStatus;
  aiGenerated?: boolean;
}

export interface CreateMilestoneInput {
  titleHe:      string;
  titleEn?:     string | null;
  description?: string | null;
  dayOffset?:   number | null;
  anchor?:      MilestoneAnchor;
  isMandatory?: boolean;
  taskPriority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface GeneratedSkeleton {
  templateDraft: Omit<RegulationTemplate, 'id' | 'createdAt' | 'updatedAt' | 'approvedAt'>;
  milestones:    CreateMilestoneInput[];
  rawOllamaText: string;
}
