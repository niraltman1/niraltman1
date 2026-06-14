import { CircleNotchIcon, CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react';
import { useEnterpriseCapabilities } from '@/api/hooks.js';

const CAPABILITY_LABELS: Record<string, string> = {
  multiUser:          'ריבוי משתמשים',
  centralizedStorage: 'אחסון מרכזי',
  adminConsole:       'מסוף ניהול',
  enterpriseBackup:   'גיבוי Enterprise',
};

export function EnterpriseCapabilitiesPanel() {
  const { data, isLoading } = useEnterpriseCapabilities();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-parchment/40 text-sm py-4 justify-center">
        <CircleNotchIcon size={14} className="animate-spin" />
        טוען יכולות Enterprise…
      </div>
    );
  }

  const isBeta = data?.firmProfile?.licenseType === 'beta' || !data?.firmProfile;
  const caps = data?.capabilities;

  return (
    <div className="space-y-4">
      {data?.firmProfile && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-parchment/40">רישיון:</span>
          <span className="badge bg-navy-200/60 text-parchment/80">
            {data.firmProfile.licenseType}
          </span>
          {data.firmProfile.firmName && (
            <span className="text-parchment/60">{data.firmProfile.firmName}</span>
          )}
        </div>
      )}

      {isBeta && (
        <div className="flex items-center gap-2 text-parchment/50 text-xs px-3 py-2
                        bg-navy-900/20 rounded border border-parchment/10">
          יכולות Enterprise זמינות ברישיון Standard ומעלה
        </div>
      )}

      <div className="space-y-1">
        {caps && Object.entries(caps).map(([key, cap]) => (
          <div key={key}
               className="flex items-center justify-between px-3 py-2 rounded border
                          border-parchment/5 bg-navy-900/20 text-sm">
            <span className="text-parchment/80">{CAPABILITY_LABELS[key] ?? key}</span>
            <div className="flex items-center gap-1.5">
              {cap.enabled
                ? <CheckCircleIcon size={14} className="text-green-400" />
                : <XCircleIcon     size={14} className="text-parchment/30" />}
              <span className={cap.enabled ? 'text-green-300 text-xs' : 'text-parchment/40 text-xs'}>
                {cap.enabled ? 'פעיל' : 'מושבת'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
