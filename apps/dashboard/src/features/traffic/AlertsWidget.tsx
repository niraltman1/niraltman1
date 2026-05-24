import { Link } from 'react-router-dom';
import { WarningIcon, ClockIcon, XCircleIcon } from '@phosphor-icons/react';
import { useTrafficAlerts } from '@/api/hooks.js';

export function AlertsWidget() {
  const { data: alerts, isLoading } = useTrafficAlerts(60);

  if (isLoading || !alerts?.length) return null;

  const rejections = alerts.filter((a) => a.rejectionDetected);
  const expiring   = alerts.filter((a) => !a.rejectionDetected && a.daysRemaining !== null && a.daysRemaining <= 60);
  const lapsed     = alerts.filter((a) => a.lifecycleState === 'statute_lapsed');

  if (!rejections.length && !expiring.length && !lapsed.length) return null;

  return (
    <div className="space-y-2" dir="rtl">
      {/* Rejection alerts — highest severity */}
      {rejections.map((a) => (
        <div
          key={a.caseId}
          className="flex items-start gap-3 bg-red-900/20 border border-red-500/30 rounded-lg p-3"
        >
          <WarningIcon size={16} weight="fill" className="text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-red-300 font-semibold text-sm">בקשה נדחתה</span>
              <span className="text-red-300/50 text-xs">·</span>
              <span className="text-red-300/70 text-xs truncate">{a.clientName}</span>
            </div>
            <div className="text-red-300/60 text-xs mt-0.5 truncate">
              {a.caseTitleHe} — {a.caseNumber}
            </div>
            {a.rejectionKeywords?.length ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {a.rejectionKeywords.slice(0, 4).map((kw) => (
                  <span key={kw} className="bg-red-900/30 text-red-300/70 text-[10px] px-1.5 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            to={`/clients`}
            className="text-red-400/70 hover:text-red-300 text-xs shrink-0"
          >
            פתח
          </Link>
        </div>
      ))}

      {/* Lapsed statute */}
      {lapsed.map((a) => (
        <div
          key={a.caseId}
          className="flex items-center gap-3 bg-red-900/15 border border-red-500/20 rounded-lg p-3"
        >
          <XCircleIcon size={16} weight="fill" className="text-red-500/70 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-red-300/80 text-sm font-medium">פג תוקף התיישנות</span>
            <div className="text-red-300/50 text-xs truncate">
              {a.clientName} — {a.caseTitleHe}
            </div>
          </div>
        </div>
      ))}

      {/* Near-deadline warnings */}
      {expiring.map((a) => (
        <div
          key={a.caseId}
          className={`flex items-center gap-3 rounded-lg p-3 border ${
            (a.daysRemaining ?? 999) <= 14
              ? 'bg-amber-900/20 border-amber-500/30'
              : 'bg-amber-900/10 border-amber-500/15'
          }`}
        >
          <ClockIcon
            size={16}
            weight="duotone"
            className={(a.daysRemaining ?? 999) <= 14 ? 'text-amber-400 shrink-0' : 'text-amber-600 shrink-0'}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-amber-300 text-sm font-medium">
                {a.daysRemaining} ימים להתיישנות
              </span>
              <span className="text-amber-300/40 text-xs">·</span>
              <span className="text-amber-300/60 text-xs truncate">{a.clientName}</span>
            </div>
            <div className="text-amber-300/50 text-xs truncate">
              {a.caseTitleHe} — {a.caseNumber}
            </div>
          </div>
          {a.statuteDeadline && (
            <span className="text-amber-500/50 text-xs shrink-0">
              {new Date(a.statuteDeadline).toLocaleDateString('he-IL')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
