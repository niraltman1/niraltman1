import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRightIcon, CaretLeftIcon, GavelIcon, WarningCircleIcon, CheckSquareIcon, FileTextIcon, PhoneIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { useCalendarEvents, type CalendarEvent } from '@/api/hooks.js';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const KIND_STYLE: Record<CalendarEvent['kind'], { bg: string; fg: string; Icon: typeof GavelIcon; label: string }> = {
  hearing:          { bg: 'rgba(56,189,248,0.16)',  fg: '#7dd3fc', Icon: GavelIcon,        label: 'דיון' },
  statute_deadline: { bg: 'rgba(248,113,113,0.16)', fg: '#fca5a5', Icon: WarningCircleIcon, label: 'התיישנות' },
  task:             { bg: 'rgba(212,175,55,0.16)',  fg: '#e7c66b', Icon: CheckSquareIcon,   label: 'משימה' },
  document:         { bg: 'rgba(163,163,163,0.16)', fg: '#a3a3a3', Icon: FileTextIcon,      label: 'מסמך' },
  call:             { bg: 'rgba(110,231,183,0.16)', fg: '#6ee7b7', Icon: PhoneIcon,        label: 'שיחה' },
  evidence:         { bg: 'rgba(52,211,153,0.16)',  fg: '#34d399', Icon: LockSimpleIcon,   label: 'ראיה' },
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hrefFor(e: CalendarEvent): string {
  if (e.linkType === 'case') return `/cases/${e.linkId}`;
  return e.linkId;
}

export function CalendarPage() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<'month' | 'agenda'>('month');

  // 6-week grid covering the visible month (starts on Sunday).
  const gridStart = useMemo(() => {
    const d = new Date(cursor);
    d.setDate(1 - d.getDay());
    return d;
  }, [cursor]);
  const gridDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    }),
    [gridStart],
  );

  const { data: events } = useCalendarEvents(ymd(gridStart), ymd(gridDays[41]!));
  const todayUpcomingTo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);
  const { data: upcomingRaw } = useCalendarEvents(ymd(today), ymd(todayUpcomingTo));

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const upcoming = useMemo(
    () => (upcomingRaw ?? []).filter((e) => e.kind !== 'task').slice(0, 8),
    [upcomingRaw],
  );

  const todayStr = ymd(today);
  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const shiftMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-serif font-bold text-parchment">יומן · דוקטינג</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-parchment/15">
            {(['month', 'agenda'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs transition-colors ${view === v ? 'bg-gold/20 text-gold' : 'text-parchment/50 hover:text-parchment'}`}
              >
                {v === 'month' ? 'חודש' : 'אג׳נדה'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 text-parchment/50 hover:text-parchment" aria-label="חודש קודם">
              <CaretRightIcon size={16} />
            </button>
            <span className="text-sm text-parchment min-w-[110px] text-center">{monthLabel}</span>
            <button onClick={() => shiftMonth(1)} className="p-1.5 text-parchment/50 hover:text-parchment" aria-label="חודש הבא">
              <CaretLeftIcon size={16} />
            </button>
          </div>
          <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))} className="px-2.5 py-1.5 text-xs text-parchment/60 border border-parchment/15 rounded-lg hover:bg-parchment/5">
            היום
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        {/* Main view */}
        <div>
          {view === 'month' ? (
            <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
              <div className="grid grid-cols-7">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold text-parchment/40 border-b border-parchment/10">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {gridDays.map((d) => {
                  const key = ymd(d);
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const dayEvents = byDay.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      className="min-h-[92px] p-1.5 border-b border-l border-parchment/5 flex flex-col gap-1"
                      style={{ opacity: inMonth ? 1 : 0.4 }}
                    >
                      <div
                        className="text-[11px] self-start px-1 rounded"
                        style={key === todayStr
                          ? { background: 'var(--brand-gold, #d4af37)', color: '#0b0b0d', fontWeight: 700 }
                          : { color: 'var(--fg-3)' }}
                      >
                        {d.getDate()}
                      </div>
                      {dayEvents.slice(0, 3).map((e) => {
                        const s = KIND_STYLE[e.kind];
                        return (
                          <button
                            key={e.id}
                            onClick={() => navigate(hrefFor(e))}
                            title={`${s.label}: ${e.title}${e.time ? ` · ${e.time}` : ''}`}
                            className="flex items-center gap-1 px-1 py-0.5 rounded text-right truncate"
                            style={{ background: s.bg, color: s.fg, fontSize: 10 }}
                          >
                            <s.Icon size={10} className="shrink-0" />
                            <span className="truncate">{e.title}</span>
                          </button>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-parchment/40 px-1">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <AgendaList events={events ?? []} onOpen={(e) => navigate(hrefFor(e))} />
          )}
        </div>

        {/* Upcoming deadlines rail */}
        <aside className="bg-navy-100 border border-parchment/10 rounded-xl p-3 h-fit">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-parchment/40 mb-2">
            מועדים קרובים (30 יום)
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-parchment/35 text-xs py-3 text-center">אין מועדים קרובים</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map((e) => {
                const s = KIND_STYLE[e.kind];
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => navigate(hrefFor(e))}
                      className="w-full text-right flex items-start gap-2 p-1.5 rounded-lg hover:bg-parchment/5"
                    >
                      <s.Icon size={13} style={{ color: s.fg }} className="mt-0.5 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs text-parchment truncate">{e.title}</span>
                        <span className="block text-[10px] text-parchment/40 font-mono">{e.date}{e.time ? ` · ${e.time}` : ''}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function AgendaList({ events, onOpen }: { events: CalendarEvent[]; onOpen: (e: CalendarEvent) => void }) {
  if (events.length === 0) {
    return <div className="bg-navy-100 border border-parchment/10 rounded-xl py-10 text-center text-parchment/35 text-sm">אין אירועים בחודש זה</div>;
  }
  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl divide-y divide-parchment/5">
      {events.map((e) => {
        const s = KIND_STYLE[e.kind];
        return (
          <button key={e.id} onClick={() => onOpen(e)} className="w-full text-right flex items-center gap-3 px-4 py-2.5 hover:bg-parchment/5">
            <span className="font-mono text-xs text-parchment/50 w-24 shrink-0">{e.date}{e.time ? ` ${e.time}` : ''}</span>
            <s.Icon size={14} style={{ color: s.fg }} className="shrink-0" />
            <span className="flex-1 text-sm text-parchment truncate">{e.title}</span>
            {e.caseNumber && <span className="text-[10px] text-parchment/40 font-mono shrink-0">{e.caseNumber}</span>}
          </button>
        );
      })}
    </div>
  );
}
