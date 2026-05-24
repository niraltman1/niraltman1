import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PulseIcon, FileTextIcon, RobotIcon, CheckCircleIcon,
  WarningCircleIcon, ArrowsClockwiseIcon, DownloadSimpleIcon,
  GavelIcon, ClockIcon, CircleNotchIcon,
} from '@phosphor-icons/react';
import { useActivityFeed } from '@/api/hooks.js';
import type { ActivityEventRow } from '@/api/hooks.js';

const KIND_META: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  ocr_completed:          { label: 'OCR הושלם',         icon: <CheckCircleIcon size={14} />,        cls: 'text-green-400' },
  ocr_failed:             { label: 'OCR נכשל',           icon: <WarningCircleIcon size={14} />,      cls: 'text-red-400' },
  entities_extracted:     { label: 'ישויות חולצו',       icon: <RobotIcon size={14} />,              cls: 'text-blue-400' },
  deadline_detected:      { label: 'מועד הרתרה',         icon: <ClockIcon size={14} />,              cls: 'text-gold' },
  precedent_matched:      { label: 'תקדים זוהה',         icon: <GavelIcon size={14} />,              cls: 'text-cyan-400' },
  ai_summary_generated:   { label: 'סיכום AI נוצר',      icon: <RobotIcon size={14} />,              cls: 'text-blue-400' },
  verification_completed: { label: 'אימות הושלם',         icon: <CheckCircleIcon size={14} />,        cls: 'text-green-400' },
  export_completed:       { label: 'ייצוא הושלם',         icon: <DownloadSimpleIcon size={14} />,     cls: 'text-parchment/60' },
  sync_completed:         { label: 'סנכרון הושלם',        icon: <ArrowsClockwiseIcon size={14} />,    cls: 'text-parchment/60' },
  document_ingested:      { label: 'מסמך נקלט',           icon: <FileTextIcon size={14} />,           cls: 'text-parchment/60' },
  queue_failure:          { label: 'כשל תור',             icon: <WarningCircleIcon size={14} />,      cls: 'text-red-400' },
  queue_retry:            { label: 'ניסיון חוזר בתור',    icon: <ArrowsClockwiseIcon size={14} />,    cls: 'text-gold' },
  watcher_event:          { label: 'אירוע מעקב',          icon: <PulseIcon size={14} />,              cls: 'text-parchment/40' },
};

const ALL_KINDS = Object.keys(KIND_META);

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function ActivityRow({ row }: { row: ActivityEventRow }) {
  const meta = KIND_META[row.kind] ?? { label: row.kind, icon: <PulseIcon size={14} />, cls: 'text-parchment/40' };
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-parchment/5 hover:bg-parchment/5 transition-colors" dir="rtl">
      <span className={`mt-0.5 shrink-0 ${meta.cls}`}>{meta.icon}</span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-parchment font-medium">{meta.label}</span>
          {row.confidence != null && (
            <span className="badge badge-neutral text-[10px]">{Math.round(row.confidence * 100)}%</span>
          )}
          {row.source && (
            <span className="badge badge-neutral text-[10px]">{row.source}</span>
          )}
        </div>
        {row.message && (
          <p className="text-xs text-parchment/50 truncate">{row.message}</p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-parchment/30 font-mono">
          <span>{formatTime(row.emittedAt)}</span>
          {row.caseId != null && (
            <Link to={`/cases/${row.caseId}`} className="text-gold hover:underline">
              תיק #{row.caseId}
            </Link>
          )}
          {row.documentId != null && (
            <Link to={`/documents/${row.documentId}`} className="text-blue-400/70 hover:underline">
              מסמך #{row.documentId}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityFeedPage() {
  const [kindFilter, setKindFilter] = useState<string>('');
  const { data: events = [], isLoading, isError } = useActivityFeed({
    limit: 100,
    ...(kindFilter ? { kind: kindFilter } : {}),
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PulseIcon size={20} className="text-cyan-400" weight="duotone" />
          <h1 className="text-parchment font-semibold text-lg">פעילות מערכת</h1>
        </div>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="text-xs bg-navy-100 border border-parchment/20 rounded-lg px-3 py-1.5 text-parchment"
        >
          <option value="">כל הסוגים</option>
          {ALL_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_META[k]?.label ?? k}</option>
          ))}
        </select>
      </div>

      <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-parchment/30 text-sm">
            <CircleNotchIcon size={16} className="animate-spin" />
            טוען אירועים...
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center gap-2 py-16 text-red-400/60 text-sm">
            <WarningCircleIcon size={16} />
            שגיאה בטעינת נתונים
          </div>
        )}
        {!isLoading && !isError && events.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <PulseIcon size={32} className="text-parchment/20" />
            <p className="text-parchment/30 text-sm">אין אירועים עדיין</p>
          </div>
        )}
        {events.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}
