import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldWarningIcon, ScalesIcon, ArrowCounterClockwiseIcon,
  CalendarIcon, FileTextIcon,
} from '@phosphor-icons/react';
import {
  useCaseRisk, useCaseTimeline, useDraftCitations, useDraftVersions,
  useRestoreDraftVersion,
  type DraftRecord, type DraftVersionRecord,
} from '@/api/hooks.js';

interface Props {
  draft: DraftRecord;
}

const RISK_COLOR: Record<string, string> = {
  low:    '#4ade80',
  medium: '#e7c66b',
  high:   '#f87171',
};

function RiskBandDot({ band }: { band: string }) {
  return <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: RISK_COLOR[band] ?? '#a3a3a3' }} />;
}

function VersionRow({
  v,
  onRestore,
}: {
  v: DraftVersionRecord;
  onRestore: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-parchment/30 font-mono shrink-0">v{v.version_number}</span>
        <span className="text-parchment/50 truncate">
          {v.change_reason === 'autosave' ? 'שמירה אוטומטית'
           : v.change_reason === 'manual' ? 'שמירה ידנית'
           : v.change_reason === 'ai_fill' ? 'מילוי AI'
           : v.change_reason === 'restore' ? 'שחזור'
           : v.change_reason ?? '—'}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-parchment/25 text-[10px]">
          {new Date(v.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          onClick={() => onRestore(v.version_number)}
          className="text-[10px] text-gold hover:underline"
        >
          שחזר
        </button>
      </div>
    </div>
  );
}

export function DraftContextPanel({ draft }: Props) {
  const navigate   = useNavigate();
  const caseId     = draft.matter_id;

  const { data: risk }      = useCaseRisk(caseId);
  const { data: timeline }  = useCaseTimeline(caseId);
  const { data: citations } = useDraftCitations(draft.id);
  const { data: versions }  = useDraftVersions(draft.id);
  const restore             = useRestoreDraftVersion();

  const [showAllVersions, setShowAllVersions] = useState(false);

  const nextHearing = timeline
    ?.filter((e) => e.kind === 'hearing' && new Date(e.date) >= new Date())
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const recentVersions = (versions ?? [])
    .slice()
    .sort((a, b) => b.version_number - a.version_number)
    .slice(0, showAllVersions ? 20 : 5);

  const handleRestore = (versionNumber: number) => {
    restore.mutate({ draftId: draft.id, versionNumber }, {
      onSuccess: () => {
        // page reloads via query invalidation
      },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-4 p-4" dir="rtl">

      {/* Case Intelligence — only when matter-linked */}
      {caseId && (
        <section className="space-y-2">
          <p className="text-parchment/30 text-[10px] uppercase tracking-widest">מודיעין התיק</p>

          {risk && (
            <div className="bg-navy-100 border border-parchment/10 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <ShieldWarningIcon size={12} className="text-amber-400" />
                <span className="text-parchment/50 text-[11px] font-semibold">סיכון</span>
              </div>
              <div className="space-y-1">
                {([
                  ['פרוצדורלי', risk.procedural],
                  ['ראיות',     risk.evidence],
                  ['מועדים',    risk.deadline],
                ] as [string, string][]).map(([label, band]) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <RiskBandDot band={band} />
                    <span className="text-parchment/50">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1 border-t border-parchment/10">
                <div className="text-center">
                  <div className="text-parchment text-sm font-semibold">{risk.unresolvedCitations}</div>
                  <div className="text-parchment/30 text-[9px]">אסמכתאות פתוחות</div>
                </div>
                <div className="text-center">
                  <div className="text-parchment text-sm font-semibold">{risk.missingDocuments}</div>
                  <div className="text-parchment/30 text-[9px]">ראיות חסרות</div>
                </div>
              </div>
            </div>
          )}

          {nextHearing && (
            <div
              className="bg-navy-100 border border-parchment/10 rounded-lg p-3 flex items-center gap-2 cursor-pointer hover:border-parchment/20"
              onClick={() => navigate(`/cases/${caseId}`)}
            >
              <CalendarIcon size={14} className="text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-parchment text-xs truncate">{nextHearing.title}</p>
                <p className="text-parchment/40 text-[10px]">
                  {new Date(nextHearing.date).toLocaleDateString('he-IL')}
                  {nextHearing.courtName && ` · ${nextHearing.courtName}`}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Citations used in draft */}
      {(citations?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <p className="text-parchment/30 text-[10px] uppercase tracking-widest">אסמכתאות בטיוטה</p>
          <div className="space-y-1">
            {citations!.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-navy-100 border border-parchment/10 rounded px-2 py-1.5">
                <ScalesIcon size={10} className="text-gold shrink-0" />
                <span className="text-parchment/70 text-xs font-mono truncate">{c.citation_ref}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Version history */}
      {(versions?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-parchment/30 text-[10px] uppercase tracking-widest">גרסאות</p>
            {(versions?.length ?? 0) > 5 && (
              <button
                onClick={() => setShowAllVersions((v) => !v)}
                className="text-parchment/30 text-[10px] hover:text-parchment"
              >
                {showAllVersions ? 'פחות' : `הכל (${versions?.length})`}
              </button>
            )}
          </div>
          <div className="bg-navy-100 border border-parchment/10 rounded-lg px-3 py-1 divide-y divide-parchment/5">
            {recentVersions.map((v) => (
              <VersionRow
                key={v.id}
                v={v}
                onRestore={handleRestore}
              />
            ))}
          </div>
          {restore.isPending && (
            <p className="text-parchment/40 text-xs text-center">משחזר...</p>
          )}
        </section>
      )}

      {/* Draft metadata */}
      <section className="space-y-1 mt-auto pt-2 border-t border-parchment/10">
        <div className="flex items-center gap-2 text-[10px] text-parchment/30">
          <FileTextIcon size={10} />
          <span>נוצר: {new Date(draft.created_at).toLocaleDateString('he-IL')}</span>
        </div>
        {draft.parent_draft_id && (
          <div className="flex items-center gap-2 text-[10px] text-parchment/30">
            <ArrowCounterClockwiseIcon size={10} />
            <span>מפוצל מגרסה #{draft.parent_draft_id}</span>
          </div>
        )}
      </section>
    </div>
  );
}
