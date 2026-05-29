import { useState } from 'react';
import {
  WarningIcon, CheckCircleIcon, ClockIcon,
  CarSimpleIcon, ArrowRightIcon, XCircleIcon,
} from '@phosphor-icons/react';
import {
  useTrafficCase,
  useCreateTrafficCase,
  useTransitionTrafficState,
  useUpdateTrafficMeta,
  type TrafficLifecycleState,
} from '@/api/hooks.js';

const LIFECYCLE_STEPS: { state: TrafficLifecycleState; label: string }[] = [
  { state: 'request_to_stand_trial', label: 'בקשה לעמוד לדין' },
  { state: 'police_ingestion',       label: 'קליטה משטרתית'  },
  { state: 'summons_issued',         label: 'הזמנה להתייצב'  },
  { state: 'closed',                 label: 'תיק סגור'        },
];

const TERMINAL_STATES: TrafficLifecycleState[] = ['closed', 'statute_lapsed'];
const NEXT_STATE: Partial<Record<TrafficLifecycleState, TrafficLifecycleState>> = {
  request_to_stand_trial: 'police_ingestion',
  police_ingestion:       'summons_issued',
  summons_issued:         'closed',
};

function stepIndex(state: TrafficLifecycleState): number {
  if (state === 'statute_lapsed') return 4;
  return LIFECYCLE_STEPS.findIndex((s) => s.state === state);
}

interface Props {
  caseId: number;
}

export function TrafficCasePanel({ caseId }: Props) {
  const { data: tc, isLoading } = useTrafficCase(caseId);
  const createMut     = useCreateTrafficCase();
  const transitionMut = useTransitionTrafficState();
  const updateMeta    = useUpdateTrafficMeta();
  const [showCreate, setShowCreate]   = useState(false);
  const [newDate, setNewDate]         = useState('');
  const [licenseNum, setLicenseNum]   = useState('');
  const [, setIdentityType] = useState<'id_number'|'driving_license'|'passport'>('id_number');

  if (isLoading) {
    return <div className="text-parchment/40 text-xs py-2">טוען מסלול תעבורה…</div>;
  }

  if (!tc) {
    if (showCreate) {
      return (
        <div className="bg-navy/30 border border-parchment/10 rounded p-3 mt-2 space-y-2" dir="rtl">
          <p className="text-xs text-parchment/60">תאריך בקשה ראשונה (אופציונלי)</p>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="bg-navy border border-parchment/20 text-parchment text-xs rounded px-2 py-1 w-full"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                createMut.mutate({
                  caseId,
                  ...(newDate ? { requestDate: newDate } : {}),
                });
                setShowCreate(false);
              }}
              className="bg-gold/20 hover:bg-gold/30 text-gold text-xs px-3 py-1 rounded"
            >
              צור רישום
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-parchment/40 text-xs px-3 py-1 hover:text-parchment/70"
            >
              ביטול
            </button>
          </div>
        </div>
      );
    }
    return (
      <button
        onClick={() => setShowCreate(true)}
        className="flex items-center gap-1.5 text-xs text-parchment/40 hover:text-gold mt-1 transition-colors"
      >
        <CarSimpleIcon size={14} weight="duotone" />
        עקוב אחר מסלול תעבורה
      </button>
    );
  }

  const currentIdx = stepIndex(tc.lifecycleState);
  const isLapsed   = tc.lifecycleState === 'statute_lapsed';
  const isTerminal = TERMINAL_STATES.includes(tc.lifecycleState);
  const nextState  = NEXT_STATE[tc.lifecycleState];

  return (
    <div className="mt-2 space-y-2" dir="rtl">
      {/* Rejection alert */}
      {tc.rejectionDetected && (
        <div className="flex items-start gap-2 bg-red-900/20 border border-red-500/30 rounded p-2 text-xs">
          <WarningIcon size={14} weight="fill" className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-red-300 font-semibold">בקשה נדחתה — </span>
            <span className="text-red-300/80">
              {tc.rejectionKeywords?.join(', ') ?? 'מילות מפתח לדחייה זוהו'}
            </span>
          </div>
        </div>
      )}

      {/* Statute deadline */}
      {tc.lifecycleState === 'police_ingestion' && tc.daysRemaining !== null && (
        <div className={`flex items-center gap-2 rounded px-2 py-1 text-xs border ${
          isLapsed || tc.daysRemaining <= 0
            ? 'bg-red-900/20 border-red-500/30 text-red-300'
            : tc.daysRemaining <= 30
            ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
            : 'bg-navy/30 border-parchment/10 text-parchment/60'
        }`}>
          <ClockIcon size={13} weight="duotone" />
          {tc.daysRemaining <= 0
            ? 'תקופת ההתיישנות פגה'
            : `${tc.daysRemaining} ימים לפקיעת ההתיישנות`}
          {tc.statuteDeadline && (
            <span className="mr-auto text-parchment/30">
              {new Date(tc.statuteDeadline).toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      )}

      {/* Statute lapsed banner */}
      {isLapsed && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded px-2 py-1 text-xs text-red-300">
          <XCircleIcon size={13} weight="fill" />
          תיק פג תוקף — תקופת ההתיישנות חלפה
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
        {LIFECYCLE_STEPS.map((step, idx) => {
          const done    = idx < currentIdx && !isLapsed;
          const active  = idx === currentIdx && !isLapsed;
          const pending = idx > currentIdx || isLapsed;
          return (
            <div key={step.state} className="flex items-center gap-0.5 min-w-0">
              <div className={`flex flex-col items-center gap-0.5 ${pending ? 'opacity-40' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  done   ? 'bg-green-600/30 border-green-500/50' :
                  active ? 'bg-gold/20 border-gold/50' :
                           'bg-navy/40 border-parchment/20'
                }`}>
                  {done
                    ? <CheckCircleIcon size={12} weight="fill" className="text-green-400" />
                    : <span className="text-[10px] font-mono text-parchment/60">{idx + 1}</span>
                  }
                </div>
                <span className={`text-[9px] text-center leading-tight max-w-[64px] ${
                  active ? 'text-gold' : 'text-parchment/50'
                }`}>
                  {step.label}
                </span>
              </div>
              {idx < LIFECYCLE_STEPS.length - 1 && (
                <ArrowRightIcon
                  size={10}
                  className={`text-parchment/20 shrink-0 mb-3 ${pending ? 'opacity-30' : ''}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Advance button */}
      {!isTerminal && nextState && (
        <button
          onClick={() => transitionMut.mutate({ caseId: tc.caseId, state: nextState })}
          disabled={transitionMut.isPending}
          className="text-xs text-parchment/50 hover:text-gold underline underline-offset-2 transition-colors disabled:opacity-40"
        >
          {transitionMut.isPending ? 'מעדכן…' : `קדם ל: ${LIFECYCLE_STEPS.find((s) => s.state === nextState)?.label ?? nextState}`}
        </button>
      )}

      {/* Identity Node — driving license support */}
      <div className="border-t border-parchment/10 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-parchment/40">זיהוי:</span>
          {(['id_number','driving_license','passport'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setIdentityType(t);
                updateMeta.mutate({ caseId, body: { identityNodeType: t } });
              }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                (tc.identityNodeType ?? 'id_number') === t
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-parchment/10 text-parchment/40 hover:text-parchment/70'
              }`}
            >
              {{ id_number: 'תעודת זהות', driving_license: 'רישיון נהיגה', passport: 'דרכון' }[t]}
            </button>
          ))}
        </div>
        {((tc.identityNodeType ?? 'id_number') === 'driving_license') && (
          <div className="flex items-center gap-2 mt-1.5">
            <input
              dir="ltr"
              placeholder="מספר רישיון נהיגה"
              defaultValue={tc.drivingLicenseNumber ?? ''}
              onChange={(e) => setLicenseNum(e.target.value)}
              className="flex-1 bg-navy border border-parchment/15 rounded px-2 py-1
                         text-xs text-parchment placeholder:text-parchment/30 outline-none
                         focus:border-gold/40"
            />
            <button
              onClick={() => updateMeta.mutate({ caseId, body: { drivingLicenseNumber: licenseNum } })}
              disabled={updateMeta.isPending}
              className="text-[10px] px-2 py-1 bg-gold/10 border border-gold/30 text-gold
                         rounded hover:bg-gold/20 disabled:opacity-40 transition-colors"
            >
              שמור
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
