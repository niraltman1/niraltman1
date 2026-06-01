import { useNavigate } from 'react-router-dom';
import { ShieldWarningIcon } from '@phosphor-icons/react';
import { useCaseRisk, type RiskBand } from '@/api/hooks.js';

const BAND_STYLE: Record<RiskBand, { label: string; color: string; fill: number }> = {
  low:    { label: 'נמוך',  color: '#4ade80', fill: 33 },
  medium: { label: 'בינוני', color: '#e7c66b', fill: 66 },
  high:   { label: 'גבוה',  color: '#f87171', fill: 100 },
};

function RiskBar({ label, band }: { label: string; band: RiskBand }) {
  const s = BAND_STYLE[band];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-parchment/50">{label}</span>
        <span style={{ color: s.color }}>{s.label}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--hairline)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${s.fill}%`, background: s.color }} />
      </div>
    </div>
  );
}

export function CaseRiskPanel({ caseId }: { caseId: number }) {
  const navigate = useNavigate();
  const { data: risk, isLoading } = useCaseRisk(caseId);

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3" dir="rtl">
      <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
        <ShieldWarningIcon size={12} className="text-amber-400" />
        סיכון התיק
      </h2>

      {isLoading || !risk ? (
        <p className="text-parchment/30 text-sm py-2">טוען הערכת סיכון…</p>
      ) : (
        <>
          <div className="space-y-2.5">
            <RiskBar label="פרוצדורלי" band={risk.procedural} />
            <RiskBar label="ראיות"     band={risk.evidence} />
            <RiskBar label="מועדים"    band={risk.deadline} />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-parchment/10 text-center">
            <button
              onClick={() => navigate('/deadlines')}
              className="rounded-lg py-1.5 hover:bg-parchment/5 transition-colors"
              title="ראדאר מועדים"
            >
              <div className="text-parchment text-lg font-semibold">{risk.missingDocuments}</div>
              <div className="text-parchment/40 text-[10px]">ראיות חסרות</div>
            </button>
            <button
              onClick={() => navigate(`/cases/${caseId}`)}
              className="rounded-lg py-1.5 hover:bg-parchment/5 transition-colors"
              title="תובנות לא מאומתות"
            >
              <div className="text-parchment text-lg font-semibold">{risk.unverifiedInsights}</div>
              <div className="text-parchment/40 text-[10px]">תובנות לא מאומתות</div>
            </button>
            <div className="py-1.5">
              <div className="text-parchment text-lg font-semibold">{risk.unresolvedCitations}</div>
              <div className="text-parchment/40 text-[10px]">אסמכתאות פתוחות</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
