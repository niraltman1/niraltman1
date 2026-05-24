import { useQuery } from '@tanstack/react-query';
import { CheckCircleIcon, XCircleIcon, MinusCircleIcon, ArrowsClockwiseIcon, WarningIcon } from '@phosphor-icons/react';

// ── Types ─────────────────────────────────────────────────────────────────────

type PipelineLogStatus =
  | 'processing'
  | 'ocr_success'
  | 'failed_ocr'
  | 'ai_resolved'
  | 'failed_ai'
  | 'excluded'
  | 'duplicate';

interface PipelineLogEntry {
  id:                number;
  fileHash:          string | null;
  fileName:          string;
  status:            PipelineLogStatus;
  errorMessage:      string | null;
  extractedClientId: number | null;
  clientProvisioned: boolean;
  urgencyLevel:      string | null;
  sentiment:         string | null;
  timestamp:         string;
}

interface ScanSummary {
  totalScanned: number;
  successful:   number;
  failed:       number;
  excluded:     number;
  duplicates:   number;
  entries:      PipelineLogEntry[];
  generatedAt:  string;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchScanSummary(minutes: number): Promise<ScanSummary> {
  const res = await fetch(`/api/media/scan-summary?minutes=${minutes}`);
  if (!res.ok) throw new Error(`scan-summary failed: ${res.status}`);
  const json = await res.json() as { data: ScanSummary };
  return json.data;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_META: Record<PipelineLogStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  ocr_success: {
    label:   'OCR הצליח',
    icon:    <CheckCircleIcon weight="fill" size={14} />,
    classes: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  },
  ai_resolved: {
    label:   'לקוח זוהה',
    icon:    <CheckCircleIcon weight="fill" size={14} />,
    classes: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
  },
  failed_ocr: {
    label:   'OCR נכשל',
    icon:    <XCircleIcon weight="fill" size={14} />,
    classes: 'bg-red-900/40 text-red-300 border-red-700/40',
  },
  failed_ai: {
    label:   'זיהוי AI נכשל',
    icon:    <XCircleIcon weight="fill" size={14} />,
    classes: 'bg-red-900/40 text-red-300 border-red-700/40',
  },
  excluded: {
    label:   'הוחרג',
    icon:    <MinusCircleIcon weight="fill" size={14} />,
    classes: 'bg-amber-900/40 text-amber-300 border-amber-700/40',
  },
  duplicate: {
    label:   'כפול',
    icon:    <MinusCircleIcon weight="fill" size={14} />,
    classes: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
  },
  processing: {
    label:   'מעבד…',
    icon:    <ArrowsClockwiseIcon size={14} className="animate-spin" />,
    classes: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  },
};

const URGENCY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-amber-400',
  medium:   'text-parchment/70',
  low:      'text-parchment/40',
};

function StatusBadge({ status }: { status: PipelineLogStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.classes}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  withinMinutes?: number;
}

export function ScanSummaryReport({ withinMinutes = 60 }: Props) {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery<ScanSummary>({
    queryKey:       ['scan-summary', withinMinutes],
    queryFn:        () => fetchScanSummary(withinMinutes),
    refetchInterval: 4_000,
    retry:          false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-parchment/40 gap-2" dir="rtl">
        <ArrowsClockwiseIcon size={18} className="animate-spin" />
        <span className="text-sm">טוען דוח סריקה…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-red-400/70 gap-2" dir="rtl">
        <WarningIcon size={18} weight="fill" />
        <span className="text-sm">שגיאה בטעינת דוח הסריקה</span>
      </div>
    );
  }

  const total      = data.totalScanned;
  const successPct = total > 0 ? Math.round((data.successful / total) * 100) : 0;
  const failedPct  = total > 0 ? Math.round((data.failed     / total) * 100) : 0;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-parchment">דוח סריקת מסמכים</h2>
          <p className="text-parchment/40 text-xs mt-0.5">
            {withinMinutes} דקות אחרונות · עודכן {dataUpdatedAt ? formatTime(new Date(dataUpdatedAt).toISOString()) : '—'}
          </p>
        </div>
        <span className="text-parchment/30 text-xs">{total} קבצים</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-navy-200">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${successPct}%` }}
          />
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${failedPct}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-parchment/50">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            הצליח {data.successful}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            נכשל {data.failed}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            הוחרג {data.excluded}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-500" />
            כפול {data.duplicates}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {data.entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-parchment/30 gap-2">
          <MinusCircleIcon size={32} weight="thin" />
          <span className="text-sm">אין פעילות סריקה בשעה האחרונה</span>
        </div>
      )}

      {/* File list */}
      {data.entries.length > 0 && (
        <div className="rounded-lg border border-parchment/10 overflow-hidden">
          <div className="grid grid-cols-[2fr_auto_auto_1fr] gap-3 px-4 py-2 border-b border-parchment/10 text-parchment/40 text-xs font-medium">
            <span>שם קובץ</span>
            <span>סטטוס</span>
            <span>דחיפות</span>
            <span>הערה</span>
          </div>
          <div className="divide-y divide-parchment/5 max-h-80 overflow-y-auto">
            {data.entries.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[2fr_auto_auto_1fr] gap-3 px-4 py-2.5 items-start hover:bg-parchment/5 transition-colors"
              >
                {/* File name */}
                <div className="min-w-0">
                  <p className="text-parchment text-xs font-medium truncate" title={entry.fileName}>
                    {entry.fileName}
                  </p>
                  <p className="text-parchment/30 text-[10px] mt-0.5">{formatTime(entry.timestamp)}</p>
                </div>

                {/* Status badge */}
                <StatusBadge status={entry.status} />

                {/* Urgency */}
                <span className={`text-xs ${URGENCY_COLOR[entry.urgencyLevel ?? ''] ?? 'text-parchment/30'}`}>
                  {entry.urgencyLevel ?? '—'}
                </span>

                {/* Error / provisioned note */}
                <p className="text-parchment/40 text-[10px] leading-relaxed truncate" title={entry.errorMessage ?? ''}>
                  {entry.clientProvisioned
                    ? `לקוח נוצר אוטומטית (id ${entry.extractedClientId ?? '?'})`
                    : entry.errorMessage ?? (entry.extractedClientId ? `לקוח ${entry.extractedClientId}` : '')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
