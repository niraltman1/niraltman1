import { CarSimpleIcon, WarningIcon, ClockIcon } from '@phosphor-icons/react';
import { useTrafficAlerts } from '@/api/hooks.js';

const STATE_LABELS: Record<string, string> = {
  request_to_stand_trial: 'בקשה לעמוד לדין',
  police_ingestion:       'קליטה משטרתית',
  summons_issued:         'הזמנה להתייצב',
  closed:                 'סגור',
  statute_lapsed:         'פג תוקף',
};

export function TrafficAlertsPage() {
  const { data: alerts, isLoading } = useTrafficAlerts(180);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-2">
        <CarSimpleIcon size={20} weight="duotone" className="text-gold" />
        <div>
          <h1 className="text-lg font-serif font-bold text-parchment">תיקי תעבורה</h1>
          <p className="text-parchment/40 text-xs">מעקב מצב חיים ● דד-ליין ● דחיות</p>
        </div>
      </div>

      {isLoading && (
        <div className="text-parchment/40 text-sm py-8 text-center">טוען…</div>
      )}

      {!isLoading && (!alerts || alerts.length === 0) && (
        <div className="bg-navy-100 border border-parchment/10 rounded-lg p-8 text-center">
          <CarSimpleIcon size={32} weight="duotone" className="text-parchment/20 mx-auto mb-2" />
          <p className="text-parchment/40 text-sm">אין התראות פעילות</p>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => {
            const isRejection = a.rejectionDetected;
            const isLapsed    = a.lifecycleState === 'statute_lapsed';
            const isUrgent    = (a.daysRemaining ?? 999) <= 14;

            return (
              <div
                key={a.caseId}
                className={`bg-navy-100 border rounded-lg p-4 flex items-start gap-3 ${
                  isRejection || isLapsed
                    ? 'border-red-500/30'
                    : isUrgent
                    ? 'border-amber-500/30'
                    : 'border-parchment/10'
                }`}
              >
                {isRejection || isLapsed ? (
                  <WarningIcon size={18} weight="fill" className="text-red-400 mt-0.5 shrink-0" />
                ) : (
                  <ClockIcon size={18} weight="duotone" className={`mt-0.5 shrink-0 ${isUrgent ? 'text-amber-400' : 'text-parchment/40'}`} />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-parchment font-medium text-sm">{a.clientName}</span>
                    <span className="text-parchment/40 text-xs">·</span>
                    <span className="text-parchment/60 text-xs">{a.caseTitleHe}</span>
                    <span className="text-parchment/30 text-xs">{a.caseNumber}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      isLapsed
                        ? 'bg-red-900/20 border-red-500/30 text-red-300'
                        : 'bg-navy/40 border-parchment/15 text-parchment/50'
                    }`}>
                      {STATE_LABELS[a.lifecycleState] ?? a.lifecycleState}
                    </span>

                    {isRejection && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 border border-red-500/30 text-red-300">
                        נדחה
                      </span>
                    )}

                    {a.daysRemaining !== null && !isLapsed && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        a.daysRemaining <= 0
                          ? 'bg-red-900/20 border-red-500/30 text-red-300'
                          : a.daysRemaining <= 30
                          ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                          : 'bg-navy/40 border-parchment/15 text-parchment/50'
                      }`}>
                        {a.daysRemaining <= 0 ? 'פג תוקף' : `${a.daysRemaining} ימים`}
                      </span>
                    )}

                    {a.statuteDeadline && (
                      <span className="text-parchment/30 text-[10px]">
                        {new Date(a.statuteDeadline).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>

                  {a.rejectionKeywords?.length ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {a.rejectionKeywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="bg-red-900/20 text-red-300/60 text-[10px] px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
