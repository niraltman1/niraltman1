import { ClockCounterClockwiseIcon, WarningIcon, CheckCircleIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { useQueueStats, useQueueItems, usePoisonedItems, useRequeueItem } from '@/api/hooks.js';

const STATE_COLORS: Record<string, string> = {
  DISCOVERED:     'bg-parchment/20  text-parchment/80',
  HASHED:         'bg-gold/20       text-gold',
  OCR_PENDING:    'bg-blue-900/40   text-blue-300',
  OCR_COMPLETE:   'bg-blue-700/40   text-blue-200',
  CLASSIFIED:     'bg-purple-900/40 text-purple-300',
  ENRICHED:       'bg-indigo-900/40 text-indigo-300',
  REVIEW_PENDING: 'bg-yellow-900/40 text-yellow-300',
  APPLIED:        'bg-teal-900/40   text-teal-300',
  VERIFIED:       'bg-green-900/40  text-green-300',
  FAILED:         'bg-red-900/40    text-red-300',
  ROLLED_BACK:    'bg-orange-900/40 text-orange-300',
  POISONED:       'bg-red-800/60    text-red-200',
};

function StatePill({ state }: { state: string }) {
  const cls = STATE_COLORS[state] ?? 'bg-parchment/10 text-parchment/60';
  return <span className={`badge ${cls}`}>{state}</span>;
}

function QueueStatsBar() {
  const { data, isLoading, isError } = useQueueStats();

  if (isLoading) return <div className="text-parchment/40 text-sm">טוען נתונים…</div>;
  if (isError)   return <div className="text-red-400 text-sm">שגיאה בטעינת תור</div>;
  if (!data)     return null;

  const states = Object.entries(data.byState).filter(([, v]) => v > 0);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {states.map(([state, count]) => (
        <div key={state} className="bg-navy-100 border border-parchment/10 rounded-md p-2 text-center">
          <div className="text-xl font-bold text-parchment">{count}</div>
          <StatePill state={state} />
        </div>
      ))}
      {data.poisoned > 0 && (
        <div className="bg-red-900/30 border border-red-700/40 rounded-md p-2 text-center">
          <div className="text-xl font-bold text-red-300">{data.poisoned}</div>
          <StatePill state="POISONED" />
        </div>
      )}
    </div>
  );
}

function QueueItemRow({ item }: { item: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-4 py-2.5 border-b border-parchment/5
                    table-row-hover text-sm text-parchment/80">
      <span className="truncate font-mono text-xs">{String(item['original_path'] ?? '—')}</span>
      <StatePill state={String(item['current_state'] ?? '')} />
      <span className="text-parchment/50">{String(item['retry_count'] ?? 0)} ניסיונות</span>
      <span className="text-parchment/40 text-xs text-left">{
        item['updated_at'] ? new Date(String(item['updated_at'])).toLocaleTimeString('he-IL') : '—'
      }</span>
    </div>
  );
}

function PoisonedPanel() {
  const { data }  = usePoisonedItems();
  const requeue   = useRequeueItem();

  if (!data || data.length === 0) return null;

  return (
    <div className="bg-red-900/20 border border-red-700/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-red-700/30 flex items-center gap-2">
        <WarningIcon size={16} className="text-red-400" />
        <span className="text-red-300 text-sm font-semibold">פריטים בתור רעיל ({data.length})</span>
      </div>
      {data.map((item) => (
        <div key={String(item['item_id'])}
             className="flex items-center justify-between px-4 py-2.5 border-b border-red-800/20 text-sm">
          <div className="flex-1 truncate">
            <span className="text-red-300/80 font-mono text-xs">{String(item['original_path'] ?? '')}</span>
            {!!item['poison_reason'] && (
              <div className="text-red-400/60 text-xs mt-0.5 truncate">{String(item['poison_reason'])}</div>
            )}
          </div>
          <button
            onClick={() => requeue.mutate(String(item['item_id']))}
            disabled={requeue.isPending}
            className="mr-2 px-2 py-1 bg-red-800/40 hover:bg-red-700/40 text-red-300
                       rounded text-xs transition-colors disabled:opacity-50 flex items-center gap-1"
            aria-label="שלח מחדש"
          >
            <ArrowCounterClockwiseIcon size={12} />
            שלח מחדש
          </button>
        </div>
      ))}
    </div>
  );
}

export function QueueMonitor() {
  const { data: items, isLoading } = useQueueItems(100);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">מצב תור עיבוד</h1>
          <p className="text-parchment/50 text-sm mt-1">ניטור עיבוד מסמכים בזמן אמת</p>
        </div>
        <div className="flex items-center gap-2 text-parchment/40 text-xs">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          עדכון כל 3 שניות
        </div>
      </div>

      <QueueStatsBar />
      <PoisonedPanel />

      <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-4 py-2
                        border-b border-parchment/10 text-parchment/40 text-xs font-medium">
          <span>נתיב קובץ</span>
          <span>סטטוס</span>
          <span>ניסיונות</span>
          <span className="text-left">עדכון אחרון</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-parchment/40 text-sm">
            <ClockCounterClockwiseIcon size={20} className="animate-spin ml-2" />
            טוען…
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-parchment/30 gap-2">
            <CheckCircleIcon size={32} weight="thin" />
            <span className="text-sm">התור ריק</span>
          </div>
        ) : (
          items.map((item, i) => <QueueItemRow key={i} item={item} />)
        )}
      </div>
    </div>
  );
}
