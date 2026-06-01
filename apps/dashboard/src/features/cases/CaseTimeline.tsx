import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GavelIcon, ShieldWarningIcon, CheckSquareIcon, FileTextIcon, ClockIcon } from '@phosphor-icons/react';
import { useCaseTimeline, type CalendarEvent } from '@/api/hooks.js';

const KIND_META: Record<CalendarEvent['kind'], { Icon: typeof GavelIcon; color: string; label: string }> = {
  hearing:          { Icon: GavelIcon,         color: '#7dd3fc', label: 'דיון' },
  statute_deadline: { Icon: ShieldWarningIcon, color: '#f87171', label: 'התיישנות' },
  task:             { Icon: CheckSquareIcon,   color: '#e7c66b', label: 'משימה' },
  document:         { Icon: FileTextIcon,      color: '#a3a3a3', label: 'מסמך' },
};

function hrefFor(e: CalendarEvent): string {
  if (e.linkType === 'document') return `/documents/${e.linkId}/read`;
  if (e.linkType === 'case')     return `/cases/${e.linkId}`;
  return e.linkId;
}

export function CaseTimeline({ caseId }: { caseId: number }) {
  const navigate = useNavigate();
  const { data: events, isLoading } = useCaseTimeline(caseId);

  const byYear = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      const year = e.date.slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  if (isLoading) {
    return <div className="text-parchment/30 text-sm py-8 text-center">טוען ציר זמן…</div>;
  }
  if ((events?.length ?? 0) === 0) {
    return (
      <div className="bg-navy-100 border border-parchment/10 rounded-xl py-12 text-center">
        <ClockIcon size={32} className="text-parchment/20 mx-auto mb-2" />
        <p className="text-parchment/50 text-sm">אין אירועים מתוארכים לתיק זה.</p>
        <p className="text-parchment/30 text-xs mt-1">דיונים, מועדי התיישנות, משימות ומסמכים מתוארכים יופיעו כאן.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {byYear.map(([year, items]) => (
        <div key={year}>
          <div className="text-gold font-serif text-lg font-bold mb-2">{year}</div>
          <ol className="space-y-2" style={{ borderInlineStart: '2px solid var(--hairline)', paddingInlineStart: 14 }}>
            {items.map((e) => {
              const m = KIND_META[e.kind];
              return (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', insetInlineStart: -21, top: 6,
                      width: 9, height: 9, borderRadius: 5, background: m.color,
                      boxShadow: `0 0 6px ${m.color}`,
                    }}
                  />
                  <button
                    onClick={() => navigate(hrefFor(e))}
                    className="w-full text-right flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-parchment/5 transition-colors"
                  >
                    <m.Icon size={15} style={{ color: m.color }} className="shrink-0" />
                    <span className="font-mono text-xs text-parchment/50 w-24 shrink-0">{e.date}{e.time ? ` ${e.time}` : ''}</span>
                    <span className="flex-1 text-sm text-parchment truncate">{e.title}</span>
                    <span className="text-[10px] shrink-0" style={{ color: m.color }}>{m.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
