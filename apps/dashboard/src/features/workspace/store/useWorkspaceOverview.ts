// Single aggregation hook for DashboardHomePage — all workspace data in one place.
// Uses useQueries for parallel fetching; no page-level waterfall.

import { useQueries } from '@tanstack/react-query';
import type { CalendarEvent, DeadlineRisk, NotificationItem } from '@/api/hooks.js';
import type { EnrichedCaseRow } from '../widgets/common.js';
import { todayISO, COMMS_KINDS } from '../widgets/common.js';

export interface AgentRunRow {
  id:          number;
  agent_name:  string;
  case_id:     number | null;
  confidence:  number;
  flag_review: number | null;
  created_at:  string;
}

export interface CommChannelSummary {
  channel:  string;
  unread:   number;
  urgency:  'normal' | 'high' | 'critical';
  aiTag?:   string;
}

export interface PipelineFailureRow {
  id:         number;
  file_path:  string;
  error:      string | null;
  created_at: string;
}

export interface BrainSessionRow {
  id:         number;
  title:      string | null;
  case_id:    number | null;
  created_at: string;
}

export interface LegalDraftRow {
  id:          number;
  title:       string | null;
  draft_type:  string | null;
  case_id:     number | null;
  created_at:  string;
}

export interface WorkspaceOverview {
  agenda:         CalendarEvent[];
  atRisk:         DeadlineRisk[];
  cases:          EnrichedCaseRow[];
  commsNotifs:    NotificationItem[];
  channelSummary: CommChannelSummary[];
  watcherEvents:  Record<string, unknown>[];
  ocrFailures:    PipelineFailureRow[];
  agentRuns:      AgentRunRow[];
  brainSessions:  BrainSessionRow[];
  drafts:         LegalDraftRow[];
  notifications:  NotificationItem[];
  loading:        boolean;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'API error');
  return body.data;
}

export function useWorkspaceOverview(): WorkspaceOverview {
  const today   = todayISO();
  const weekEnd = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const results = useQueries({
    queries: [
      // 0 — calendar events for today + next 7 days
      {
        queryKey:  ['workspace', 'agenda', today, weekEnd] as const,
        queryFn:   () => fetchJSON<CalendarEvent[]>(`/api/calendar/events?from=${today}&to=${weekEnd}`),
        staleTime: 60_000,
        retry:     false,
      },
      // 1 — deadlines at risk (30-day horizon for workspace)
      {
        queryKey:  ['workspace', 'deadlines'] as const,
        queryFn:   () => fetchJSON<DeadlineRisk[]>('/api/calendar/deadlines?horizon=30'),
        staleTime: 60_000,
        retry:     false,
      },
      // 2 — active cases (first page, status=active)
      {
        queryKey:  ['workspace', 'cases'] as const,
        queryFn:   () => fetchJSON<{ items: EnrichedCaseRow[]; total: number }>(
          '/api/cases?page=1&pageSize=20&status=active',
        ),
        staleTime: 60_000,
        retry:     false,
      },
      // 3 — unread notifications (comms + general)
      {
        queryKey:       ['workspace', 'notifications'] as const,
        queryFn:        () => fetchJSON<{ items: NotificationItem[]; unread: number }>('/api/notifications?limit=20'),
        refetchInterval: 60_000,
        retry:           false,
      },
      // 4 — comms inbox summary by channel
      {
        queryKey:       ['workspace', 'comms-summary'] as const,
        queryFn:        () => fetchJSON<{ summary: CommChannelSummary[] }>('/api/communications/inbox/summary'),
        refetchInterval: 60_000,
        retry:           false,
      },
      // 5 — recently ingested files (watcher events)
      {
        queryKey:  ['workspace', 'watcher'] as const,
        queryFn:   () => fetchJSON<Record<string, unknown>[]>('/api/admin/watcher'),
        staleTime: 30_000,
        retry:     false,
      },
      // 6 — pipeline OCR/AI failures
      {
        queryKey:  ['workspace', 'pipeline-failures'] as const,
        queryFn:   () => fetchJSON<{ failures: PipelineFailureRow[] }>('/api/pipeline/failures?limit=10'),
        staleTime: 30_000,
        retry:     false,
      },
      // 7 — recent agent runs (all cases)
      {
        queryKey:  ['workspace', 'agent-runs'] as const,
        queryFn:   () => fetchJSON<{ runs: AgentRunRow[] }>('/api/agents/runs?limit=5'),
        staleTime: 30_000,
        retry:     false,
      },
      // 8 — recent legal brain sessions
      {
        queryKey:  ['workspace', 'brain-sessions'] as const,
        queryFn:   () => fetchJSON<BrainSessionRow[]>('/api/legal-brain/sessions?limit=3'),
        staleTime: 30_000,
        retry:     false,
      },
      // 9 — recent legal drafts
      {
        queryKey:  ['workspace', 'drafts'] as const,
        queryFn:   () => fetchJSON<LegalDraftRow[]>('/api/drafts?limit=5'),
        staleTime: 30_000,
        retry:     false,
      },
    ],
  });

  const loading = results.some((r) => r.isLoading);

  const [agendaQ, atRiskQ, casesQ, notifsQ, commsQ, watcherQ, failuresQ, runsQ, sessionsQ, draftsQ] = results;

  const allNotifs = (notifsQ.data as { items: NotificationItem[] } | undefined)?.items ?? [];
  const commsNotifs = allNotifs.filter((n) => COMMS_KINDS.has(n.kind));

  return {
    agenda:         (agendaQ.data  as CalendarEvent[]      | undefined) ?? [],
    atRisk:         (atRiskQ.data  as DeadlineRisk[]        | undefined) ?? [],
    cases:          ((casesQ.data  as { items: EnrichedCaseRow[] } | undefined)?.items ?? []),
    commsNotifs,
    channelSummary: ((commsQ.data  as { summary: CommChannelSummary[] } | undefined)?.summary ?? []),
    watcherEvents:  (watcherQ.data as Record<string, unknown>[] | undefined) ?? [],
    ocrFailures:    ((failuresQ.data as { failures: PipelineFailureRow[] } | undefined)?.failures ?? []),
    agentRuns:      ((runsQ.data   as { runs: AgentRunRow[] }          | undefined)?.runs ?? []),
    brainSessions:  (sessionsQ.data as BrainSessionRow[]   | undefined) ?? [],
    drafts:         (draftsQ.data  as LegalDraftRow[]       | undefined) ?? [],
    notifications:  allNotifs,
    loading,
  };
}
