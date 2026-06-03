import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError } from './client.js';
import type { ApiResponse } from './client.js';

// ─────────────────────────────────────────────
//  Query keys
// ─────────────────────────────────────────────
export const QUERY_KEYS = {
  queueStats:       ['queue', 'stats']          as const,
  queueItems:       ['queue', 'items']          as const,
  poisonedItems:    ['queue', 'poisoned']       as const,
  documents:        ['documents']               as const,
  document:         (id: number) => ['documents', id] as const,
  clients:          ['clients']                 as const,
  client:           (id: number) => ['clients', id] as const,
  clientTimeline:   (id: number) => ['clients', id, 'timeline'] as const,
  cases:            ['cases']                   as const,
  case:             (id: number) => ['cases', id] as const,
  actionPlan:       (status?: string) => ['action-plan', status ?? 'all'] as const,
  tasks:            (filters?: string) => ['tasks', filters ?? 'all'] as const,
  clientSummary:    (id: number) => ['clients', id, 'summary'] as const,
  templates:        ['legal-engine', 'templates'] as const,
  templateByCaseType: (ct: string) => ['legal-engine', 'templates', 'by-case-type', ct] as const,
  caseProcedure:    (caseId: number) => ['legal-engine', 'cases', caseId, 'procedure'] as const,
  search:           (q: string) => ['search', q] as const,
  metrics:          (name: string) => ['metrics', name] as const,
  processingStatus: (docId: number) => ['processing', docId] as const,
  workerHealth:     ['admin', 'workers']         as const,
  watcherEvents:    ['admin', 'watcher']         as const,
  backupSnapshots:  ['admin', 'backups']         as const,
  notifications:    ['notifications']             as const,
} as const;

// ─────────────────────────────────────────────
//  Base fetch
// ─────────────────────────────────────────────

export interface QueueStats {
  byState:  Record<string, number>;
  poisoned: number;
  total:    number;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body: ApiResponse<T> = await res.json();
  if (!body.success) throw new ApiClientError(body.error.code, body.error.message);
  return body.data;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body ?? {}),
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

async function patchJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body ?? {}),
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

export async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE' });
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

// ─────────────────────────────────────────────
//  Queue
// ─────────────────────────────────────────────

export function useQueueStats() {
  return useQuery({
    queryKey: QUERY_KEYS.queueStats,
    queryFn:  () => fetchJSON<QueueStats>('/api/queue/stats'),
    refetchInterval: 3_000,
    retry: false,
  });
}

export function useQueueItems(limit = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.queueItems, limit],
    queryFn:  () => fetchJSON<Record<string, unknown>[]>(`/api/queue/items?limit=${limit}`),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function usePoisonedItems() {
  return useQuery({
    queryKey: QUERY_KEYS.poisonedItems,
    queryFn:  () => fetchJSON<Record<string, unknown>[]>('/api/queue/poisoned'),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useRequeueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => postJSON(`/api/queue/requeue/${itemId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.queueStats });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.poisonedItems });
    },
  });
}

// ─────────────────────────────────────────────
//  Documents
// ─────────────────────────────────────────────

export function useDocuments(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.documents, page, pageSize],
    queryFn:  () => fetchJSON<{ items: Record<string, unknown>[]; total: number }>(
      `/api/documents?page=${page}&pageSize=${pageSize}`,
    ),
    retry: false,
  });
}

export function useDocument(id: number) {
  return useQuery({
    queryKey: QUERY_KEYS.document(id),
    queryFn:  () => fetchJSON<Record<string, unknown>>(`/api/documents/${id}`),
    enabled:  id > 0,
  });
}

export function useProcessingStatus(documentId: number) {
  return useQuery({
    queryKey: QUERY_KEYS.processingStatus(documentId),
    queryFn:  () => fetchJSON<Record<string, unknown>[]>(`/api/documents/${documentId}/status`),
    enabled:  documentId > 0,
    refetchInterval: 5_000,
  });
}

// ─────────────────────────────────────────────
//  Search
// ─────────────────────────────────────────────

/** Canonical search-hit contract returned by `GET /api/search` (see SearchEngine.SearchHit). */
export interface SearchHit {
  entityType: 'document' | 'client' | 'case';
  id:         number;
  rank:       number;
  snippet:    string;
  title:      string;
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: QUERY_KEYS.search(query),
    queryFn:  () => fetchJSON<SearchHit[]>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled:  query.trim().length >= 2,
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────
//  Admin — Worker Health
// ─────────────────────────────────────────────

export function useWorkerHealth() {
  return useQuery({
    queryKey: QUERY_KEYS.workerHealth,
    queryFn:  () => fetchJSON<Record<string, unknown>[]>('/api/admin/workers'),
    refetchInterval: 5_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────
//  Admin — Watcher Events
// ─────────────────────────────────────────────

export function useWatcherEvents(limit = 30) {
  return useQuery({
    queryKey: [...QUERY_KEYS.watcherEvents, limit],
    queryFn:  () => fetchJSON<Record<string, unknown>[]>(`/api/admin/watcher/events?limit=${limit}`),
    refetchInterval: 5_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────
//  Admin — Backup Snapshots
// ─────────────────────────────────────────────

export function useBackupSnapshots() {
  return useQuery({
    queryKey: QUERY_KEYS.backupSnapshots,
    queryFn:  () => fetchJSON<Record<string, unknown>[]>('/api/admin/backups'),
    retry: false,
  });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<{ snapshotId: string }>('/api/admin/backups'),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.backupSnapshots }),
  });
}

// ─────────────────────────────────────────────
//  Admin — Repair tools
// ─────────────────────────────────────────────

export function useRepairManifest() {
  return useMutation({
    mutationFn: () => postJSON('/api/admin/repair/manifest'),
  });
}

export function useReplayJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => postJSON(`/api/admin/repair/replay/${itemId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.queueStats });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.queueItems });
    },
  });
}

export function useCheckIntegrity() {
  return useMutation({
    mutationFn: () => postJSON<{ ok: boolean; errors: string[] }>('/api/admin/repair/integrity'),
  });
}

// ─────────────────────────────────────────────
//  Admin — Settings (Org Directory)
// ─────────────────────────────────────────────

export interface SystemSettings {
  orgDirectory: string;
}

export function useSystemSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn:  () => fetchJSON<SystemSettings>('/api/admin/settings'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<SystemSettings>) =>
      postJSON<SystemSettings>('/api/admin/settings', settings),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

// ─────────────────────────────────────────────
//  Admin — Vacuum Protocol
// ─────────────────────────────────────────────

export type VacuumAction = 'move' | 'keep' | 'pending' | 'skip' | 'skip_encrypted' | 'skip_corrupt';

export interface VacuumEntry {
  filePath:     string;
  fileName:     string;
  caseNumber:   string | null;
  expectedPath: string | null;
  action:       VacuumAction;
  contradiction: string | null;
  detectedAt:   string;
}

export interface VacuumReport {
  dryRun:       boolean;
  scannedCount: number;
  moveCount:    number;
  pendingCount: number;
  skipCount:    number;
  entries:      VacuumEntry[];
  errors:       string[];
  startedAt:    string;
  finishedAt:   string;
}

export function useVacuumSimulate() {
  return useMutation({
    mutationFn: (opts: { targetDir?: string }) =>
      postJSON<VacuumReport>('/api/admin/vacuum/simulate', opts),
  });
}

// ─────────────────────────────────────────────
//  Tabular Data Engine (CSV / Excel)
// ─────────────────────────────────────────────

export interface CaseScale {
  caseNumber:  string;
  docCount:    number;
  lastSeen:    string;
  extensions:  string[];
}

export interface TabularIngestResult {
  fileHash:     string;
  rowCount:     number;
  sheetCount:   number;
  caseScales:   CaseScale[];
  linkedDocIds: number[];
  errors:       string[];
  effortReport: { workUnits: number; throttleCount: number; totalThrottledMs: number; ceilPercent: number };
  rows:         { rowIndex: number; caseNumber: string | null; israeliId: string | null; dateStr: string | null; attorney: string | null; sourceSheet: string }[];
}

export function useCaseScales() {
  return useQuery({
    queryKey: ['tabular', 'case-scales'],
    queryFn:  () => fetchJSON<CaseScale[]>('/api/tabular/case-scales'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useIngestTabular() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { filePath: string; ceilPercent?: number }) =>
      postJSON<TabularIngestResult>('/api/tabular/ingest', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tabular'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useVacuumApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { targetDir?: string }) =>
      postJSON<VacuumReport>('/api/admin/vacuum/apply', opts),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['media'] });
    },
  });
}

// ─────────────────────────────────────────────
//  Clients
// ─────────────────────────────────────────────

export function useClients(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.clients, page, pageSize],
    queryFn:  () => fetchJSON<{ items: Record<string, unknown>[]; total: number; page: number; pageSize: number }>(
      `/api/clients?page=${page}&pageSize=${pageSize}`,
    ),
    retry: false,
  });
}

export function useClient(id: number) {
  return useQuery({
    queryKey: QUERY_KEYS.client(id),
    queryFn:  () => fetchJSON<Record<string, unknown>>(`/api/clients/${id}`),
    enabled:  id > 0,
  });
}

export function useClientTimeline(clientId: number) {
  return useQuery({
    queryKey: QUERY_KEYS.clientTimeline(clientId),
    queryFn:  () => fetchJSON<Record<string, unknown>[]>(`/api/clients/${clientId}/timeline`),
    enabled:  clientId > 0,
    staleTime: 30_000,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => postJSON<{ id: number }>('/api/clients', body),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.clients }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      patchJSON<Record<string, unknown>>(`/api/clients/${id}`, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.client(id) });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.clients });
    },
  });
}

// ─────────────────────────────────────────────
//  Cases
// ─────────────────────────────────────────────

export function useCases(page = 1, pageSize = 50, clientId?: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (clientId) params.set('clientId', String(clientId));
  return useQuery({
    queryKey: [...QUERY_KEYS.cases, page, pageSize, clientId],
    queryFn:  () => fetchJSON<{ items: Record<string, unknown>[]; total: number }>(`/api/cases?${params}`),
    retry: false,
  });
}

export function useCase(id: number) {
  return useQuery({
    queryKey: QUERY_KEYS.case(id),
    queryFn:  () => fetchJSON<Record<string, unknown>>(`/api/cases/${id}`),
    enabled:  id > 0,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => postJSON<{ id: number }>('/api/cases', body),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.cases }),
  });
}

// ─────────────────────────────────────────────
//  Action Plan
// ─────────────────────────────────────────────

export function useActionPlan(status?: string) {
  const path = status ? `/api/action-plan?status=${status}` : '/api/action-plan';
  return useQuery({
    queryKey: QUERY_KEYS.actionPlan(status),
    queryFn:  () => fetchJSON<Record<string, unknown>[]>(path),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useApproveActionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planIds: string[]) => postJSON('/api/action-plan/approve', { planIds }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['action-plan'] }),
  });
}

export function useRejectActionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planIds: string[]) => postJSON('/api/action-plan/reject', { planIds }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['action-plan'] }),
  });
}

export function useSignActionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planIds: string[]) => postJSON<{ signedAt: string; totalEntries: number }>('/api/action-plan/sign', { planIds }),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['action-plan'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export interface ExecuteResult {
  planId:    string;
  success:   boolean;
  finalPath: string | null;
  errorMsg:  string | null;
}

export function useExecuteActionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planIds: string[]) =>
      postJSON<{ executed: number; failed: number; results: ExecuteResult[] }>(
        '/api/action-plan/execute',
        { planIds },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['action-plan'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

// ─────────────────────────────────────────────
//  Tasks
// ─────────────────────────────────────────────

export interface TaskRecord {
  id:          number;
  title:       string;
  description: string | null;
  status:      'pending' | 'in_progress' | 'checked' | 'cancelled';
  priority:    'low' | 'normal' | 'high' | 'critical';
  dueDate:     string | null;
  urgency:     'normal' | 'warning' | 'critical';
  clientId:    number | null;
  clientName:  string | null;
  caseId:      number | null;
  documentId:  number | null;
  source:      string;
  createdAt:   string;
  updatedAt:   string;
}

export function useTasks(filters?: {
  status?: string;
  clientId?: number;
  caseId?: number;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status)   params.set('status',   filters.status);
  if (filters?.clientId) params.set('clientId', String(filters.clientId));
  if (filters?.caseId)   params.set('caseId',   String(filters.caseId));
  if (filters?.page)     params.set('page',     String(filters.page));
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

  const qs = params.toString();
  return useQuery({
    queryKey: QUERY_KEYS.tasks(qs || undefined),
    queryFn:  () => fetchJSON<{ items: TaskRecord[]; total: number; hasNextPage: boolean }>(
      `/api/tasks${qs ? `?${qs}` : ''}`
    ),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TaskRecord> & { title: string }) =>
      postJSON<TaskRecord>('/api/tasks', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<TaskRecord> & { id: number }) =>
      patchJSON<TaskRecord>(`/api/tasks/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJSON(`/api/tasks/${id}/delete`, {}),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useClientSummaryText(clientId: number | null) {
  return useQuery({
    queryKey: QUERY_KEYS.clientSummary(clientId ?? 0),
    queryFn:  () => fetchJSON<{ text: string; clientName: string; doneCount: number; pendingCount: number }>(
      `/api/clients/${clientId}/summary/text`
    ),
    enabled: clientId !== null && clientId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────
//  Legal Engine
// ─────────────────────────────────────────────

export interface MilestoneDraft {
  titleHe:     string;
  titleEn?:    string | null;
  description?: string | null;
  dayOffset?:  number | null;
  anchor?:     'filing' | 'previous' | 'court_order';
  isMandatory?: boolean;
  taskPriority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface TemplateFull {
  id:          number;
  caseType:    string;
  nameHe:      string;
  nameEn:      string | null;
  legalBasis:  string | null;
  sourceUrl:   string | null;
  status:      'draft' | 'active' | 'deprecated';
  aiGenerated: boolean;
  approvedAt:  string | null;
  createdAt:   string;
  milestones:  (MilestoneDraft & { id: number; sequenceOrder: number })[];
}

export interface GeneratedSkeleton {
  templateDraft: Omit<TemplateFull, 'id' | 'createdAt' | 'milestones' | 'approvedAt'>;
  milestones:    MilestoneDraft[];
  rawOllamaText: string;
}

export function useTemplates(status?: 'active' | 'draft' | 'deprecated') {
  return useQuery({
    queryKey: status ? [...QUERY_KEYS.templates, status] : QUERY_KEYS.templates,
    queryFn:  () => fetchJSON<TemplateFull[]>(
      status ? `/api/legal-engine/templates?status=${status}` : '/api/legal-engine/templates'
    ),
    staleTime: 60_000,
    retry: false,
  });
}

export function useApproveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      postJSON<TemplateFull>(`/api/legal-engine/templates/${id}/approve`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legal-engine'] });
    },
  });
}

export function useDeprecateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      postJSON<{ deprecated: number }>(`/api/legal-engine/templates/${id}/deprecate`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legal-engine'] });
    },
  });
}

export function useTemplateByCaseType(caseType: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.templateByCaseType(caseType ?? ''),
    queryFn:  () => fetchJSON<{ exists: boolean; template: TemplateFull | null }>(
      `/api/legal-engine/templates/by-case-type/${encodeURIComponent(caseType ?? '')}`
    ),
    enabled:  caseType !== null && caseType.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCaseProcedure(caseId: number | null) {
  return useQuery({
    queryKey: QUERY_KEYS.caseProcedure(caseId ?? 0),
    queryFn:  () => fetchJSON<{
      id: number; caseId: number; templateId: number; templateName: string | null;
      anchorDate: string; status: string;
    } | null>(`/api/legal-engine/cases/${caseId}/procedure`),
    enabled:  caseId !== null && caseId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLearnTemplate() {
  return useMutation({
    mutationFn: (body: { caseType: string; legalBasis: string; sourceText: string; sourceUrl?: string | null }) =>
      postJSON<GeneratedSkeleton>('/api/legal-engine/learn', body),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      caseType:    string;
      nameHe:      string;
      legalBasis?: string | null;
      sourceUrl?:  string | null;
      sourceText?: string | null;
      aiGenerated?: boolean;
      milestones:  MilestoneDraft[];
    }) => postJSON<TemplateFull>('/api/legal-engine/templates', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.templates });
      void qc.invalidateQueries({ queryKey: ['legal-engine'] });
    },
  });
}

export function useApplyTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, templateId, anchorDate }: { caseId: number; templateId: number; anchorDate: string }) =>
      postJSON<{ procedure: unknown; tasksCreated: number }>(
        `/api/legal-engine/cases/${caseId}/apply-template`,
        { templateId, anchorDate }
      ),
    onSuccess: (_data, { caseId }) => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.caseProcedure(caseId) });
    },
  });
}

// ─────────────────────────────────────────────
//  Phase 8 — Media Registry
// ─────────────────────────────────────────────

export interface ProcessedFileEntry {
  id:                number;
  fileHash:          string;
  originalPath:      string;
  currentPath:       string;
  originalName:      string;
  convertedPdfPath:  string | null;
  fileSizeBytes:     number | null;
  mimeType:          string | null;
  processingStatus:  'pending' | 'hashing' | 'converting' | 'ocr' | 'complete' | 'failed' | 'skipped';
  skipReason:        string | null;
  ocrTextPreview:    string | null;
  documentId:        number | null;
  clientId:          number | null;
  lastScanned:       string;
  createdAt:         string;
}

export interface MediaRegistryStats {
  total:      number;
  complete:   number;
  pending:    number;
  failed:     number;
  skipped:    number;
  converting: number;
  byMimeType: Record<string, number>;
}

export interface IngestResult {
  status:     'already_registered' | 'path_updated' | 'converted_to_pdf' | 'registered' | 'failed' | 'excluded';
  fileHash:   string;
  documentId: number | null;
  pdfPath:    string | null;
  message:    string;
}

export function useMediaRegistry(page = 1, status?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (status) params.set('status', status);
  return useQuery({
    queryKey: ['media', 'registry', page, status],
    queryFn:  () => fetchJSON<{ items: ProcessedFileEntry[]; total: number; page: number; pageSize: number; hasNextPage: boolean }>(
      `/api/media/registry?${params.toString()}`
    ),
    staleTime:       10_000,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useMediaRegistryStats() {
  return useQuery({
    queryKey: ['media', 'registry', 'stats'],
    queryFn:  () => fetchJSON<MediaRegistryStats>('/api/media/registry/stats'),
    staleTime:       5_000,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useMediaHealth() {
  return useQuery({
    queryKey: ['media', 'health'],
    queryFn:  () => fetchJSON<{ tesseract: boolean; imageMagick: boolean; ready: boolean; heicSupport: boolean }>('/api/media/health'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useIngestFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { filePath: string; clientId?: number | null; clientName?: string }) =>
      postJSON<IngestResult>('/api/media/ingest', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export interface MineResult {
  scanned:    number;
  ingested:   number;
  skipped:    number;
  failed:     number;
  errors:     string[];
  durationMs: number;
}

export function useArchiveMine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rootDir: string; force?: boolean }) =>
      postJSON<MineResult>('/api/importer/archive-mine', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: ['scan-summary'] });
    },
  });
}

export interface ScanSummaryEntry {
  id:                number;
  fileHash:          string | null;
  fileName:          string;
  status:            'processing' | 'ocr_success' | 'failed_ocr' | 'ai_resolved' | 'failed_ai' | 'excluded' | 'duplicate';
  errorMessage:      string | null;
  extractedClientId: number | null;
  clientProvisioned: boolean;
  urgencyLevel:      string | null;
  sentiment:         string | null;
  timestamp:         string;
}

export interface ScanSummaryData {
  totalScanned: number;
  successful:   number;
  failed:       number;
  excluded:     number;
  duplicates:   number;
  entries:      ScanSummaryEntry[];
  generatedAt:  string;
}

export function useScanSummary(withinMinutes = 60) {
  return useQuery({
    queryKey:        ['scan-summary', withinMinutes],
    queryFn:         () => fetchJSON<ScanSummaryData>(`/api/media/scan-summary?minutes=${withinMinutes}`),
    refetchInterval: 4_000,
    retry:           false,
  });
}

// ─────────────────────────────────────────────
//  Phase 9 — Traffic State Machine
// ─────────────────────────────────────────────

export type TrafficLifecycleState =
  | 'request_to_stand_trial'
  | 'police_ingestion'
  | 'summons_issued'
  | 'closed'
  | 'statute_lapsed';

export interface TrafficCaseData {
  id:                    number;
  caseId:                number;
  lifecycleState:        TrafficLifecycleState;
  requestDate:           string | null;
  ingestionDate:         string | null;
  summonsDate:           string | null;
  closedDate:            string | null;
  statuteDeadline:       string | null;
  daysRemaining:         number | null;
  rejectionDetected:     boolean;
  rejectionKeywords:     string[] | null;
  rejectionExcerpt:      string | null;
  policeFileNumber:      string | null;
  prosecutionEntity:     string | null;
  offenseDescription:    string | null;
  notes:                 string | null;
  drivingLicenseNumber:  string | null;
  identityNodeType:      'id_number' | 'driving_license' | 'passport';
  createdAt:             string;
  updatedAt:             string;
}

export interface TrafficCaseAlert {
  caseId:            number;
  caseTitleHe:       string;
  caseNumber:        string;
  clientName:        string;
  lifecycleState:    TrafficLifecycleState;
  daysRemaining:     number | null;
  rejectionDetected: boolean;
  rejectionKeywords: string[] | null;
  statuteDeadline:   string | null;
}

export function useTrafficCase(caseId: number) {
  return useQuery({
    queryKey:  ['traffic', 'case', caseId],
    queryFn:   () => fetchJSON<TrafficCaseData | null>(`/api/traffic/by-case/${caseId}`),
    staleTime: 30_000,
    retry:     false,
  });
}

export function useTrafficAlerts(daysWarning = 90) {
  return useQuery({
    queryKey:        ['traffic', 'alerts', daysWarning],
    queryFn:         () => fetchJSON<TrafficCaseAlert[]>(`/api/traffic/alerts?days=${daysWarning}`),
    staleTime:       60_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useCreateTrafficCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      caseId:              number;
      requestDate?:        string | null;
      ingestionDate?:      string | null;
      policeFileNumber?:   string | null;
      prosecutionEntity?:  string | null;
      offenseDescription?: string | null;
      notes?:              string | null;
    }) => postJSON<TrafficCaseData>('/api/traffic/', body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['traffic', 'case', vars.caseId] });
      void qc.invalidateQueries({ queryKey: ['traffic', 'alerts'] });
    },
  });
}

export function useTransitionTrafficState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, state, date }: { caseId: number; state: TrafficLifecycleState; date?: string | null }) =>
      patchJSON<TrafficCaseData>(`/api/traffic/${caseId}/state`, { state, date }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['traffic', 'case', vars.caseId] });
      void qc.invalidateQueries({ queryKey: ['traffic', 'alerts'] });
    },
  });
}

export function useUpdateTrafficMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: number; body: Partial<TrafficCaseData> }) =>
      patchJSON<TrafficCaseData>(`/api/traffic/${caseId}/metadata`, body),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['traffic', 'case', vars.caseId] }),
  });
}

// ─────────────────────────────────────────────
//  Contacts (CRM)
// ─────────────────────────────────────────────

export type ContactRole =
  | 'opposing_counsel' | 'prosecutor' | 'witness'
  | 'police' | 'court_clerk' | 'expert' | 'expert_witness'
  | 'investigator' | 'co_defendant' | 'family' | 'other';

export interface ContactRecord {
  id:           number;
  nameHe:       string;
  nameEn:       string | null;
  role:         ContactRole;
  phone:        string | null;
  email:        string | null;
  organization: string | null;
  idNumber:     string | null;
  notes:        string | null;
  createdAt:    string;
  updatedAt:    string;
}

export interface CaseContactRecord extends ContactRecord {
  roleInCase: string | null;
  addedAt:    string;
}

export function useContacts(query?: string) {
  const q = query ? `?q=${encodeURIComponent(query)}&limit=100` : '?limit=100';
  return useQuery({
    queryKey: ['contacts', 'list', query ?? ''],
    queryFn:  () => fetchJSON<ContactRecord[]>(`/api/contacts${q}`),
    staleTime: 30_000,
  });
}

export function useContact(id: number | null) {
  return useQuery({
    queryKey: ['contacts', id],
    queryFn:  () => fetchJSON<ContactRecord>(`/api/contacts/${id}`),
    enabled:  id !== null,
  });
}

export function useCaseContacts(caseId: number | null) {
  return useQuery({
    queryKey: ['contacts', 'case', caseId],
    queryFn:  () => fetchJSON<CaseContactRecord[]>(`/api/cases/${caseId}/contacts`),
    enabled:  caseId !== null,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<ContactRecord, 'id' | 'createdAt' | 'updatedAt'>) =>
      postJSON<ContactRecord>('/api/contacts', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<ContactRecord> & { id: number }) =>
      patchJSON<ContactRecord>(`/api/contacts/${id}`, patch),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['contacts', vars.id] });
      void qc.invalidateQueries({ queryKey: ['contacts', 'list'] });
    },
  });
}

export function useLinkContactToCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, contactId, roleInCase }: { caseId: number; contactId: number; roleInCase?: string | null }) =>
      postJSON<{ linked: boolean }>(`/api/cases/${caseId}/contacts`, { contactId, roleInCase }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['contacts', 'case', vars.caseId] });
    },
  });
}

export function useUnlinkContactFromCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, contactId }: { caseId: number; contactId: number }) =>
      deleteJSON<{ unlinked: boolean }>(`/api/cases/${caseId}/contacts/${contactId}`),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['contacts', 'case', vars.caseId] });
    },
  });
}

// ── Studies / Academic Hub ─────────────────────────────────────────────────

export interface AcademicSubject {
  id: number; nameHe: string; nameEn: string | null;
  description: string | null; createdAt: string;
}
export interface AcademicCourse {
  id: number; subjectId: number; nameHe: string;
  semester: string | null; year: number | null;
  notes: string | null; createdAt: string;
}
export interface StudyQuestion {
  id: number; courseId: number | null; documentId: number | null;
  questionHe: string; optionA: string; optionB: string;
  optionC: string; optionD: string;
  correctAnswer: 'a' | 'b' | 'c' | 'd'; explanation: string | null;
  sourceSlide: number | null; createdAt: string;
}
export interface GraphNode {
  id: number; courseId: number | null; labelHe: string;
  nodeType: string; parentId: number | null;
  metadataJson: string | null; createdAt: string;
}

export function useSubjects() {
  return useQuery({
    queryKey: ['studies', 'subjects'],
    queryFn: () => fetchJSON<AcademicSubject[]>('/api/studies/subjects'),
  });
}

export function useCourses(subjectId?: number) {
  return useQuery({
    queryKey: ['studies', 'courses', subjectId],
    queryFn: () => fetchJSON<AcademicCourse[]>(
      subjectId ? `/api/studies/courses?subjectId=${subjectId}` : '/api/studies/courses',
    ),
  });
}

export function useCourseQuestions(courseId: number | null) {
  return useQuery({
    queryKey: ['studies', 'questions', courseId],
    queryFn: () => fetchJSON<StudyQuestion[]>(`/api/studies/courses/${courseId}/questions`),
    enabled: courseId !== null,
  });
}

export function useCourseGraph(courseId: number | null) {
  return useQuery({
    queryKey: ['studies', 'graph', courseId],
    queryFn: () => fetchJSON<GraphNode[]>(`/api/studies/courses/${courseId}/graph`),
    enabled: courseId !== null,
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { nameHe: string; nameEn?: string | null; description?: string | null }) =>
      postJSON<AcademicSubject>('/api/studies/subjects', input),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['studies', 'subjects'] }); },
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subjectId: number; nameHe: string; semester?: string | null; year?: number | null }) =>
      postJSON<AcademicCourse>('/api/studies/courses', input),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['studies', 'courses'] }); },
  });
}

export function useGenerateQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { documentId: number; courseId?: number | null; count?: number }) =>
      postJSON<{ generated: number; questions: StudyQuestion[]; message: string }>(
        '/api/studies/generate-questions', input,
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['studies', 'questions', vars.courseId] });
    },
  });
}

// ── Evidence Locker ────────────────────────────────────────────────────────

export interface EvidenceItemRecord {
  id:               number;
  documentId:       number | null;
  caseId:           number | null;
  clientId:         number | null;
  originalPath:     string;
  lockerPath:       string;
  fileHash:         string;
  originalFilename: string;
  mimeType:         string | null;
  sourceApp:        'whatsapp' | 'email' | 'manual';
  mediaType:        'voice_note' | 'image' | 'message' | 'attachment' | 'file';
  ocrText:          string | null;
  isWriteProtected: boolean;
  notes:            string | null;
  lockedAt:         string;
  createdAt:        string;
}

export function useEvidenceList(filters?: { caseId?: number; clientId?: number; mediaType?: string }) {
  const params = new URLSearchParams();
  if (filters?.caseId)    params.set('caseId',    String(filters.caseId));
  if (filters?.clientId)  params.set('clientId',  String(filters.clientId));
  if (filters?.mediaType) params.set('mediaType', filters.mediaType);
  const qs = params.toString();
  return useQuery({
    queryKey: ['evidence', 'list', qs],
    queryFn:  () => fetchJSON<EvidenceItemRecord[]>(`/api/evidence${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
    retry: false,
  });
}

export function useEvidenceItem(id: number | null) {
  return useQuery({
    queryKey: ['evidence', id],
    queryFn:  () => fetchJSON<EvidenceItemRecord>(`/api/evidence/${id}`),
    enabled:  id !== null,
    retry:    false,
  });
}

export function useLockEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sourcePath: string;
      caseId?:    number | null;
      clientId?:  number | null;
      sourceApp?: 'whatsapp' | 'email' | 'manual';
      mediaType?: 'voice_note' | 'image' | 'message' | 'attachment' | 'file';
      notes?:     string | null;
    }) => postJSON<{ status: string; evidenceId: number | null; lockerPath: string | null; message: string }>(
      '/api/evidence/lock', body,
    ),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['evidence'] }); },
  });
}

// ── Stens Library ──────────────────────────────────────────────────────────

export interface StensTemplateRecord {
  id:           number;
  nameHe:       string;
  nameEn:       string | null;
  category:     string;
  formSchema:   string;
  instructions: string | null;
  legalBasis:   string | null;
  version:      string;
  isActive:     boolean;
  createdAt:    string;
}

export interface StensSubmissionRecord {
  id:           number;
  templateId:   number;
  caseId:       number | null;
  clientId:     number | null;
  fieldValues:  string;
  aiFilled:     boolean;
  aiConfidence: number | null;
  status:       'draft' | 'completed' | 'submitted';
  createdAt:    string;
  updatedAt:    string;
}

export function useStensTemplates(category?: string) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return useQuery({
    queryKey: ['stens', 'templates', category ?? 'all'],
    queryFn:  () => fetchJSON<StensTemplateRecord[]>(`/api/stens/templates${q}`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useStensTemplate(id: number | null) {
  return useQuery({
    queryKey: ['stens', 'templates', id],
    queryFn:  () => fetchJSON<StensTemplateRecord>(`/api/stens/templates/${id}`),
    enabled:  id !== null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useStensAiFill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, caseId, clientId }: { templateId: number; caseId?: number | null; clientId?: number | null }) =>
      postJSON<{ submission: StensSubmissionRecord; fieldValues: Record<string, string>; confidence: number }>(
        `/api/stens/templates/${templateId}/fill`,
        { ...(caseId != null ? { caseId } : {}), ...(clientId != null ? { clientId } : {}) },
      ),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['stens', 'submissions'] }); },
  });
}

export function useSaveStensSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      templateId:   number;
      caseId?:      number | null;
      clientId?:    number | null;
      fieldValues:  Record<string, unknown>;
      aiFilled?:    boolean;
      aiConfidence?: number | null;
    }) => postJSON<StensSubmissionRecord>('/api/stens/submissions', body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['stens', 'submissions'] }); },
  });
}

export function useStensSubmissions(filters?: { caseId?: number; clientId?: number }) {
  const params = new URLSearchParams();
  if (filters?.caseId)   params.set('caseId',   String(filters.caseId));
  if (filters?.clientId) params.set('clientId', String(filters.clientId));
  const qs = params.toString();
  return useQuery({
    queryKey: ['stens', 'submissions', qs],
    queryFn:  () => fetchJSON<StensSubmissionRecord[]>(`/api/stens/submissions${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
    retry: false,
  });
}

// ── Canvas / Workflow ──────────────────────────────────────────────────────

export interface CanvasDocumentData {
  document: Record<string, unknown>;
  insights: Record<string, unknown> | null;
  tasks:    TaskRecord[];
}

export function useCanvasDocument(docId: number | null) {
  return useQuery({
    queryKey: ['canvas', 'document', docId],
    queryFn:  () => fetchJSON<CanvasDocumentData>(`/api/canvas/document/${docId}`),
    enabled:  docId !== null,
    staleTime: 10_000,
    retry: false,
  });
}

export function useCreateCanvasTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, ...body }: { docId: number; title: string; description?: string | null; dueDate?: string | null }) =>
      postJSON<TaskRecord>(`/api/canvas/document/${docId}/tasks`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['canvas', 'document', vars.docId] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ── Admin Stats & Demo Seeder ──────────────────────────────────────────────

export interface AdminStats {
  clients:         number;
  openCases:       number;
  totalCases:      number;
  documentsTotal:  number;
  documentsOcr:    number;
  aiEnriched:      number;
  tasksPending:    number;
  tasksOverdue:    number;
  evidenceItems:   number;
  stensTemplates:  number;
  studyQuestions:  number;
  studyCourses:    number;
  trafficAlerts:   number;
  backupsTotal:    number;
  backupEncrypted: boolean;
  queuePending:    number;
  lastBackupAt:    string | null;
}

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn:  () => fetchJSON<AdminStats>('/api/admin/stats'),
    refetchInterval: 15_000,
    retry: false,
  });
}

export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<{ seeded: boolean; counts: Record<string, number> }>('/api/admin/seed-demo', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['stens'] });
    },
  });
}

// ── Update Status ─────────────────────────────────────────────────────────

export interface UpdateLogRecord {
  id:         number;
  channel:    'security' | 'content';
  version:    string | null;
  status:     'success' | 'failed' | 'skipped';
  details:    string | null;
  error:      string | null;
  applied_at: string;
}

export function useUpdateStatus() {
  return useQuery({
    queryKey: ['updates', 'status'],
    queryFn:  () => fetchJSON<{ security: UpdateLogRecord[]; content: UpdateLogRecord[] }>('/api/updates/status'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useTriggerContentUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON('/api/updates/content/trigger', {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['updates'] }),
  });
}

// ── Gmail Bridge ──────────────────────────────────────────────────────────────

export interface GmailConfig {
  id:           number;
  gmail_address: string;
  label_filter:  string;
  last_sync_at:  string | null;
  is_enabled:    number;
}

export interface GmailSyncLog {
  id:                   number;
  sync_config_id:       number;
  synced_at:            string;
  messages_found:       number;
  attachments_ingested: number;
  errors_count:         number;
  error_summary:        string | null;
}

export interface GmailStatus {
  enabled:     boolean;
  configCount: number;
  lastSync:    string | null;
}

export function useGmailStatus() {
  return useQuery({
    queryKey: ['gmail', 'status'],
    queryFn:  () => fetchJSON<GmailStatus>('/api/gmail/status'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useGmailConfigs() {
  return useQuery({
    queryKey: ['gmail', 'configs'],
    queryFn:  () => fetchJSON<GmailConfig[]>('/api/gmail/configs'),
    retry: false,
  });
}

export function useGmailAuthUrl() {
  return useQuery({
    queryKey: ['gmail', 'auth-url'],
    queryFn:  () => fetchJSON<{ url: string }>('/api/gmail/auth-url'),
    staleTime: Infinity,
    retry: false,
  });
}

export function useGmailSync(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<unknown>(`/api/gmail/configs/${id}/sync`, {}),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['gmail'] }),
  });
}

export function useGmailLogs(id: number) {
  return useQuery({
    queryKey: ['gmail', 'logs', id],
    queryFn:  () => fetchJSON<GmailSyncLog[]>(`/api/gmail/configs/${id}/logs`),
    retry: false,
  });
}

// ── Security Status + AI Health ───────────────────────────────────────────────

export interface SecurityStatus {
  backupEncrypt:   boolean;
  keySource:       string | null;
  lastEncryptedAt: string | null;
  totalEncrypted:  number;
}

export interface AiHealth {
  model:          string;
  ollamaReachable: boolean;
  tier:           'high' | 'standard' | 'low' | 'unknown';
  isLegalBrain:   boolean;
}

export function useSecurityStatus() {
  return useQuery({
    queryKey: ['admin', 'security-status'],
    queryFn:  () => fetchJSON<SecurityStatus>('/api/admin/security-status'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useAiHealth() {
  return useQuery({
    queryKey: ['admin', 'ai-health'],
    queryFn:  () => fetchJSON<AiHealth>('/api/admin/ai-health'),
    refetchInterval: 30_000,
    retry: false,
  });
}

// ── Vacuum Protocol ───────────────────────────────────────────────────────────

export interface VacuumSessionData {
  id:                 number;
  sessionUuid:        string;
  targetPath:         string;
  status:             'pending' | 'discovery' | 'processing_ocr' | 'locking_evidence' | 'indexing_ai' | 'completed' | 'failed';
  progressPercentage: number;
  currentStepText:    string | null;
  rawLogs:            string;
  startedAt:          string;
  updatedAt:          string;
  completedAt:        string | null;
}

export function useStartVacuum() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetPath: string }) =>
      postJSON<{ sessionId: number; sessionUuid: string }>('/api/vacuum/start', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vacuum'] }),
  });
}

export function useVacuumStatus(sessionId: number | null) {
  return useQuery({
    queryKey: ['vacuum', 'session', sessionId],
    queryFn:  () => fetchJSON<VacuumSessionData>(`/api/vacuum/session/${sessionId}`),
    enabled:  sessionId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'completed' || s === 'failed') return false;
      return 1_500;
    },
    retry: false,
  });
}

// ── Document Insights ─────────────────────────────────────────────────────────

export interface DocumentInsightsData {
  document_id:        number;
  case_number:        string | null;
  court_name:         string | null;
  judge_name:         string | null;
  offense_type:       string | null;
  next_hearing:       string | null;
  charges:            string | null;
  confidence:         number | null;
  model_used:         string | null;
  raw_response:       string | null;
  // provenance fields (migration 037)
  id?:                number;
  source_page?:       number | null;
  ocr_confidence?:    number | null;
  ai_model_version?:  string | null;
  extraction_method?: string | null;
  verification_state?: string | null;
}

export function useDocumentInsights(documentId: number | null) {
  return useQuery({
    queryKey: ['documents', documentId, 'insights'],
    queryFn:  () => fetchJSON<DocumentInsightsData>(`/api/documents/${documentId}/insights`),
    enabled:  documentId !== null && documentId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Case Insights ─────────────────────────────────────────────────────────────

export interface CaseInsightRecord extends DocumentInsightsData {
  filename: string;
}

export function useCaseInsights(caseId: number | null) {
  return useQuery({
    queryKey: ['cases', caseId, 'insights'],
    queryFn:  () => fetchJSON<CaseInsightRecord[]>(`/api/cases/${caseId}/insights`),
    enabled:  caseId !== null && caseId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Review Queue ──────────────────────────────────────────────────────────────

export interface ReviewPendingItem {
  id:             number;
  filename:       string;
  ocr_text:       string | null;
  document_type:  string | null;
  processing_state: string;
  ai_case_number: string | null;
  ai_court_name:  string | null;
  ai_judge_name:  string | null;
  ai_offense_type: string | null;
  ai_next_hearing: string | null;
  ai_confidence:  number | null;
  created_at:     string;
}

export function useReviewPendingItems() {
  return useQuery({
    queryKey: ['queue', 'review-pending'],
    queryFn:  () => fetchJSON<ReviewPendingItem[]>('/api/queue/review-pending'),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useApproveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJSON<{ approved: boolean }>(`/api/queue/approve/${id}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['queue', 'review-pending'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useCorrectItem() {
  return useMutation({
    mutationFn: (vars: { id: number; field_name: string; original_value?: string; corrected_value: string }) =>
      postJSON<{ recorded: boolean }>(`/api/queue/correct/${vars.id}`, {
        field_name:      vars.field_name,
        corrected_value: vars.corrected_value,
        ...(vars.original_value !== undefined ? { original_value: vars.original_value } : {}),
      }),
  });
}

// ── Worksheet Export ──────────────────────────────────────────────────────────

export function useExportWorksheet() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<{ path: string; filename: string }>(`/api/cases/${caseId}/worksheet/export`, {}),
  });
}

// ── Legal Precedents ──────────────────────────────────────────────────────────

export interface PrecedentRecord {
  id:            number;
  citation:      string;
  case_title:    string | null;
  court_level:   string | null;
  decision_date: string | null;
  summary_he:    string | null;
  created_at:    string;
}

export interface PrecedentAnalysis {
  id:                   number;
  precedent_id:         number;
  document_id:          number | null;
  legal_analogy:        string | null;
  distinguishing_risks: string | null;
  drafted_arguments:    string | null;
  model_version:        string;
  confidence:           number | null;
  created_at:           string;
}

export function usePrecedents() {
  return useQuery({
    queryKey: ['precedents'],
    queryFn:  () => fetchJSON<PrecedentRecord[]>('/api/precedents'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreatePrecedent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PrecedentRecord, 'id' | 'created_at'>) =>
      postJSON<PrecedentRecord>('/api/precedents', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['precedents'] }),
  });
}

export function useVerifyPrecedent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJSON<PrecedentAnalysis>(`/api/precedents/${id}/verify`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['precedents'] }),
  });
}

// ── Payment Ledger ─────────────────────────────────────────────────────────

export interface PaymentSchedule {
  id:              number;
  client_id:       number;
  description_he:  string;
  total_amount:    number;
  paid_amount:     number;
  due_date:        string;
  payment_status:  'PENDING' | 'PAID' | 'OVERDUE';
  invoice_number:  string | null;
  receipt_number:  string | null;
  morning_doc_url: string | null;
  notes:           string | null;
  overdue_days:    number;
  created_at:      string;
  updated_at:      string;
}

export interface LedgerSummary {
  totalAmount:  number;
  clearedFunds: number;
  openBalance:  number;
}

export function useLedger(clientId?: number) {
  return useQuery({
    queryKey: ['ledger', clientId ?? 'all'],
    queryFn:  () => fetchJSON<{ schedules: PaymentSchedule[]; summary: LedgerSummary }>(
      clientId ? `/api/ledger?clientId=${clientId}` : '/api/ledger',
    ),
    staleTime: 30_000,
  });
}

export function useCreatePaymentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => postJSON<PaymentSchedule>('/api/ledger', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ledger'] }),
  });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJSON<PaymentSchedule>(`/api/ledger/${id}/mark-paid`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ledger'] }),
  });
}

export function usePatchPaymentSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) =>
      postJSON<PaymentSchedule>(`/api/ledger/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ledger'] }),
  });
}

// ── Insolvency Module ─────────────────────────────────────────────────────

export interface InsolvencyFiling {
  id:                 number;
  case_id:            number;
  phase:              'Pre_Filing' | 'Judicial_Litigation';
  official_receiver:  string | null;
  trustee_name:       string | null;
  form5_submitted_at: string | null;
  phase_changed_at:   string | null;
  created_at:         string;
  updated_at:         string;
}

export interface ChecklistItem {
  id:         number;
  filing_id:  number;
  section:    string;
  field_key:  string;
  label_he:   string;
  status:     'missing' | 'partial' | 'complete';
  value:      string | null;
  updated_at: string;
}

export interface InsolvencyData {
  filing:    InsolvencyFiling;
  checklist: Record<string, ChecklistItem[]>;
  progress:  { total: number; complete: number };
}

export function useInsolvency(caseId: number) {
  return useQuery({
    queryKey: ['insolvency', caseId],
    queryFn:  () => fetchJSON<InsolvencyData | null>(`/api/insolvency/${caseId}`),
    staleTime: 30_000,
  });
}

export function useInitInsolvency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: number; body: unknown }) =>
      postJSON<InsolvencyFiling>(`/api/insolvency/${caseId}/init`, body),
    onSuccess: (_d, { caseId }) => void qc.invalidateQueries({ queryKey: ['insolvency', caseId] }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, fieldKey, body }: { caseId: number; fieldKey: string; body: unknown }) =>
      fetch(`/api/insolvency/${caseId}/checklist/${fieldKey}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      }).then((r) => r.json() as Promise<{ success: boolean; data: ChecklistItem }>)
        .then((r) => { if (!r.success) throw new Error('Update failed'); return r.data; }),
    onSuccess: (_d, { caseId }) => void qc.invalidateQueries({ queryKey: ['insolvency', caseId] }),
  });
}

export function useSendInsolvencyNotify() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<{ sent: boolean; gapCount?: number }>(`/api/insolvency/${caseId}/form5-notify`, {}),
  });
}

// ── Global Case Law ───────────────────────────────────────────────────────

export interface CaseLawRecord {
  id:             number;
  citation:       string;
  case_title:     string | null;
  court_level:    string | null;
  decision_date:  string | null;
  governing_law:  string | null;
  offense_clause: string | null;
  summary_he:     string | null;
  source:         'uploaded' | 'harvested' | 'manual';
  created_at:     string;
}

export interface RelevanceTest {
  id:              number;
  case_law_id:     number;
  case_id:         number | null;
  step1_passed:    number;
  step2_passed:    number;
  step3_passed:    number;
  steps_passed:    number;
  step1_reason:    string | null;
  step2_reason:    string | null;
  step3_reason:    string | null;
  citation_string: string | null;
  model_version:   string;
  tested_at:       string;
}

export function useCaseLaw(params?: { source?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.source) qs.set('source', params.source);
  if (params?.search) qs.set('search', params.search);
  return useQuery({
    queryKey: ['case-law', params ?? {}],
    queryFn:  () => fetchJSON<{ rows: CaseLawRecord[]; total: number }>(`/api/case-law?${qs}`),
    staleTime: 30_000,
  });
}

export function useCreateCaseLaw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => postJSON<CaseLawRecord>('/api/case-law', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['case-law'] }),
  });
}

export function useRunCaseLawTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lawId, caseId }: { lawId: number; caseId: number }) =>
      postJSON<{ test: RelevanceTest; badge: string }>(`/api/case-law/${lawId}/test`, { caseId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['case-law'] }),
  });
}

// ── Citations ────────────────────────────────────────────────────────────

export interface CitationRecord {
  id:                   number;
  citation:             string;
  context_snippet:      string | null;
  source_document_id:   number | null;
  case_id:              number | null;
  inferred_relevance:   string | null;
  resolved_case_law_id: number | null;
  status:               'unresolved' | 'linked' | 'archived';
  created_at:           string;
}

export function useCitations(caseId?: number) {
  return useQuery({
    queryKey: ['citations', caseId ?? 'all'],
    queryFn:  () => fetchJSON<{ rows: CitationRecord[]; total: number }>(
      caseId ? `/api/citations?caseId=${caseId}` : '/api/citations',
    ),
    staleTime: 30_000,
  });
}

export function useHarvestCitations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) =>
      postJSON<{ harvested: number; citations: string[] }>(`/api/citations/harvest/${documentId}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['citations'] }),
  });
}

// ─────────────────────────────────────────────
//  Activity Feed
// ─────────────────────────────────────────────

export interface ActivityEventRow {
  id:         number;
  kind:       string;
  caseId:     number | null;
  documentId: number | null;
  source:     string | null;
  confidence: number | null;
  message:    string | null;
  details:    unknown;
  emittedAt:  string;
}

export function useActivityFeed(opts: { limit?: number; kind?: string; caseId?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.limit  !== undefined) params.set('limit',  String(opts.limit));
  if (opts.kind)                 params.set('kind',   opts.kind);
  if (opts.caseId !== undefined) params.set('caseId', String(opts.caseId));
  return useQuery({
    queryKey: ['activity', opts],
    queryFn:  () => fetchJSON<ActivityEventRow[]>(`/api/activity?${params.toString()}`),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useCaseActivity(caseId: number | null) {
  return useQuery({
    queryKey: ['activity', 'case', caseId],
    queryFn:  () => fetchJSON<ActivityEventRow[]>(`/api/activity/case/${caseId}`),
    enabled:  caseId != null,
    refetchInterval: 5_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────
//  Mission Control
// ─────────────────────────────────────────────

export interface MissionControlSnapshot {
  queues:         { total: number; poisoned: number; byState: Array<{ state: string; n: number }> };
  workers:        Array<{ worker_id: string; status: string; last_heartbeat_at: string | null; current_task_count: number; memory_mb: number }>;
  ai:             { ollama: boolean; model: string; latencyMs: number };
  database:       { sizeMb: number | null; walFrames: number };
  writeMutex:     { locked: boolean; queueDepth: number; queued: string[] };
  schedulers:     Array<{ source: string; last_run: string; run_count: number }>;
  recentFailures: Array<{ id: number; kind: string; message: string | null; emitted_at: string }>;
  ts:             string;
}

export function useMissionControl() {
  return useQuery({
    queryKey: ['mission-control'],
    queryFn:  () => fetchJSON<MissionControlSnapshot>('/api/mission-control/snapshot'),
    refetchInterval: 5_000,
    retry: false,
  });
}

// ─────────────────────────────────────────────
//  Document Insights — Verification
// ─────────────────────────────────────────────

export function useVerifyInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ insightId, state }: { insightId: number; state: 'approved' | 'rejected' }) =>
      postJSON<{ id: number; verification_state: string }>(`/api/documents/insights/${insightId}/verify`, { state }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export interface InsightEditFields {
  caseNumber?:  string | null;
  courtName?:   string | null;
  judgeName?:   string | null;
  offenseType?: string | null;
  nextHearing?: string | null;
}

/** Inline-edit the extracted fields of an insight before approving (§4.2.1). */
export function useEditInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ insightId, fields }: { insightId: number; fields: InsightEditFields }) =>
      patchJSON<Record<string, unknown>>(`/api/documents/insights/${insightId}`, fields),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ─────────────────────────────────────────────
//  Health
// ─────────────────────────────────────────────

export interface HealthCheck {
  healthy:    boolean;
  detail?:    string;
  durationMs: number;
}

export interface HealthResponse {
  ok:     boolean;
  ts:     number;
  checks: { db: HealthCheck; migrations: HealthCheck; ollama: HealthCheck; queue: HealthCheck; disk: HealthCheck };
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn:  async (): Promise<HealthResponse> => {
      const res = await fetch('/api/health');
      // Health may return 503; still parse body
      return res.json() as Promise<HealthResponse>;
    },
    refetchInterval: 15_000,
    retry: false,
  });
}

// ── Signatures ────────────────────────────────────────────────────────────────

export function useRequestSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: number) =>
      postJSON<Record<string, unknown>>('/api/signatures/request', { documentId }),
    onSuccess: (_data, documentId) => {
      void qc.invalidateQueries({ queryKey: ['signatures', 'document', documentId] });
      void qc.invalidateQueries({ queryKey: ['signatures', 'pending'] });
    },
  });
}

export function useSignDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ signatureId, notes }: { signatureId: number; notes?: string }) =>
      postJSON<Record<string, unknown>>('/api/signatures/sign', { signatureId, notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['signatures'] });
    },
  });
}

export function useRejectSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ signatureId, notes }: { signatureId: number; notes: string }) =>
      postJSON<Record<string, unknown>>('/api/signatures/reject', { signatureId, notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['signatures'] });
    },
  });
}

export function useDocumentSignatures(documentId: number | null) {
  return useQuery({
    queryKey: ['signatures', 'document', documentId],
    queryFn: () => fetchJSON<Record<string, unknown>[]>(`/api/signatures/document/${documentId}`),
    enabled: documentId !== null,
  });
}

export function usePendingSignatures() {
  return useQuery({
    queryKey: ['signatures', 'pending'],
    queryFn: () => fetchJSON<Record<string, unknown>[]>('/api/signatures/pending'),
  });
}

// ── Agent Workspace ───────────────────────────────────────────────────────────

export interface AgentOutput {
  agentName:       string;
  traceId:         string;
  result:          string;
  confidence:      number;
  toolResults:     Array<{ toolName: string; durationMs: number; error?: string; input: unknown; output: unknown }>;
  flagForReview:   boolean;
  durationMs:      number;
  ollamaAvailable: boolean;
}

export type { AgentOutput as AgentOutputType };

export function useAgentSummarize() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/summarize', { caseId }),
  });
}

export function useAgentTimeline() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/timeline', { caseId }),
  });
}

export function useAgentResearch() {
  return useMutation({
    mutationFn: ({ question, caseId }: { question: string; caseId?: number }) =>
      postJSON<AgentOutput>('/api/agents/research', { question, caseId }),
  });
}

export function useAgentContractReview() {
  return useMutation({
    mutationFn: (documentId: number) =>
      postJSON<AgentOutput>('/api/agents/contract-review', { documentId }),
  });
}

export function useAgentDiscovery() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/discovery', { caseId }),
  });
}

// ── Mail Reply Generator ──────────────────────────────────────────────────────

export function useGenerateMailReply() {
  return useMutation({
    mutationFn: (payload: {
      caseId:    number;
      tone:      'formal' | 'assertive' | 'conciliatory';
      emailBody: string;
      emailId?:  string;
    }) => postJSON<{ draftBody: string }>('/api/mail/generate-reply', payload),
  });
}

// ── Agent SSE streaming hook ──────────────────────────────────────────────
export interface AgentStreamProgress {
  stage:   string;
  pct:     number;
  message: string;
}

export interface AgentStreamState {
  progress:    AgentStreamProgress | null;
  result:      AgentOutput | null;
  error:       string | null;
  isStreaming: boolean;
}

export function useAgentStream(): {
  state: AgentStreamState;
  start: (agentType: string, params: Record<string, string | number>) => void;
  reset: () => void;
} {
  const [state, setState] = useState<AgentStreamState>({
    progress: null, result: null, error: null, isStreaming: false,
  });

  const esRef = useRef<EventSource | null>(null);

  const start = useCallback((agentType: string, params: Record<string, string | number>) => {
    esRef.current?.close();
    setState({ progress: null, result: null, error: null, isStreaming: true });

    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const es = new EventSource(`/api/agents/${agentType}/stream?${qs}`);
    esRef.current = es;

    es.addEventListener('progress', (e) => {
      setState(prev => ({ ...prev, progress: JSON.parse((e as MessageEvent).data) as AgentStreamProgress }));
    });
    es.addEventListener('result', (e) => {
      setState(prev => ({ ...prev, result: JSON.parse((e as MessageEvent).data) as AgentOutput, isStreaming: false }));
      es.close();
    });
    es.addEventListener('error', (e) => {
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as { message: string }).message
        : 'חיבור נכשל';
      setState(prev => ({ ...prev, error: msg, isStreaming: false }));
      es.close();
    });
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    setState({ progress: null, result: null, error: null, isStreaming: false });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  return { state, start, reset };
}

// ─────────────────────────────────────────────
//  Notifications (§4.1.3 — in-app alert inbox)
// ─────────────────────────────────────────────

export interface NotificationItem {
  id:        number;
  kind:      string;
  severity:  'info' | 'warning' | 'critical';
  titleHe:   string;
  bodyHe:    string | null;
  linkType:  string | null;
  linkId:    string | null;
  readAt:    string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items:  NotificationItem[];
  unread: number;
}

// ─────────────────────────────────────────────
//  Calendar & Docketing (§4.1.1)
// ─────────────────────────────────────────────

export interface CalendarEvent {
  id:         string;
  kind:       'hearing' | 'statute_deadline' | 'task' | 'document';
  date:       string;
  time:       string | null;
  title:      string;
  caseId:     number | null;
  caseNumber: string | null;
  courtName:  string | null;
  judge:      string | null;
  linkType:   'case' | 'document' | 'route';
  linkId:     string;
}

export function useCaseTimeline(caseId: number | null) {
  return useQuery({
    queryKey: ['cases', caseId, 'timeline'],
    queryFn:  () => fetchJSON<CalendarEvent[]>(`/api/cases/${caseId}/timeline`),
    enabled:  caseId !== null && caseId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Citation Intelligence (M4) ──────────────────────────────────────────────────
export interface CitationLocation { documentId: number | null; snippet: string | null; }
export interface CitationGroup {
  key:               string;
  citation:          string;
  citationType:      string | null;
  status:            string;
  resolvedCaseLawId: number | null;
  frequency:         number;
  firmUsage:         number;
  locations:         CitationLocation[];
}

export function useCaseCitations(caseId: number | null) {
  return useQuery({
    queryKey: ['cases', caseId, 'citations'],
    queryFn:  () => fetchJSON<CitationGroup[]>(`/api/cases/${caseId}/citations`),
    enabled:  caseId !== null && caseId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Entity-Centric Navigation (M6) ──────────────────────────────────────────────
export type EntityType = 'judges' | 'courts';

export interface EntitySummary {
  canonical:     string;
  displayName:   string;
  hearingCount:  number;
  documentCount: number;
  caseCount:     number;
}
export interface EntityReferenceItem {
  name:       string;
  kind:       'hearing' | 'document';
  caseId:     number | null;
  caseNumber: string | null;
  refId:      number;
  date:       string | null;
  title:      string | null;
}
export interface EntityDetailData extends EntitySummary {
  references: EntityReferenceItem[];
}

export function useEntities(type: EntityType) {
  return useQuery({
    queryKey: ['entities', type],
    queryFn:  () => fetchJSON<EntitySummary[]>(`/api/entities/${type}`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useEntityDetail(type: EntityType, name: string | null) {
  return useQuery({
    queryKey: ['entities', type, name],
    queryFn:  () => fetchJSON<EntityDetailData>(`/api/entities/${type}/${encodeURIComponent(name ?? '')}`),
    enabled:  Boolean(name),
    staleTime: 60_000,
    retry: false,
  });
}

// ── Smart Collections (M7) ──────────────────────────────────────────────────────
export interface SmartCollectionMeta { key: string; label: string; count: number; }
export interface SmartCollectionItem {
  id: number; filename: string; processingState: string | null;
  documentType: string | null; caseId: number | null; createdAt: string | null;
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn:  () => fetchJSON<SmartCollectionMeta[]>('/api/collections'),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useCollectionItems(key: string | null) {
  return useQuery({
    queryKey: ['collections', key],
    queryFn:  () => fetchJSON<SmartCollectionItem[]>(`/api/collections/${key}`),
    enabled:  Boolean(key),
    staleTime: 30_000,
    retry: false,
  });
}

export interface DeadlineRisk extends CalendarEvent {
  daysUntil: number;
  risk:      'overdue' | 'critical' | 'soon' | 'upcoming';
}

export function useDeadlinesAtRisk(horizon = 90) {
  return useQuery({
    queryKey: ['calendar', 'deadlines', horizon],
    queryFn:  () => fetchJSON<DeadlineRisk[]>(`/api/calendar/deadlines?horizon=${horizon}`),
    refetchInterval: 60_000,
    retry: false,
  });
}

// ── Per-matter Risk Dashboard (Milestone 1) ────────────────────────────────────
export type RiskBand = 'low' | 'medium' | 'high';

export interface RiskAssessment {
  caseId:              number;
  procedural:          RiskBand;
  evidence:            RiskBand;
  deadline:            RiskBand;
  missingDocuments:    number;
  unverifiedInsights:  number;
  unresolvedCitations: number;
}

export function useCaseRisk(caseId: number | null) {
  return useQuery({
    queryKey: ['cases', caseId, 'risk'],
    queryFn:  () => fetchJSON<RiskAssessment>(`/api/cases/${caseId}/risk`),
    enabled:  caseId !== null && caseId > 0,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', from, to],
    queryFn:  () => fetchJSON<CalendarEvent[]>(`/api/calendar/events?from=${from}&to=${to}`),
    enabled:  Boolean(from && to),
    staleTime: 30_000,
    retry: false,
  });
}

export function useNotifications(limit = 50) {
  return useQuery({
    queryKey: [...QUERY_KEYS.notifications, limit],
    queryFn:  () => fetchJSON<NotificationsResponse>(`/api/notifications?limit=${limit}`),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postJSON(`/api/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON('/api/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}
