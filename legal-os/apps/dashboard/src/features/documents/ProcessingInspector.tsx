import { useProcessingStatus } from '@/api/hooks.js';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import type { ProcessingState } from '@legal-os/shared';

const STATE_ORDER: ProcessingState[] = [
  'DISCOVERED','HASHED','OCR_PENDING','OCR_COMPLETE',
  'CLASSIFIED','ENRICHED','REVIEW_PENDING','APPLIED','VERIFIED',
];

interface StatusRow {
  from_state:      string;
  to_state:        string;
  agent:           string;
  success:         number;
  error_message:   string | null;
  duration_ms:     number | null;
  transitioned_at: string;
}

function StateStep({ state, done, active }: { state: string; done: boolean; active: boolean }) {
  const base = 'flex-1 h-1.5 rounded-full transition-colors';
  const cls  = done   ? 'bg-gold' :
               active ? 'bg-gold/50 animate-pulse' :
                        'bg-parchment/10';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${base} ${cls}`} />
      <span className={`text-[10px] ${done || active ? 'text-gold/80' : 'text-parchment/30'}`}>
        {state.replace('_', ' ')}
      </span>
    </div>
  );
}

export function ProcessingInspector({ documentId }: { documentId: number }) {
  const { data: history, isLoading } = useProcessingStatus(documentId);

  const lastSuccess = (history as StatusRow[] | undefined)?.filter((r) => r.success).at(-1);
  const currentState = lastSuccess?.to_state as ProcessingState | undefined;
  const currentIdx   = currentState ? STATE_ORDER.indexOf(currentState) : -1;

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold text-parchment">מצב עיבוד – מסמך #{documentId}</h3>

      {/* State progress bar */}
      <div className="flex gap-0.5 overflow-x-auto">
        {STATE_ORDER.map((s, i) => (
          <StateStep
            key={s}
            state={s}
            done={i < currentIdx}
            active={i === currentIdx}
          />
        ))}
      </div>

      {/* Transition history */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center gap-2 text-parchment/40 text-sm">
            <ClockCounterClockwiseIcon size={14} className="animate-spin" />
            טוען היסטוריה…
          </div>
        ) : (history as StatusRow[] | undefined)?.map((row, i) => (
          <div key={i}
               className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded
                           ${row.success ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
            <span className="text-parchment/50 shrink-0">
              {new Date(row.transitioned_at).toLocaleTimeString('he-IL')}
            </span>
            <span className="text-parchment/70">
              {row.from_state} → {row.to_state}
            </span>
            {row.duration_ms && (
              <span className="text-parchment/40">{row.duration_ms}ms</span>
            )}
            {!row.success && row.error_message && (
              <span className="text-red-400 truncate">{row.error_message}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
