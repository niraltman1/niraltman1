import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, getStoredToken, clearStoredToken } from './client.js';
import type { ApiResponse } from './client.js';

function authHeaders(): Record<string, string> {
  const t = getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function guard401(res: Response): void {
  if (res.status === 401) {
    clearStoredToken();
    window.location.replace('/login');
    throw new ApiClientError('UNAUTHORIZED', 'Session expired');
  }
}

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
  documentAnnotations: (docId: number) => ['documents', docId, 'annotations'] as const,
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
  const res = await fetch(path, { headers: authHeaders() });
  guard401(res);
  const body: ApiResponse<T> = await res.json();
  if (!body.success) throw new ApiClientError(body.error.code, body.error.message);
  return body.data;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body ?? {}),
  });
  guard401(res);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

async function patchJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body ?? {}),
  });
  guard401(res);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

async function putJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body ?? {}),
  });
  guard401(res);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

export async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', headers: authHeaders() });
  guard401(res);
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
//  Document annotations — notes / bookmarks / redlines / highlights
// ─────────────────────────────────────────────

export interface Annotation {
  id:             number;
  documentId:     number;
  pageNumber:     number;
  annotationType: 'highlight' | 'note' | 'redline' | 'bookmark';
  color:          string | null;
  content:        string | null;
  createdAt:      string;
}

export interface AnnotationCreate {
  annotationType: Annotation['annotationType'];
  pageNumber?:    number;
  content?:       string;
  color?:         string;
}

// ─── Document Versions ──────────────────────────────────────────────────────

export interface DocumentVersionRecord {
  id:          number;
  documentId:  number;
  version:     number;
  storagePath: string;
  fileHash:    string;
  filename:    string;
  createdBy:   string | null;
  changeNote:  string | null;
  createdAt:   string;
}

export function useDocumentVersions(docId: number | null) {
  return useQuery({
    queryKey: ['document-versions', docId],
    queryFn:  () => fetchJSON<{ versions: DocumentVersionRecord[] }>(`/api/documents/${docId}/versions`),
    enabled:  docId !== null && docId > 0,
    staleTime: 60_000,
  });
}

export interface InsightListItem {
  id:                 number;
  document_id:        number;
  filename:           string;
  case_number:        string | null;
  court_name:         string | null;
  judge_name:         string | null;
  offense_type:       string | null;
  next_hearing:       string | null;
  confidence:         number | null;
  verification_state: string;
  extracted_at:       string;
}

export function useAllInsights(state = 'unverified') {
  return useQuery({
    queryKey: ['insights', 'all', state],
    queryFn:  () => fetchJSON<{ insights: InsightListItem[] }>(`/api/documents/insights?state=${encodeURIComponent(state)}`),
    staleTime: 30_000,
  });
}

export function useDocumentAnnotations(docId: number) {
  return useQuery({
    queryKey: QUERY_KEYS.documentAnnotations(docId),
    queryFn:  () => fetchJSON<Annotation[]>(`/api/annotations?documentId=${docId}`),
    enabled:  docId > 0,
  });
}

export function useCreateAnnotation(docId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnnotationCreate) =>
      postJSON<Annotation>('/api/annotations', { documentId: docId, ...input }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.documentAnnotations(docId) }),
  });
}

export function useUpdateAnnotation(docId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: number; content?: string; color?: string }) =>
      patchJSON<Annotation>(`/api/annotations/${id}`, fields),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.documentAnnotations(docId) }),
  });
}

export function useDeleteAnnotation(docId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJSON<{ ok: boolean }>(`/api/annotations/${id}`),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: QUERY_KEYS.documentAnnotations(docId) }),
  });
}

// ─────────────────────────────────────────────
//  Rules_Engine — Israeli procedural rules registry (§4.7.1)
// ─────────────────────────────────────────────

export interface Rule {
  id:              number;
  ruleName:        string;
  procedureType:   string;
  description:     string | null;
  deadlineDays:    number | null;
  deadlineBasis:   string | null;
  sourceReference: string | null;
  sortOrder:       number;
  isActive:        boolean;
  createdAt:       string;
}

export function useRules(procedureType?: string) {
  return useQuery({
    queryKey: ['rules', procedureType ?? 'all'] as const,
    queryFn:  () => fetchJSON<Rule[]>(
      `/api/rules${procedureType ? `?procedureType=${encodeURIComponent(procedureType)}` : ''}`,
    ),
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────
//  Search
// ─────────────────────────────────────────────

/** Canonical search-hit contract returned by `GET /api/search` (see SearchEngine.SearchHit). */
export interface SearchHit {
  entityType: 'document' | 'client' | 'case' | 'legislation' | 'draft' | 'precedent';
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
//  Admin — File ingestion (Vacuum Protocol)
// ─────────────────────────────────────────────

export interface WatcherEventRow {
  id:           number;
  eventType:    string;
  filePath:     string;
  processed:    boolean;
  queued:       boolean;
  duplicate:    boolean;
  errorMessage: string | null;
  occurredAt:   string;
  processedAt:  string | null;
}

export interface IngestionStatus {
  watchFolders: string[];
  stats: { unprocessed: number; processed: number; errors: number; lastProcessedAt: string | null };
  recent: WatcherEventRow[];
}

export function useIngestionStatus() {
  return useQuery({
    queryKey: ['admin', 'ingestion', 'status'] as const,
    queryFn:  () => fetchJSON<IngestionStatus>('/api/admin/ingestion/status'),
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useSetWatchFolders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folders: string[]) => putJSON<string[]>('/api/admin/ingestion/folders', { folders }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['admin', 'ingestion'] }),
  });
}

export function useRescanFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folder: string) => postJSON<{ enqueued: number }>('/api/admin/ingestion/rescan', { folder }),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['admin', 'ingestion'] }),
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

// ─────────────────────────────────────────────
//  SDK Plugins
// ─────────────────────────────────────────────

export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn:  () => fetchJSON<{ plugins: string[] }>('/api/plugins'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLoadPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (manifest: unknown) =>
      postJSON<{ loaded: string }>('/api/plugins/load', { manifest }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plugins'] }); },
  });
}

export function useUnloadPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteJSON<{ unloaded: string }>(`/api/plugins/${encodeURIComponent(name)}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plugins'] }); },
  });
}

// ─────────────────────────────────────────────
//  Encrypted Backups
// ─────────────────────────────────────────────

export interface EncryptedBackupManifest {
  backupId:            string;
  createdAt:           string;
  dbPath:              string;
  appVersion:          string;
  algorithm:           string;
  encryptedSizeBytes:  number;
  plaintextSizeBytes:  number;
}

export function useEncryptedBackups() {
  return useQuery({
    queryKey: ['admin', 'encrypted-backups'],
    queryFn:  () => fetchJSON<{ backups: EncryptedBackupManifest[] }>('/api/admin/encrypted-backups'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateEncryptedBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postJSON<{ backupId: string; path: string }>('/api/admin/encrypted-backups'),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin', 'encrypted-backups'] }); },
  });
}

export function useVerifyEncryptedBackup() {
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ valid: boolean }>(`/api/admin/encrypted-backups/${encodeURIComponent(id)}/verify`),
  });
}

export function useRestoreEncryptedBackup() {
  return useMutation({
    mutationFn: (id: string) =>
      postJSON<{ restoredTo: string; hash: boolean }>(`/api/admin/encrypted-backups/${encodeURIComponent(id)}/restore`),
  });
}

// ─────────────────────────────────────────────
//  Enterprise Capabilities
// ─────────────────────────────────────────────

export interface EnterpriseCapabilitiesResponse {
  firmProfile: {
    firmId:      string;
    displayName: string;
    licenseType: 'beta' | 'standard' | 'enterprise';
    maxUsers:    number;
  } | null;
  capabilities: {
    multiUser:          { enabled: boolean };
    centralizedStorage: { enabled: boolean };
    adminConsole:       { enabled: boolean; url: string | null };
    enterpriseBackup:   { enabled: boolean };
  };
}

export function useEnterpriseCapabilities() {
  return useQuery({
    queryKey: ['enterprise', 'capabilities'],
    queryFn:  () => fetchJSON<EnterpriseCapabilitiesResponse>('/api/enterprise/capabilities'),
    staleTime: 60_000,
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

// ── DOCX Document Generation ──────────────────────────────────────────────────

async function postBlob(path: string, body: unknown): Promise<Blob> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.blob();
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useGeneratePowerOfAttorney() {
  return useMutation({
    mutationFn: (params: { clientId: number; caseId?: number }) =>
      postBlob('/api/docx/power-of-attorney', params),
  });
}

export function useGenerateFeeAgreement() {
  return useMutation({
    mutationFn: (params: {
      clientId:     number;
      caseId?:      number;
      feeAmount?:   string;
      feeCurrency?: string;
      successBonus?: string;
    }) => postBlob('/api/docx/fee-agreement', params),
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

// ── Time Entries (§4.1.5 — billing/time-tracking foundation) ──────────────

export interface TimeEntry {
  id:             number;
  case_id:        number;
  description_he: string;
  entry_date:     string;
  hours:          number;
  rate:           number;
  billable:       0 | 1;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
}

export interface TimeEntrySummary {
  totalHours:    number;
  billableHours: number;
  totalAmount:   number;
}

export function useTimeEntries(caseId: number | null) {
  return useQuery({
    queryKey: ['time-entries', caseId],
    queryFn:  () => fetchJSON<{ entries: TimeEntry[]; summary: TimeEntrySummary }>(
      `/api/time-entries?caseId=${caseId}`,
    ),
    enabled:   caseId !== null,
    staleTime: 30_000,
  });
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => postJSON<TimeEntry>('/api/time-entries', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['time-entries'] }),
  });
}

export function useUpdateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) =>
      patchJSON<TimeEntry>(`/api/time-entries/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['time-entries'] }),
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; caseId: number }) =>
      deleteJSON<{ deleted: boolean }>(`/api/time-entries/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['time-entries'] }),
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

// ── Verdict Corpus (Supreme Court + all Israeli courts) ──────────────────

export interface VerdictStats {
  verdicts: number;
  embedded: number;
  courts:   number;
}

export interface VerdictRow {
  id:            number;
  docKey:        string;
  caseNumber:    string | null;
  caseName:      string | null;
  court:         string | null;
  verdictType:   string | null;
  verdictDate:   string | null;
  year:          number | null;
  judges:        string[];
  parties:       string[];
  lawyers:       string[];
  verbatimText:  string;
  charCount:     number;
  sourceDataset: string;
  snapshotLabel: string;
  sourceLicense: string | null;
}

export interface VerdictSearchHit {
  id:          number;
  docKey:      string;
  caseNumber:  string | null;
  caseName:    string | null;
  court:       string | null;
  verdictType: string | null;
  verdictDate: string | null;
  year:        number | null;
  snippet:     string;
}

export interface VerdictCorpusResponse {
  stats:    VerdictStats;
  verdicts: VerdictRow[];
}

export function useVerdictCorpus(opts?: { court?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (opts?.court) qs.set('court', opts.court);
  if (opts?.limit) qs.set('limit', String(opts.limit));
  return useQuery({
    queryKey: ['verdict-corpus', opts ?? {}],
    queryFn:  () => fetchJSON<VerdictCorpusResponse>(`/api/verdict-corpus/verdicts?${qs}`),
    staleTime: 60_000,
  });
}

export function useVerdictSearch(query: string, opts?: { court?: string }) {
  const qs = new URLSearchParams({ q: query });
  if (opts?.court) qs.set('court', opts.court);
  return useQuery({
    queryKey: ['verdict-search', query, opts ?? {}],
    queryFn:  () => fetchJSON<VerdictSearchHit[]>(`/api/verdict-corpus/search?${qs}`),
    enabled:  query.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useVerdictDetail(docKey: string | null) {
  return useQuery({
    queryKey: ['verdict-detail', docKey],
    queryFn:  () => fetchJSON<VerdictRow>(
      `/api/verdict-corpus/verdicts/${encodeURIComponent(docKey!)}`,
    ),
    enabled:  docKey !== null && docKey.trim() !== '',
    staleTime: 300_000,
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

export function useAgentInsolvency() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/insolvency-summary', { caseId }),
  });
}

export function useAgentDeadlineAnalysis() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/deadline-analysis', { caseId }),
  });
}

export function useAgentHearingPrep() {
  return useMutation({
    mutationFn: ({ caseId, hearingId }: { caseId: number; hearingId: number }) =>
      postJSON<AgentOutput>('/api/agents/hearing-prep', { caseId, hearingId }),
  });
}

export interface CaseIntakeInput {
  clientName:     string;
  idNumber?:      string;
  caseType?:      string;
  factsNarrative: string;
  documentIds?:   number[];
  clientId?:      number;
}

export function useAgentCaseIntake() {
  return useMutation({
    mutationFn: (input: CaseIntakeInput) =>
      postJSON<AgentOutput>('/api/agents/case-intake', input),
  });
}

export type MotionType = 'preliminary_injunction' | 'extension_of_time' | 'summary_judgment' | 'dismissal' | 'evidence_exclusion' | 'general';
export type RecipientType = 'client' | 'court' | 'opposing_counsel' | 'authority';

export function useAgentDraftMotion() {
  return useMutation({
    mutationFn: ({ caseId, motionType }: { caseId: number; motionType?: MotionType }) =>
      postJSON<AgentOutput>('/api/agents/draft-motion', { caseId, motionType }),
  });
}

export function useAgentDraftLetter() {
  return useMutation({
    mutationFn: ({ caseId, recipientType }: { caseId: number; recipientType?: RecipientType }) =>
      postJSON<AgentOutput>('/api/agents/draft-letter', { caseId, recipientType }),
  });
}

export function useAgentEvidenceReview() {
  return useMutation({
    mutationFn: (caseId: number) =>
      postJSON<AgentOutput>('/api/agents/evidence-review', { caseId }),
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
  kind:       'hearing' | 'statute_deadline' | 'task' | 'document' | 'call' | 'evidence';
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

// ── Entity Knowledge Graph ───────────────────────────────────────────────────────

export interface EntityGraphNode {
  id:        number;
  kind:      string;
  canonical: string;
  degree:    number;
}

export interface EntityGraphEdge {
  source:   number;
  target:   number;
  relation: string;
}

export interface EntityGraphData {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
}

export function useEntityGraph() {
  return useQuery({
    queryKey: ['entities', 'graph'],
    queryFn:  () => fetchJSON<EntityGraphData>('/api/entities/graph'),
    staleTime: 120_000,
  });
}

// ── Phase 5: Graph Intelligence ──────────────────────────────────────────────────

export interface RelatedJudge    { judge: string; occurrenceCount: number; reasons: string[]; }
export interface RelatedCase     { caseId: number; caseNumber: string | null; occurrenceCount: number; reasons: string[]; }
export interface RelatedDocument { documentId: number; title: string | null; occurrenceCount: number; reasons: string[]; }
export interface GraphInsight    { type: string; label: string; occurrenceCount: number; reasons: string[]; }

interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number; }

export interface RelatedEntitiesData {
  judges:    Paginated<RelatedJudge>;
  cases:     Paginated<RelatedCase>;
  documents: Paginated<RelatedDocument>;
}

export function useRelatedEntities(caseId: number | null, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['entities', 'related', caseId, page, pageSize],
    queryFn:  () => fetchJSON<RelatedEntitiesData>(
      `/api/entities/related?caseId=${caseId}&page=${page}&pageSize=${pageSize}`,
    ),
    enabled:   caseId !== null,
    staleTime: 120_000,
    retry:     false,
  });
}

export function useGraphInsights(limit = 50, page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['entities', 'insights', limit, page, pageSize],
    queryFn:  () => fetchJSON<Paginated<GraphInsight>>(
      `/api/entities/insights?limit=${limit}&page=${page}&pageSize=${pageSize}`,
    ),
    staleTime: 300_000,
    retry:     false,
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

export interface SavedFilter {
  id:         number;
  nameHe:     string;
  filterJson: string;
  createdAt:  string;
}

export function useSavedFilters() {
  return useQuery({
    queryKey: ['collections', 'saved'],
    queryFn:  () => fetchJSON<SavedFilter[]>('/api/collections/saved'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSavedFilterItems(id: number | null) {
  return useQuery({
    queryKey: ['collections', 'saved', id, 'items'],
    queryFn:  () => fetchJSON<SmartCollectionItem[]>(`/api/collections/saved/${id}/items`),
    enabled:  id !== null,
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { nameHe: string; filterJson: string }) =>
      postJSON<SavedFilter>('/api/collections/saved', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collections', 'saved'] }),
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJSON<{ deleted: boolean }>(`/api/collections/saved/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collections', 'saved'] }),
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

// ─────────────────────────────────────────────
//  Communications (omnichannel — C3)
// ─────────────────────────────────────────────

export type CommChannel = 'telegram' | 'whatsapp' | 'email' | 'phone';
export type CommDirection = 'inbound' | 'outbound';
export type ConversationStatus = 'open' | 'closed' | 'triage';

export interface CommConversation {
  id:               number;
  channel:          CommChannel;
  externalThreadId: string | null;
  clientId:         number | null;
  caseId:           number | null;
  assignedUserId:   number | null;
  subject:          string | null;
  status:           ConversationStatus;
  lastMessageAt:    string | null;
  createdAt:        string;
}

export interface CommMessage {
  id:             number;
  conversationId: number;
  channel:        CommChannel;
  direction:      CommDirection;
  body:           string | null;
  mediaKind:      string | null;
  mediaRef:       string | null;
  senderIdentity: string | null;
  handled:        boolean;
  replied:        boolean;
  transcript:     string | null;
  createdAt:      string;
  sentAt:         string | null;
  aiUrgency?:     'urgent' | 'normal' | 'low' | null;
  aiTags?:        string[];
}

export interface UnknownInboxRow {
  id:          number;
  channel:     CommChannel;
  externalId:  string;
  displayName: string | null;
  body:        string | null;
  mediaKind:   string | null;
  resolved:    boolean;
  createdAt:   string;
}

export interface CommSendResult {
  sent:      boolean;
  messageId: number;
  delivery?: { delivered: boolean; error?: string };
}

interface CommFilter { caseId?: number; clientId?: number; status?: ConversationStatus }

function commFilterKey(f: CommFilter): string {
  return `${f.caseId ?? ''}:${f.clientId ?? ''}:${f.status ?? ''}`;
}

export function useCommConversations(filter: CommFilter = {}, enabled = true) {
  const qs = new URLSearchParams();
  if (filter.caseId   !== undefined) qs.set('caseId',   String(filter.caseId));
  if (filter.clientId !== undefined) qs.set('clientId', String(filter.clientId));
  if (filter.status   !== undefined) qs.set('status',   filter.status);
  const query = qs.toString();
  return useQuery({
    queryKey: ['communications', 'conversations', commFilterKey(filter)] as const,
    queryFn:  () => fetchJSON<CommConversation[]>(`/api/communications/conversations${query ? `?${query}` : ''}`),
    enabled,
  });
}

export function useCommConversation(id: number | null) {
  return useQuery({
    queryKey: ['communications', 'conversation', id] as const,
    queryFn:  () => fetchJSON<{ conversation: CommConversation; messages: CommMessage[] }>(
      `/api/communications/conversations/${id}`,
    ),
    enabled: id !== null,
  });
}

export function useCommUnknownInbox(enabled = true) {
  return useQuery({
    queryKey: ['communications', 'unknown'] as const,
    queryFn:  () => fetchJSON<UnknownInboxRow[]>('/api/communications/unknown'),
    enabled,
  });
}

export function useConvertUnknownSender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; nameHe?: string; phone?: string; existingClientId?: number }) =>
      postJSON<{ clientId: number; linked: boolean }>(`/api/communications/unknown/${id}/convert`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'unknown'] });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.clients });
    },
  });
}

export function useSendCommMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      postJSON<CommSendResult>(`/api/communications/conversations/${conversationId}/send`, { body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'conversation', conversationId] });
      void qc.invalidateQueries({ queryKey: ['communications', 'conversations'] });
    },
  });
}

export function useGrantConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { clientId: number; channel: CommChannel; granted: boolean; source?: string }) =>
      postJSON('/api/communications/consent', v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications'] });
    },
  });
}

export interface CommTemplateMatch {
  id:      number;
  nameHe:  string;
  channel: CommChannel | null;
  preview: string;
}

/** Context-matched templates for a case (or generic when caseId is null). */
export function useCommTemplateMatches(caseId: number | null, channel?: CommChannel, enabled = true) {
  const qs = new URLSearchParams();
  if (caseId !== null) qs.set('caseId', String(caseId));
  if (channel) qs.set('channel', channel);
  const query = qs.toString();
  return useQuery({
    queryKey: ['communications', 'templates', caseId ?? 'none', channel ?? 'any'] as const,
    queryFn:  () => fetchJSON<CommTemplateMatch[]>(`/api/communications/templates/match${query ? `?${query}` : ''}`),
    enabled,
  });
}

/** Render a template for a case — mints real secure links server-side. */
export function useRenderCommTemplate() {
  return useMutation({
    mutationFn: (v: { templateId: number; caseId: number | null }) =>
      postJSON<{ rendered: string }>(`/api/communications/templates/${v.templateId}/render`,
        v.caseId !== null ? { caseId: v.caseId } : {}),
  });
}

export interface CommEvidenceRow {
  id:             number;
  messageId:      number;
  caseId:         number | null;
  channel:        CommChannel;
  body:           string | null;
  mediaKind:      string | null;
  contentHash:    string;
  capturedAt:     string;
}

export function useCaseEvidence(caseId: number | null) {
  return useQuery({
    queryKey: ['communications', 'evidence', caseId] as const,
    queryFn:  () => fetchJSON<CommEvidenceRow[]>(`/api/communications/evidence?caseId=${caseId}`),
    enabled:  caseId !== null,
  });
}

/** Snapshot a message as a locked exhibit. */
export function useSaveMessageEvidence(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => postJSON(`/api/communications/messages/${messageId}/save-evidence`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'conversation', conversationId] });
      void qc.invalidateQueries({ queryKey: ['communications', 'evidence'] });
    },
  });
}

/** Transcribe a voice message locally (Whisper). Throws CONFLICT when not configured. */
export function useTranscribeMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => postJSON<{ transcript: string }>(`/api/communications/messages/${messageId}/transcribe`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'conversation', conversationId] });
    },
  });
}

// ── Call documentation (C6) ──────────────────────────────────────────────────
export type CallDirection = 'inbound' | 'outbound';

export interface CallLog {
  id:              number;
  clientId:        number;
  caseId:          number | null;
  isEvidence:      boolean;
  direction:       CallDirection;
  subject:         string | null;
  summary:         string | null;
  occurredAt:      string;
  durationMinutes: number | null;
  participants:    string[];
  tags:            string[];
  createdBy:       number | null;
  createdAt:       string;
}

export interface CallLogCreateInput {
  clientId:         number;
  caseId?:          number | null;
  direction?:       CallDirection;
  subject?:         string;
  summary?:         string;
  occurredAt?:      string;
  durationMinutes?: number;
  participants?:    string[];
  tags?:            string[];
  actionItems?:     Array<{ title: string; dueDate?: string; priority?: string }>;
}

/** List call logs for a client or a case (one of the two must be set). */
export function useCallLogs(scope: { clientId?: number; caseId?: number }, enabled = true) {
  const qs = scope.caseId !== undefined ? `caseId=${scope.caseId}` : `clientId=${scope.clientId}`;
  return useQuery({
    queryKey: ['communications', 'calls', scope.caseId ?? null, scope.clientId ?? null] as const,
    queryFn:  () => fetchJSON<CallLog[]>(`/api/communications/calls?${qs}`),
    enabled:  enabled && (scope.clientId !== undefined || scope.caseId !== undefined),
  });
}

export function useCreateCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CallLogCreateInput) =>
      postJSON<{ call: CallLog; taskIds: number[] }>('/api/communications/calls', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'calls'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; patch: Partial<CallLog> }) =>
      patchJSON<CallLog>(`/api/communications/calls/${v.id}`, v.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['communications', 'calls'] }),
  });
}

/** Promote a call into a case timeline ("save as evidence"). */
export function useSaveCallEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; caseId: number }) =>
      postJSON<CallLog>(`/api/communications/calls/${v.id}/save-evidence`, { caseId: v.caseId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['communications', 'calls'] });
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

/** Dictation: transcribe an audio blob locally (Whisper). Throws CONFLICT when not configured. */
export function useTranscribeAudio() {
  return useMutation({
    mutationFn: (v: { audioBase64: string; mimeType: string }) =>
      postJSON<{ transcript: string }>('/api/communications/transcribe-audio', v),
  });
}

// ── Judgment Library (ספריית פסקי דין) ────────────────────────────────────────

export interface JudgmentLibraryItem {
  id:               number;
  documentId:       number;
  originalFilename: string;
  procedureType:    string | null;
  legalDomain:      string | null;
  legalQuestions:   string[];
  factualSummary:   string | null;
  keywords:         string[];
  ingestedAt:       string;
  chunkCount:       number;
}

function parseJudgmentArr(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as unknown[]).map(String);
  if (typeof raw !== 'string' || !raw) return [];
  try { const v = JSON.parse(raw) as unknown; return Array.isArray(v) ? (v as unknown[]).map(String) : []; }
  catch { return []; }
}

export function useJudgmentLibrary() {
  return useQuery<JudgmentLibraryItem[]>({
    queryKey: ['judgment-library'],
    queryFn:  async () => {
      const data = await fetchJSON<Record<string, unknown>[]>('/api/admin/judgment-library');
      return data.map((r) => ({
        id:               r['id']                as number,
        documentId:       r['document_id']       as number,
        originalFilename: r['original_filename'] as string,
        procedureType:    (r['procedure_type']   as string | null) ?? null,
        legalDomain:      (r['legal_domain']     as string | null) ?? null,
        legalQuestions:   parseJudgmentArr(r['legalQuestions'] ?? r['legal_questions']),
        factualSummary:   (r['factual_summary']  as string | null) ?? null,
        keywords:         parseJudgmentArr(r['keywords']),
        ingestedAt:       r['ingested_at']       as string,
        chunkCount:       (r['chunk_count']      as number) ?? 0,
      }));
    },
    staleTime: 60_000,
    retry: false,
  });
}

// ── Legal Corpus ──────────────────────────────────────────────────────────────

export interface LegalSourceRecord {
  id:            number;
  source_key:    string;
  title_he:      string;
  short_name:    string | null;
  citation:      string | null;
  source_type:   string;
  procedure_domain: string | null;
  source_url:    string | null;
  year:          number | null;
  section_count: number;
  is_active:     number;
}

export interface LegalSectionRecord {
  id:               number;
  source_id:        number;
  section_label:    string;
  heading_he:       string | null;
  verbatim_text_he: string | null;
  order_index:      number;
  parent_label:     string | null;
}

export interface LegalSectionSearchHit {
  id:               number;
  source_key:       string;
  source_title_he:  string;
  section_label:    string;
  heading_he:       string | null;
  verbatim_text_he: string | null;
  rank:             number;
}

export function useLegalSources() {
  return useQuery({
    queryKey: ['legal-corpus', 'sources'],
    queryFn:  () => fetchJSON<{ stats: Record<string, unknown>; sources: LegalSourceRecord[] }>('/api/legal-corpus/sources'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLegalSource(key: string | null) {
  return useQuery({
    queryKey: ['legal-corpus', 'source', key],
    queryFn:  () => fetchJSON<{ source: LegalSourceRecord; sections: LegalSectionRecord[] }>(`/api/legal-corpus/sources/${key}`),
    enabled:  Boolean(key),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLegalCorpusSearch(query: string, sourceKey?: string) {
  const qs = new URLSearchParams({ q: query });
  if (sourceKey) qs.set('source', sourceKey);
  return useQuery({
    queryKey: ['legal-corpus', 'search', query, sourceKey ?? ''],
    queryFn:  () => fetchJSON<LegalSectionSearchHit[]>(`/api/legal-corpus/search?${qs}`),
    enabled:  query.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });
}

// ── Legal Drafts ──────────────────────────────────────────────────────────────

export interface DraftRecord {
  id:             number;
  title:          string;
  content_json:   string | null;
  content_html:   string | null;
  matter_id:      number | null;
  client_id:      number | null;
  document_type:  string;
  status:         string;
  word_count:     number;
  parent_draft_id: number | null;
  fork_reason:    string | null;
  created_by:     string | null;
  is_active:      number;
  created_at:     string;
  updated_at:     string;
}

export interface DraftVersionRecord {
  id:             number;
  draft_id:       number;
  version_number: number;
  content_json:   string;
  content_html:   string | null;
  word_count:     number;
  change_reason:  string | null;
  is_ai_generated: number;
  ai_operation:   string | null;
  created_by:     string | null;
  created_at:     string;
}

export interface DraftCitationRecord {
  id:           number;
  draft_id:     number;
  citation_ref: string;
  entity_type:  string;
  entity_id:    number | null;
  node_id:      string | null;
  inserted_at:  string;
}

export interface EvidenceShelfItemRecord {
  id:          number;
  draft_id:    number;
  shelf_type:  string;
  title:       string;
  content_he:  string | null;
  source_ref:  string | null;
  entity_id:   number | null;
  entity_type: string | null;
  is_inserted: number;
  inserted_at: string | null;
  created_at:  string;
}

export function useDrafts(filters?: { matterId?: number; clientId?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (filters?.matterId) qs.set('matterId', String(filters.matterId));
  if (filters?.clientId) qs.set('clientId', String(filters.clientId));
  if (filters?.status)   qs.set('status',   filters.status);
  const query = qs.toString();
  return useQuery({
    queryKey: ['drafts', 'list', query],
    queryFn:  () => fetchJSON<DraftRecord[]>(`/api/drafts${query ? `?${query}` : ''}`),
    staleTime: 10_000,
    retry: false,
  });
}

export function useDraft(id: number | null) {
  return useQuery({
    queryKey: ['drafts', id],
    queryFn:  () => fetchJSON<DraftRecord>(`/api/drafts/${id}`),
    enabled:  id !== null && id > 0,
    staleTime: 10_000,
    retry: false,
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      matterId?: number;
      clientId?: number;
      documentType?: string;
      contentJson?: string;
      parentDraftId?: number;
      forkReason?: string;
    }) => postJSON<DraftRecord>('/api/drafts', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['drafts'] }),
  });
}

export function useUpdateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; title?: string; contentJson?: string; contentHtml?: string; wordCount?: number; status?: string; changeReason?: string; isAiGenerated?: boolean; aiOperation?: string }) =>
      patchJSON<DraftRecord>(`/api/drafts/${id}`, body),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['drafts', vars.id] });
      void qc.invalidateQueries({ queryKey: ['drafts', 'list'] });
    },
  });
}

export function useForkDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, forkReason }: { id: number; forkReason?: string }) =>
      postJSON<DraftRecord>(`/api/drafts/${id}/fork`, { forkReason }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['drafts'] }),
  });
}

export function useArchiveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJSON<{ archived: boolean }>(`/api/drafts/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['drafts'] }),
  });
}

export function useDraftVersions(draftId: number | null) {
  return useQuery({
    queryKey: ['drafts', draftId, 'versions'],
    queryFn:  () => fetchJSON<DraftVersionRecord[]>(`/api/drafts/${draftId}/versions`),
    enabled:  draftId !== null && draftId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

export function useRestoreDraftVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, versionNumber }: { draftId: number; versionNumber: number }) =>
      postJSON<DraftRecord>(`/api/drafts/${draftId}/restore/${versionNumber}`, {}),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId] });
      void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'versions'] });
    },
  });
}

export function useDraftCitations(draftId: number | null) {
  return useQuery({
    queryKey: ['drafts', draftId, 'citations'],
    queryFn:  () => fetchJSON<DraftCitationRecord[]>(`/api/drafts/${draftId}/citations`),
    enabled:  draftId !== null && draftId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

export function useAddDraftCitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, ...body }: { draftId: number; citationRef: string; entityType?: string; entityId?: number; nodeId?: string }) =>
      postJSON<DraftCitationRecord>(`/api/drafts/${draftId}/citations`, body),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'citations'] }),
  });
}

export function useRemoveDraftCitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ citationId }: { draftId: number; citationId: number }) =>
      deleteJSON<{ deleted: boolean }>(`/api/drafts/citations/${citationId}`),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'citations'] }),
  });
}

export function useDraftShelf(draftId: number | null) {
  return useQuery({
    queryKey: ['drafts', draftId, 'shelf'],
    queryFn:  () => fetchJSON<EvidenceShelfItemRecord[]>(`/api/drafts/${draftId}/shelf`),
    enabled:  draftId !== null && draftId > 0,
    staleTime: 10_000,
    retry: false,
  });
}

export function useAddToShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, ...body }: {
      draftId:     number;
      shelfType:   'case' | 'legislation' | 'precedent' | 'note' | 'ai_output' | 'excerpt' | 'document';
      title:       string;
      contentHe?:  string;
      sourceRef?:  string;
      entityId?:   number;
      entityType?: string;
    }) => postJSON<EvidenceShelfItemRecord>(`/api/drafts/${draftId}/shelf`, body),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'shelf'] }),
  });
}

export function useMarkShelfItemInserted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }: { draftId: number; itemId: number }) =>
      patchJSON<{ inserted: boolean }>(`/api/drafts/shelf/${itemId}/insert`, {}),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'shelf'] }),
  });
}

export function useRemoveFromShelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }: { draftId: number; itemId: number }) =>
      deleteJSON<{ deleted: boolean }>(`/api/drafts/shelf/${itemId}`),
    onSuccess: (_data, vars) => void qc.invalidateQueries({ queryKey: ['drafts', vars.draftId, 'shelf'] }),
  });
}

export function useDraftsUsingCitation(citationRef: string | null) {
  return useQuery({
    queryKey: ['drafts', 'knowledge', 'citation', citationRef],
    queryFn:  () => fetchJSON<{ id: number; title: string; matter_id: number | null; created_at: string }[]>(
      `/api/drafts/knowledge/by-citation?ref=${encodeURIComponent(citationRef ?? '')}`,
    ),
    enabled:  Boolean(citationRef),
    staleTime: 60_000,
    retry: false,
  });
}

export function useDraftsUsingSection(sectionKey: string | null) {
  return useQuery({
    queryKey: ['drafts', 'knowledge', 'section', sectionKey],
    queryFn:  () => fetchJSON<{ id: number; title: string; created_at: string }[]>(
      `/api/drafts/knowledge/by-section?key=${encodeURIComponent(sectionKey ?? '')}`,
    ),
    enabled:  Boolean(sectionKey),
    staleTime: 60_000,
    retry: false,
  });
}

// ── Agent Execution Events (Journal) ─────────────────────────────────────────

export interface AgentExecutionEvent {
  id:          number;
  executionId: string;
  caseId:      number | null;
  userId:      number | null;
  eventType:   string;
  payloadJson: string | null;
  createdAt:   string;
}

export function useAgentEvents(opts: {
  caseId?:    number | null;
  eventType?: string;
  limit?:     number;
} = {}) {
  const { caseId, eventType, limit = 50 } = opts;
  return useQuery({
    queryKey: ['agent-events', caseId, eventType, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (caseId)     params.set('caseId',    String(caseId));
      if (eventType)  params.set('eventType', eventType);
      return fetchJSON<{ events: AgentExecutionEvent[]; count: number }>(
        `/api/admin/journal?${params.toString()}`,
      );
    },
    staleTime: 30_000,
    retry: false,
  });
}

export interface StoredAgentResult {
  id:          number;
  agent_name:  string;
  trace_id:    string;
  case_id:     number | null;
  document_id: number | null;
  result_text: string | null;
  confidence:  number | null;
  flag_review: number;
  tool_log:    string | null;
  duration_ms: number | null;
  created_at:  string;
}

export function useStoredAgentResults(caseId: number | null, limit = 10) {
  return useQuery({
    queryKey: ['agent-results', caseId, limit],
    queryFn:  () => fetchJSON<{ results: StoredAgentResult[] }>(
      `/api/agents/results?caseId=${caseId}&limit=${limit}`,
    ),
    enabled: caseId !== null && caseId > 0,
    staleTime: 60_000,
  });
}

export function useJudgmentFullText(id: number | null) {
  return useQuery<{ originalFilename: string; ocrText: string }>({
    queryKey: ['judgment-full-text', id],
    queryFn:  () => fetchJSON(`/api/admin/judgment-library/${id}/full-text`),
    enabled:  id !== null,
    staleTime: 5 * 60_000,
  });
}

export function useDeleteJudgment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJSON<{ deleted: boolean }>(`/api/admin/judgment-library/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['judgment-library'] }),
  });
}

// ─────────────────────────────────────────────
//  Workspace overview additions
// ─────────────────────────────────────────────

export interface AgentRunItem {
  id:          number;
  agent_name:  string;
  case_id:     number | null;
  confidence:  number;
  flag_review: number | null;
  created_at:  string;
}

export function useAgentRuns(limit = 10) {
  return useQuery({
    queryKey: ['agents', 'runs', limit],
    queryFn:  () => fetchJSON<{ runs: AgentRunItem[] }>(`/api/agents/runs?limit=${limit}`),
    staleTime: 30_000,
    retry: false,
  });
}

export interface CommInboxSummaryItem {
  channel: string;
  unread:  number;
  urgency: 'normal' | 'high' | 'critical';
  aiTag?:  string;
}

export function useCommInboxSummary() {
  return useQuery({
    queryKey:       ['communications', 'inbox-summary'],
    queryFn:        () => fetchJSON<{ summary: CommInboxSummaryItem[] }>('/api/communications/inbox/summary'),
    refetchInterval: 60_000,
    retry: false,
  });
}

export interface PipelineFailureItem {
  id:         number;
  file_path:  string;
  error:      string | null;
  created_at: string;
}

export function usePipelineFailures(limit = 10) {
  return useQuery({
    queryKey: ['pipeline', 'failures', limit],
    queryFn:  () => fetchJSON<{ failures: PipelineFailureItem[] }>(`/api/pipeline/failures?limit=${limit}`),
    staleTime: 30_000,
    retry: false,
  });
}
