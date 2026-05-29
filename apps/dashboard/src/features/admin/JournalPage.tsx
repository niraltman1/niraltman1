import { useState, useCallback } from 'react';
import { CircleNotchIcon, ArrowsClockwiseIcon, CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface JournalEvent {
  id:          number;
  executionId: string;
  caseId:      number | null;
  userId:      number | null;
  eventType:   string;
  payloadJson: string | null;
  createdAt:   string;
}

interface JournalResponse {
  events: JournalEvent[];
  count:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Event type badge colours
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_COLOURS: Record<string, string> = {
  execution_started:    '#4A9EFF',
  execution_completed:  '#4CAF50',
  execution_failed:     '#FF4444',
  stale_detected:       '#FFC107',
  concurrency_blocked:  '#FF9800',
  authorization_failed: '#D32F2F',
  retrieval_fallback:   '#9E9E9E',
};

function EventBadge({ type }: { type: string }) {
  const colour = EVENT_COLOURS[type] ?? '#9E9E9E';
  return (
    <span
      style={{ background: `${colour}22`, color: colour, border: `1px solid ${colour}44` }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium whitespace-nowrap"
    >
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Payload accordion row
// ─────────────────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: JournalEvent }) {
  const [expanded, setExpanded] = useState(false);

  let pretty: string | null = null;
  if (event.payloadJson) {
    try {
      pretty = JSON.stringify(JSON.parse(event.payloadJson), null, 2);
    } catch {
      pretty = event.payloadJson;
    }
  }

  return (
    <>
      <tr
        className="border-b border-parchment/5 hover:bg-parchment/5 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-2 text-xs text-parchment/40 font-mono whitespace-nowrap">
          {new Date(event.createdAt).toLocaleString('he-IL')}
        </td>
        <td className="px-3 py-2">
          <EventBadge type={event.eventType} />
        </td>
        <td className="px-3 py-2 text-xs text-parchment/70 font-mono">
          {event.caseId ?? '—'}
        </td>
        <td className="px-3 py-2 text-xs text-parchment/70 font-mono">
          {event.userId ?? '—'}
        </td>
        <td className="px-3 py-2 text-xs text-parchment/40 font-mono truncate max-w-[120px]" dir="ltr">
          {event.executionId ? event.executionId.slice(0, 12) + '…' : '—'}
        </td>
        <td className="px-3 py-2 text-xs text-parchment/40">
          {pretty
            ? (expanded
                ? <CaretDownIcon size={12} className="text-parchment/50" />
                : <CaretRightIcon size={12} className="text-parchment/30" />)
            : '—'}
        </td>
      </tr>
      {expanded && pretty && (
        <tr className="bg-black/40 border-b border-parchment/5">
          <td colSpan={6} className="px-4 py-3">
            <pre
              dir="ltr"
              className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-5 max-h-48 overflow-y-auto"
            >
              {pretty}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Filter bar
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  '',
  'execution_started',
  'execution_completed',
  'execution_failed',
  'stale_detected',
  'concurrency_blocked',
  'authorization_failed',
  'retrieval_fallback',
];

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────

export function JournalPage() {
  const [caseId,    setCaseId]    = useState('');
  const [eventType, setEventType] = useState('');
  const [limit,     setLimit]     = useState('50');
  const [loading,   setLoading]   = useState(false);
  const [data,      setData]      = useState<JournalResponse | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (caseId.trim())    params.set('caseId',    caseId.trim());
      if (eventType.trim()) params.set('eventType', eventType.trim());
      if (limit.trim())     params.set('limit',     limit.trim());

      const res  = await fetch(`/api/admin/journal?${params.toString()}`);
      const body = await res.json() as { success: boolean; data: JournalResponse; error?: { message: string } };
      if (!body.success) throw new Error(body.error?.message ?? 'שגיאה לא ידועה');
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [caseId, eventType, limit]);

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">יומן ביצוע סוכנים</h1>
        <p className="text-parchment/50 text-sm mt-1">
          רישומי ביצוע, שגיאות הרשאה ואירועי מניעת ריצה מקבילה
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/40">סוג אירוע</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                       text-parchment text-xs outline-none focus:border-gold/40 min-w-[180px]"
            dir="ltr"
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t || '— כל הסוגים —'}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/40">מספר תיק</label>
          <input
            type="number"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            placeholder="הכל"
            dir="ltr"
            className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                       text-parchment text-xs placeholder:text-parchment/30 outline-none
                       focus:border-gold/40 w-24"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/40">מגבלת שורות</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={1}
            max={500}
            dir="ltr"
            className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                       text-parchment text-xs outline-none focus:border-gold/40 w-20"
          />
        </div>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-4 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs rounded
                     transition-colors disabled:opacity-50 flex items-center gap-1.5
                     border border-gold/30"
        >
          {loading
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <ArrowsClockwiseIcon size={12} />}
          רענן
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded px-4 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-parchment/10">
          <h2 className="text-sm font-semibold text-parchment">אירועים</h2>
          {data && (
            <span className="text-xs text-parchment/40">{data.count} תוצאות</span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-parchment/30 text-sm">
            <CircleNotchIcon size={16} className="animate-spin" />
            טוען…
          </div>
        )}

        {!loading && data && data.events.length === 0 && (
          <div className="text-center py-12 text-parchment/30 text-sm">
            אין אירועים להצגה
          </div>
        )}

        {!loading && data && data.events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-parchment/10">
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">זמן</th>
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">סוג אירוע</th>
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">תיק</th>
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">משתמש</th>
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">מזהה ביצוע</th>
                  <th className="px-3 py-2 text-xs font-medium text-parchment/40">פרטים</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev) => (
                  <EventRow key={ev.id} event={ev} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !data && (
          <div className="text-center py-12 text-parchment/30 text-sm">
            לחץ על "רענן" כדי לטעון נתונים
          </div>
        )}
      </div>
    </div>
  );
}
