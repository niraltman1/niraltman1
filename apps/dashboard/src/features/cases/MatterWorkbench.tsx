import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRightIcon, GavelIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useCase, useCaseTimeline, useDeadlinesAtRisk } from '@/api/hooks.js';
import { CaseTimeline } from './CaseTimeline.js';
import { CaseRiskPanel } from './CaseRiskPanel.js';
import { CaseCitations } from './CaseCitations.js';
import { WorkbenchDocViewer } from './WorkbenchDocViewer.js';
import { WorkbenchInsights } from './WorkbenchInsights.js';

/** Full Legal Workbench (Task E): 3-pane matter cockpit — Timeline | Viewer | Insights. */
export function MatterWorkbench() {
  const { id } = useParams<{ id: string }>();
  const caseId = Number(id);
  const { data: caseData } = useCase(caseId);
  const { data: timeline } = useCaseTimeline(caseId > 0 ? caseId : null);
  const { data: deadlines } = useDeadlinesAtRisk(120);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  // Default the viewer to the most recent dated document on the matter.
  useEffect(() => {
    if (selectedDocId != null || !timeline) return;
    const docs = timeline.filter((e) => e.kind === 'document');
    if (docs.length > 0) setSelectedDocId(Number(docs[docs.length - 1]!.linkId));
  }, [timeline, selectedDocId]);

  const c = (caseData ?? {}) as Record<string, unknown>;
  const titleHe    = String(c['titleHe']    ?? c['title_he']    ?? '—');
  const caseNumber = String(c['caseNumber'] ?? c['case_number'] ?? '');

  const today = new Date().toISOString().slice(0, 10);
  const nextHearing = useMemo(
    () => (timeline ?? []).filter((e) => e.kind === 'hearing' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [timeline, today],
  );
  const caseDeadlines = useMemo(() => (deadlines ?? []).filter((d) => d.caseId === caseId), [deadlines, caseId]);

  return (
    <div className="space-y-3" dir="rtl">
      {/* Matter overview */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/cases/${caseId}`} className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment shrink-0">
            <ArrowRightIcon size={12} /> לתיק
          </Link>
          <h1 className="text-lg font-serif font-bold text-parchment truncate">שולחן עבודה · {titleHe}</h1>
          {caseNumber && <span className="text-parchment/40 text-sm font-mono shrink-0">{caseNumber}</span>}
        </div>
        {nextHearing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400">
            <GavelIcon size={13} />
            דיון הבא: {nextHearing.date}{nextHearing.judge ? ` · ${nextHearing.judge}` : ''}
          </span>
        )}
      </div>

      {/* 3-pane cockpit */}
      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_320px] gap-3">
        {/* Left — Timeline + deadlines */}
        <div className="space-y-3 order-2 xl:order-1">
          <div className="bg-navy-100 border border-parchment/10 rounded-xl p-3">
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest mb-2">ציר זמן</h2>
            <div className="max-h-[55vh] overflow-auto">
              <CaseTimeline caseId={caseId} onSelectDocument={setSelectedDocId} />
            </div>
          </div>
          <div className="bg-navy-100 border border-parchment/10 rounded-xl p-3">
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2 mb-2">
              <WarningCircleIcon size={12} className="text-amber-400" /> מועדים
            </h2>
            {caseDeadlines.length === 0 ? (
              <p className="text-parchment/35 text-xs py-1 text-center">אין מועדים קרובים</p>
            ) : (
              <ul className="space-y-1">
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

        {/* Centre — Document viewer */}
        <div className="order-1 xl:order-2">
          <WorkbenchDocViewer docId={selectedDocId} />
        </div>

        {/* Right — Insights + risk + citations */}
        <div className="space-y-3 order-3">
          <WorkbenchInsights docId={selectedDocId} />
          <CaseRiskPanel caseId={caseId} />
          <div>
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest mb-2">אסמכתאות</h2>
            <CaseCitations caseId={caseId} />
          </div>
        </div>
      </div>
    </div>
  );
}
