import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRightIcon, GavelIcon, PrinterIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useCase, useCaseTimeline, useDeadlinesAtRisk } from '@/api/hooks.js';
import { CaseRiskPanel } from './CaseRiskPanel.js';
import { CaseTimeline } from './CaseTimeline.js';
import { CaseCitations } from './CaseCitations.js';

function whenLabel(date: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return `לפני ${-days} ימים`;
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  return `בעוד ${days} ימים`;
}

export function HearingPrepPage() {
  const { id } = useParams<{ id: string }>();
  const caseId = Number(id);
  const { data: caseData } = useCase(caseId);
  const { data: timeline } = useCaseTimeline(caseId > 0 ? caseId : null);
  const { data: deadlines } = useDeadlinesAtRisk(120);

  const c = (caseData ?? {}) as Record<string, unknown>;
  const titleHe    = String(c['titleHe']    ?? c['title_he']    ?? '—');
  const caseNumber = String(c['caseNumber'] ?? c['case_number'] ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const nextHearing = useMemo(
    () => (timeline ?? [])
      .filter((e) => e.kind === 'hearing' && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [timeline, today],
  );
  const caseDeadlines = useMemo(
    () => (deadlines ?? []).filter((d) => d.caseId === caseId),
    [deadlines, caseId],
  );

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment shrink-0">
            <ArrowRightIcon size={12} />
            לתיק
          </Link>
          <h1 className="text-xl font-serif font-bold text-parchment truncate">הכנה לדיון · {titleHe}</h1>
          {caseNumber && <span className="text-parchment/40 text-sm font-mono shrink-0">{caseNumber}</span>}
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-parchment/60 border border-parchment/15 rounded-lg hover:bg-parchment/5">
          <PrinterIcon size={13} />
          הדפס דף הכנה
        </button>
      </div>

      {/* Next hearing banner */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 flex items-center gap-3" dir="rtl">
        <GavelIcon size={20} className="text-blue-400 shrink-0" />
        {nextHearing ? (
          <div className="flex-1 min-w-0">
            <div className="text-parchment text-sm">{nextHearing.title}{nextHearing.judge ? ` · ${nextHearing.judge}` : ''}{nextHearing.courtName ? ` · ${nextHearing.courtName}` : ''}</div>
            <div className="text-parchment/40 text-xs font-mono">{nextHearing.date}{nextHearing.time ? ` ${nextHearing.time}` : ''} · {whenLabel(nextHearing.date)}</div>
          </div>
        ) : (
          <span className="text-parchment/50 text-sm">אין דיון עתידי מתוזמן לתיק זה</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: risk + deadlines */}
        <div className="space-y-4">
          <CaseRiskPanel caseId={caseId} />
          <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4">
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2 mb-2">
              <WarningCircleIcon size={12} className="text-amber-400" />
              מועדים פתוחים
            </h2>
            {caseDeadlines.length === 0 ? (
              <p className="text-parchment/35 text-xs py-2 text-center">אין מועדים קרובים</p>
            ) : (
              <ul className="space-y-1.5">
                {caseDeadlines.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-parchment truncate">{d.title}</span>
                    <span className="text-parchment/40 font-mono shrink-0">{d.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Center: timeline */}
        <div className="lg:col-span-1">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest mb-2">ציר זמן</h2>
          <CaseTimeline caseId={caseId} />
        </div>

        {/* Right: citations / authorities */}
        <div>
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest mb-2">אסמכתאות</h2>
          <CaseCitations caseId={caseId} />
        </div>
      </div>
    </div>
  );
}
