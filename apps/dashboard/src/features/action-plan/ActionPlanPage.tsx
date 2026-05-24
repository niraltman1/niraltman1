import { useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ClipboardTextIcon, CheckIcon, XIcon, SealCheckIcon,
  CircuitryIcon, ArrowsClockwiseIcon, PlayIcon,
} from '@phosphor-icons/react';
import {
  useActionPlan, useApproveActionPlan, useRejectActionPlan,
  useSignActionPlan, useExecuteActionPlan,
} from '@/api/hooks.js';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'PENDING',  label: 'ממתין'    },
  { key: 'APPROVED', label: 'מאושר'   },
  { key: 'REJECTED', label: 'נדחה'    },
  { key: 'EXECUTED', label: 'בוצע'    },
];

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  'תיקיית הורדות': { label: 'הורדות',  cls: 'badge-gold'    },
  'תיקיית מסמכים': { label: 'מסמכים',  cls: 'badge-blue'    },
  'ידני':           { label: 'ידני',    cls: 'badge-neutral' },
};

const BRANDED_ROOT = 'C:\\אלטמן משרד עורכי דין - סדר 2026\\';

function truncatePath(p: string | null): string {
  if (!p) return '—';
  if (p.startsWith(BRANDED_ROOT)) return p.slice(BRANDED_ROOT.length) || p;
  return p;
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-parchment/30 text-xs">—</span>;
  const pct  = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-parchment/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-parchment/50 text-xs">{pct}%</span>
    </div>
  );
}

export function ActionPlanPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg]         = useState<string | null>(null);

  const { data: rows, isLoading, isError, refetch } = useActionPlan(statusFilter);
  const approve  = useApproveActionPlan();
  const reject   = useRejectActionPlan();
  const sign     = useSignActionPlan();
  const execute  = useExecuteActionPlan();

  const entries = (rows ?? []) as Record<string, unknown>[];

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  }

  const toggleSelect = useCallback((planId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e['planId'] as string)));
    }
  }, [selected.size, entries]);

  async function handleApprove(ids: string[]) {
    await approve.mutateAsync(ids);
    setSelected(new Set());
    showToast(`${ids.length} רשומות אושרו`);
  }

  async function handleReject(ids: string[]) {
    await reject.mutateAsync(ids);
    setSelected(new Set());
    showToast(`${ids.length} רשומות נדחו`);
  }

  async function handleSign() {
    const approvedIds = entries
      .filter((e) => e['status'] === 'APPROVED')
      .map((e) => e['planId'] as string);
    if (approvedIds.length === 0) return;
    const result = await sign.mutateAsync(approvedIds);
    showToast(`תוכנית נחתמה — ${result.totalEntries} פעולות מוכנות לביצוע`);
  }

  async function handleExecute() {
    const approvedIds = entries
      .filter((e) => e['status'] === 'APPROVED')
      .map((e) => e['planId'] as string);
    if (approvedIds.length === 0) return;
    const result = await execute.mutateAsync(approvedIds);
    showToast(`בוצעו ${result.executed} פעולות${result.failed > 0 ? ` · ${result.failed} נכשלו` : ''}`);
  }

  const approvedCount = entries.filter((e) => e['status'] === 'APPROVED').length;
  const selectedArr   = Array.from(selected);

  // ─── Virtualizer ────────────────────────────────────────────────────────────
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count:            entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => 48,
    overscan:         10,
  });

  return (
    <div className="flex flex-col h-full space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment flex items-center gap-2">
            <ClipboardTextIcon size={22} weight="duotone" className="text-gold" />
            תוכנית פעולה
          </h1>
          <p className="text-parchment/50 text-sm mt-1">
            אישור ודחיית פעולות לשינוי שמות ומיקום קבצים
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="p-2 rounded text-parchment/40 hover:text-parchment/70 border border-parchment/10 transition-colors"
            title="רענן"
          >
            <ArrowsClockwiseIcon size={16} />
          </button>

          {selected.size > 0 && (
            <>
              <button
                onClick={() => void handleApprove(selectedArr)}
                disabled={approve.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600/80 text-white
                           text-sm hover:bg-green-600 disabled:opacity-40 transition-colors"
              >
                <CheckIcon size={14} weight="bold" />
                אשר ({selected.size})
              </button>
              <button
                onClick={() => void handleReject(selectedArr)}
                disabled={reject.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600/80 text-white
                           text-sm hover:bg-red-600 disabled:opacity-40 transition-colors"
              >
                <XIcon size={14} weight="bold" />
                דחה ({selected.size})
              </button>
            </>
          )}

          <button
            onClick={() => void handleSign()}
            disabled={approvedCount === 0 || sign.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-navy font-semibold text-sm
                       hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <SealCheckIcon size={16} weight="duotone" />
            חתום על תוכנית
            {approvedCount > 0 && <span className="text-navy/70">({approvedCount})</span>}
          </button>

          <button
            onClick={() => void handleExecute()}
            disabled={approvedCount === 0 || execute.isPending}
            title="העבר קבצים מאושרים לנתיב הקבוע"
            className="flex items-center gap-2 px-4 py-2 rounded bg-green-700 text-white font-semibold text-sm
                       hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PlayIcon size={16} weight="duotone" />
            {execute.isPending ? 'מבצע…' : 'בצע פעולות'}
            {approvedCount > 0 && <span className="opacity-70">({approvedCount})</span>}
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-0 border-b border-parchment/10">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setStatusFilter(key); setSelected(new Set()); }}
            className={`px-4 py-2 text-sm border-b-2 transition-colors
              ${statusFilter === key
                ? 'border-gold text-parchment font-medium'
                : 'border-transparent text-parchment/50 hover:text-parchment/80'}`}
          >
            {label}
            {key === statusFilter && entries.length > 0 && (
              <span className="mr-1.5 text-xs text-parchment/30">({entries.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="bg-navy-100 border border-parchment/10 rounded-t-lg overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_6rem_4rem_6rem] gap-3 px-3 py-2.5
                        border-b border-parchment/10 text-parchment/50 text-xs font-medium items-center">
          <input
            type="checkbox"
            checked={entries.length > 0 && selected.size === entries.length}
            onChange={toggleAll}
            className="accent-gold w-3.5 h-3.5"
            aria-label="בחר הכל"
          />
          <span>שם מקורי</span>
          <span>שם מוצע</span>
          <span>נתיב יעד</span>
          <span>מקור</span>
          <span>בינה מל.</span>
          <span>ביטחון</span>
        </div>
      </div>

      {/* Virtualised rows */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-parchment/40 text-sm">טוען…</div>
      )}
      {isError && (
        <div className="flex items-center justify-center py-12 text-red-400 text-sm">שגיאה בטעינת הנתונים</div>
      )}
      {!isLoading && !isError && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
          <ClipboardTextIcon size={40} weight="thin" />
          <span className="text-sm">אין רשומות בסטטוס זה</span>
        </div>
      )}

      {!isLoading && entries.length > 0 && (
        <div
          ref={parentRef}
          className="flex-1 overflow-auto bg-navy-100 border border-t-0 border-parchment/10 rounded-b-lg"
          style={{ height: '60vh' }}
        >
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index]!;
              const planId      = entry['planId'] as string;
              const sourceFolder = entry['sourceFolder'] as string;
              const sourceBadge = SOURCE_BADGES[sourceFolder] ?? { label: sourceFolder, cls: 'badge-neutral' };
              const isSelected  = selected.has(planId);

              return (
                <div
                  key={planId}
                  style={{
                    position: 'absolute',
                    top:      virtualRow.start,
                    left:     0,
                    right:    0,
                    height:   `${virtualRow.size}px`,
                  }}
                  className={`grid grid-cols-[auto_1fr_1fr_1fr_6rem_4rem_6rem] gap-3 px-3 items-center
                    border-b border-parchment/5 text-sm transition-colors
                    ${isSelected ? 'bg-gold/5' : 'hover:bg-parchment/5'}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(planId)}
                    className="accent-gold w-3.5 h-3.5"
                  />

                  {/* Original name */}
                  <span className="text-parchment/80 truncate font-mono text-xs" title={entry['originalName'] as string}>
                    {entry['originalName'] as string}
                  </span>

                  {/* Suggested name */}
                  <span className="text-gold truncate font-mono text-xs" title={(entry['suggestedName'] as string | null) ?? undefined}>
                    {(entry['suggestedName'] as string | null) ?? '—'}
                  </span>

                  {/* Suggested path */}
                  <span
                    className="text-parchment/50 truncate text-xs font-mono"
                    title={(entry['suggestedPath'] as string | null) ?? undefined}
                    dir="ltr"
                  >
                    {truncatePath(entry['suggestedPath'] as string | null)}
                  </span>

                  {/* Source badge */}
                  <span className={`badge ${sourceBadge.cls} truncate text-xs`}>
                    {sourceBadge.label}
                  </span>

                  {/* AI badge */}
                  <span className="flex items-center justify-center">
                    {(entry['aiEnriched'] as boolean) && (
                      <CircuitryIcon size={16} className="text-gold" weight="duotone" />
                    )}
                  </span>

                  {/* Confidence */}
                  <ConfidenceBar value={entry['confidence'] as number | null} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                        bg-navy-100 border border-gold/30 text-parchment text-sm
                        px-5 py-3 rounded-lg shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
