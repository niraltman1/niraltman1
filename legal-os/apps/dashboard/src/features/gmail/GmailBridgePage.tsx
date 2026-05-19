import {
  useGmailStatus,
  useGmailConfigs,
  useGmailAuthUrl,
  useGmailSync,
  useGmailLogs,
} from '@/api/hooks.js';
import type { GmailConfig } from '@/api/hooks.js';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  ArrowsClockwiseIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteJSON } from '@/api/hooks.js';

function SyncButton({ configId }: { configId: number }) {
  const sync = useGmailSync(configId);
  return (
    <button
      onClick={() => sync.mutate()}
      disabled={sync.isPending}
      className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-navy-200 hover:bg-navy-300 text-parchment transition-colors disabled:opacity-50"
    >
      <ArrowsClockwiseIcon size={12} className={sync.isPending ? 'animate-spin' : ''} />
      {sync.isPending ? 'מסנכרן…' : 'סנכרן עכשיו'}
    </button>
  );
}

function DeleteButton({ configId }: { configId: number }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteJSON(`/api/gmail/configs/${configId}`),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['gmail'] }),
  });
  return (
    <button
      onClick={() => del.mutate()}
      disabled={del.isPending}
      className="p-1 rounded hover:bg-red-900/30 text-parchment/40 hover:text-red-300 transition-colors disabled:opacity-50"
      title="מחק חשבון"
    >
      <TrashIcon size={14} />
    </button>
  );
}

function ConfigRow({ config }: { config: GmailConfig }) {
  const [showLogs, setShowLogs] = useState(false);
  const { data: logs } = useGmailLogs(showLogs ? config.id : -1);

  return (
    <div className="border border-parchment/10 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-navy-200/30">
        <EnvelopeIcon size={16} className="text-gold shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-parchment truncate">{config.gmail_address}</p>
          <p className="text-xs text-parchment/50">
            תווית: {config.label_filter}
            {config.last_sync_at && (
              <span className="mr-3">
                סנכרון אחרון: {new Date(config.last_sync_at).toLocaleString('he-IL')}
              </span>
            )}
          </p>
        </div>
        <SyncButton configId={config.id} />
        <button
          onClick={() => setShowLogs((p) => !p)}
          className="text-xs text-parchment/50 hover:text-parchment transition-colors"
        >
          {showLogs ? 'הסתר לוג' : 'הצג לוג'}
        </button>
        <DeleteButton configId={config.id} />
      </div>

      {showLogs && (
        <div className="border-t border-parchment/10 px-4 py-2 space-y-1">
          {!logs || logs.length === 0 ? (
            <p className="text-xs text-parchment/40 py-2">אין רשומות סנכרון</p>
          ) : (
            logs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-1 text-xs text-parchment/70">
                <span className="text-parchment/40 shrink-0">
                  {new Date(log.synced_at).toLocaleString('he-IL')}
                </span>
                <span>{log.messages_found} הודעות</span>
                <span className="text-green-400">{log.attachments_ingested} קבצים נעולים</span>
                {log.errors_count > 0 && (
                  <span className="text-red-400">{log.errors_count} שגיאות</span>
                )}
                {log.error_summary && (
                  <span className="text-red-400/70 truncate">{log.error_summary}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GmailBridgePage() {
  const { data: status, isLoading: statusLoading } = useGmailStatus();
  const { data: configs, isLoading: configsLoading } = useGmailConfigs();
  const { data: authUrlData } = useGmailAuthUrl();

  const isEnabled = status?.enabled ?? false;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6" dir="rtl">
      <div className="flex items-center gap-3">
        <EnvelopeIcon size={28} weight="duotone" className="text-gold" />
        <div>
          <h1 className="text-xl font-bold text-parchment">Gmail Bridge</h1>
          <p className="text-sm text-parchment/50">סנכרון קבצים מצורפים מ-Gmail לארגז הראיות</p>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
        isEnabled
          ? 'border-green-700/40 bg-green-900/20'
          : 'border-parchment/10 bg-navy-200/30'
      }`}>
        {isEnabled ? (
          <CheckCircleIcon size={18} className="text-green-400 shrink-0" />
        ) : (
          <WarningCircleIcon size={18} className="text-parchment/40 shrink-0" />
        )}
        <div>
          {statusLoading ? (
            <p className="text-sm text-parchment/60">טוען מצב…</p>
          ) : isEnabled ? (
            <>
              <p className="text-sm font-medium text-parchment">Gmail Bridge פעיל</p>
              <p className="text-xs text-parchment/50">
                {status?.configCount ?? 0} חשבונות מחוברים
                {status?.lastSync && ` · סנכרון אחרון: ${new Date(status.lastSync).toLocaleString('he-IL')}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-parchment/70">Gmail Bridge מושבת</p>
              <p className="text-xs text-parchment/40">הגדר <code className="text-gold">GMAIL_ENABLED=true</code> כדי להפעיל</p>
            </>
          )}
        </div>
      </div>

      {/* Connect Button */}
      {isEnabled && authUrlData?.url && (
        <div className="flex items-center gap-3">
          <a
            href={authUrlData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-navy-100 font-medium text-sm hover:bg-gold/90 transition-colors"
          >
            <EnvelopeIcon size={16} />
            חבר חשבון Gmail
          </a>
          <span className="text-xs text-parchment/40">
            נדרש אישור Google OAuth — גישת קריאה בלבד
          </span>
        </div>
      )}

      {/* Configs List */}
      {isEnabled && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-parchment/70 uppercase tracking-wide">
            חשבונות מחוברים
          </h2>
          {configsLoading ? (
            <div className="text-parchment/40 text-sm py-4 text-center">טוען…</div>
          ) : !configs || configs.length === 0 ? (
            <div className="text-parchment/40 text-sm py-8 text-center border border-dashed border-parchment/10 rounded-lg">
              אין חשבונות Gmail מחוברים
            </div>
          ) : (
            configs.map((config) => <ConfigRow key={config.id} config={config} />)
          )}
        </div>
      )}
    </div>
  );
}
