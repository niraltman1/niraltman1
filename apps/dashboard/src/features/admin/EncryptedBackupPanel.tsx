import { useState } from 'react';
import {
  CircleNotchIcon, CheckCircleIcon, WarningCircleIcon, LockIcon,
} from '@phosphor-icons/react';
import {
  useEncryptedBackups, useCreateEncryptedBackup,
  useVerifyEncryptedBackup, useRestoreEncryptedBackup,
  type EncryptedBackupManifest,
} from '@/api/hooks.js';

export function EncryptedBackupPanel() {
  const { data, isLoading, error } = useEncryptedBackups();
  const createBackup  = useCreateEncryptedBackup();
  const verifyBackup  = useVerifyEncryptedBackup();
  const restoreBackup = useRestoreEncryptedBackup();
  const [verifyResults, setVerifyResults] = useState<Record<string, boolean | null>>({});

  const keyNotConfigured =
    (error as Error | null)?.message?.includes('503') ||
    (data as { error?: string } | undefined)?.error != null;

  const backups: EncryptedBackupManifest[] = (data as { backups?: EncryptedBackupManifest[] } | undefined)?.backups ?? [];

  return (
    <div className="space-y-4">
      {keyNotConfigured && (
        <div className="flex items-center gap-2 text-yellow-400 text-xs px-3 py-2
                        bg-yellow-900/20 rounded border border-yellow-700/30">
          <WarningCircleIcon size={14} />
          BACKUP_ENCRYPT_KEY לא מוגדר — גיבויים מוצפנים אינם זמינים
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-parchment/60">גיבויים מוצפנים</span>
        <button
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending || keyNotConfigured}
          className="px-3 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs
                     rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {createBackup.isPending
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <LockIcon size={12} weight="duotone" />}
          צור גיבוי מוצפן
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-parchment/40 text-sm py-4 justify-center">
          <CircleNotchIcon size={14} className="animate-spin" />
          טוען גיבויים מוצפנים…
        </div>
      )}

      {!isLoading && backups.length === 0 && (
        <div className="text-parchment/40 text-sm text-center py-6">אין גיבויים מוצפנים</div>
      )}

      {backups.map((b) => (
        <div key={b.backupId}
             className="flex items-center justify-between px-3 py-2
                        bg-navy-900/30 rounded border border-parchment/5 text-xs gap-2">
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <LockIcon size={10} className="text-gold shrink-0" weight="duotone" />
              <span className="font-mono text-parchment/70 truncate">{b.backupId}</span>
            </div>
            <div className="text-parchment/40">
              {new Date(b.createdAt).toLocaleString('he-IL')}
              {b.sizeBytes != null && ` · ${(b.sizeBytes / 1_048_576).toFixed(1)} MB`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {verifyResults[b.backupId] === true  && <CheckCircleIcon size={14} className="text-green-400" />}
            {verifyResults[b.backupId] === false && <WarningCircleIcon size={14} className="text-red-400" />}
            <button
              onClick={() => verifyBackup.mutate(b.backupId, {
                onSuccess: (r) => setVerifyResults((prev) => ({ ...prev, [b.backupId]: r.valid })),
                onError:   ()  => setVerifyResults((prev) => ({ ...prev, [b.backupId]: false })),
              })}
              disabled={verifyBackup.isPending}
              className="px-2 py-1 bg-navy-900/40 hover:bg-navy-900/60 text-parchment/60
                         rounded text-[11px] border border-parchment/10 transition-colors"
            >
              אמת
            </button>
            <button
              onClick={() => restoreBackup.mutate(b.backupId)}
              disabled={restoreBackup.isPending}
              className="px-2 py-1 bg-red-900/20 hover:bg-red-900/30 text-red-400
                         rounded text-[11px] border border-red-700/20 transition-colors"
            >
              שחזר
            </button>
          </div>
        </div>
      ))}

      {createBackup.isSuccess && (
        <div className="flex items-center gap-2 text-green-400 text-xs px-3 py-2
                        bg-green-900/20 rounded border border-green-700/30">
          <CheckCircleIcon size={14} />
          גיבוי מוצפן נוצר: {(createBackup.data as { backupId: string }).backupId}
        </div>
      )}
      {restoreBackup.isSuccess && (
        <div className="flex items-center gap-2 text-green-400 text-xs px-3 py-2
                        bg-green-900/20 rounded border border-green-700/30">
          <CheckCircleIcon size={14} />
          שוחזר ל: {(restoreBackup.data as { restoredTo: string }).restoredTo}
        </div>
      )}
    </div>
  );
}
