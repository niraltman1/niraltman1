import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { GavelIcon, CheckSquareIcon, ShieldWarningIcon, FileTextIcon } from '@phosphor-icons/react';
import { useDeadlinesAtRisk, type DeadlineRisk } from '@/api/hooks.js';

const KIND_ICON = {
  hearing:          GavelIcon,
  statute_deadline: ShieldWarningIcon,
  task:             CheckSquareIcon,
  document:         FileTextIcon,
} as const;

const BANDS: { key: DeadlineRisk['risk']; label: string; color: string }[] = [
  { key: 'overdue',  label: 'באיחור',           color: '#f87171' },
  { key: 'critical', label: 'דחוף · עד 3 ימים',  color: '#fb923c' },
  { key: 'soon',     label: 'קרוב · עד שבועיים', color: '#e7c66b' },
  { key: 'upcoming', label: 'מתקרב',            color: '#7dd3fc' },
];

function whenLabel(days: number): string {
  if (days < 0)  return `באיחור ${-days} ימים`;
  if (days === 0) return 'היום';
  if (days === 1) return 'מחר';
  return `בעוד ${days} ימים`;
}

function hrefFor(e: DeadlineRisk): string {
  return e.linkType === 'case' ? `/cases/${e.linkId}` : e.linkId;
}

export function DeadlineMonitorPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useDeadlinesAtRisk(90);

  const grouped = useMemo(() => {
    const map = new Map<DeadlineRisk['risk'], DeadlineRisk[]>();
    for (const e of data ?? []) {
      if (!map.has(e.risk)) map.set(e.risk, []);
      map.get(e.risk)!.push(e);
    }
    return map;
  }, [data]);

  const overdueCount = grouped.get('overdue')?.length ?? 0;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-serif font-bold text-parchment">ראדאר מועדים · סיכון</h1>
        <span className="text-xs text-parchment/40">
          {overdueCount > 0 ? `⚠ ${overdueCount} פריטים באיחור` : '90 הימים הקרובים'}
        </span>
      </div>

      {isLoading ? (
        <div className="text-parchment/30 text-sm py-10 text-center">טוען…</div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl py-12 text-center">
          <CheckSquareIcon size={32} className="text-parchment/20 mx-auto mb-2" />
          <p className="text-parchment/50 text-sm">אין מועדים בסיכון — הכול תחת שליטה.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {BANDS.map(({ key, label, color }) => {
            const items = grouped.get(key) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={key} className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
                <header className="flex items-center gap-2 px-4 py-2 border-b border-parchment/10">
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: color, boxShadow: `0 0 6px ${color}` }} />
                  <span className="text-sm font-semibold" style={{ color }}>{label}</span>
                  <span className="text-parchment/30 text-xs mr-auto">{items.length}</span>
                </header>
                <ul className="divide-y divide-parchment/5">
                  {items.map((e) => {
                    const Icon = KIND_ICON[e.kind];
                    return (
                      <li key={e.id}>
                        <button onClick={() => navigate(hrefFor(e))} className="w-full text-right flex items-center gap-3 px-4 py-2.5 hover:bg-parchment/5">
                          <Icon size={15} style={{ color }} className="shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-parchment truncate">{e.title}</span>
                            {e.caseNumber && <span className="block text-[10px] text-parchment/40 font-mono">{e.caseNumber}</span>}
                          </span>
                          <span className="text-xs shrink-0" style={{ color }}>{whenLabel(e.daysUntil)}</span>
                          <span className="text-[10px] text-parchment/35 font-mono w-20 text-left shrink-0">{e.date}{e.time ? ` ${e.time}` : ''}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
