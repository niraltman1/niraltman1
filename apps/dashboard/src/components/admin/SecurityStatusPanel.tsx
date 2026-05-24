import { LockIcon } from '@phosphor-icons/react';
import { useSecurityStatus } from '@/api/hooks.js';

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse text-parchment/40 text-sm py-4 text-center">{label}</div>
  );
}

const KEY_SOURCE_LABEL: Record<string, string> = {
  env:        'מפתח סביבה',
  passphrase: 'סיסמה',
  dpapi:      'DPAPI',
};

export function SecurityStatusPanel() {
  const { data, isLoading } = useSecurityStatus();

  if (isLoading) return <PanelSkeleton label="טוען מצב הצפנה…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          data?.backupEncrypt
            ? 'bg-green-900/30 text-green-300'
            : 'bg-red-900/30 text-red-300'
        }`}>
          <LockIcon size={10} weight="duotone" />
          {data?.backupEncrypt ? 'הצפנה פעילה' : 'הצפנה מושבתת'}
        </span>
        {data?.keySource && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-navy-200/60 text-parchment/70">
            {KEY_SOURCE_LABEL[data.keySource] ?? data.keySource}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-parchment/40 text-xs mb-0.5">גיבויים מוצפנים</p>
          <p className="text-parchment font-medium">{data?.totalEncrypted ?? 0}</p>
        </div>
        <div>
          <p className="text-parchment/40 text-xs mb-0.5">הצפנה אחרונה</p>
          <p className="text-parchment font-medium text-xs">
            {data?.lastEncryptedAt
              ? new Date(data.lastEncryptedAt).toLocaleString('he-IL')
              : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
