import { useState, useRef, useEffect } from 'react';
import {
  useWorkerHealth, useWatcherEvents, useBackupSnapshots,
  useCreateBackup, useRepairManifest, useReplayJob, useCheckIntegrity,
  useUpdateStatus, useTriggerContentUpdate, useSecurityStatus, useAiHealth,
  useStartVacuum, useVacuumStatus,
  useIngestionStatus, useSetWatchFolders, useRescanFolder,
  usePlugins, useEncryptedBackups, useCreateEncryptedBackup, useVerifyEncryptedBackup,
  useRestoreEncryptedBackup, useEnterpriseCapabilities,
  deleteJSON,
} from '@/api/hooks.js';
import type { UpdateLogRecord, VacuumSessionData, EncryptedBackupManifest } from '@/api/hooks.js';
import { LoadingPanel } from '@/components/common/LoadingPanel.js';
import {
  HeartbeatIcon, FolderOpenIcon, DatabaseIcon, WrenchIcon,
  CheckCircleIcon, WarningCircleIcon, CircleNotchIcon,
  ArrowCounterClockwiseIcon, ShieldCheckIcon, ClockCounterClockwiseIcon,
  LockIcon, ArrowsClockwiseIcon, BrainIcon, HardDrivesIcon,
  BugIcon, FirstAidKitIcon, RobotIcon, TrashIcon,
} from '@phosphor-icons/react';
import { HealthStatusPanel } from '@/components/admin/HealthStatusPanel.js';
import { SupportExportButton } from '@/components/admin/SupportExportButton.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Worker health panel
// ─────────────────────────────────────────────────────────────────────────────

type WorkerStatus = 'idle' | 'busy' | 'stopping' | 'dead' | 'starting';

const STATUS_STYLE: Record<WorkerStatus, string> = {
  idle:     'bg-green-900/30  text-green-300',
  busy:     'bg-gold/20       text-gold',
  stopping: 'bg-yellow-900/30 text-yellow-300',
  dead:     'bg-red-900/30    text-red-300',
  starting: 'bg-blue-900/30   text-blue-300',
};

function WorkerHealthPanel() {
  const { data: workers, isLoading } = useWorkerHealth();

  if (isLoading) return <PanelSkeleton label="טוען מצב פועלים…" />;
  if (!workers || workers.length === 0) {
    return (
      <div className="text-parchment/40 text-sm text-center py-8">
        אין פועלים רשומים
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_80px_70px_80px_90px] gap-2 px-3 py-2
                      text-xs font-medium text-parchment/40 border-b border-parchment/10">
        <span>מזהה</span>
        <span>סוג</span>
        <span>מצב</span>
        <span>זיכרון</span>
        <span>משימות</span>
      </div>
      {(workers as Record<string, unknown>[]).map((w) => {
        const status = String(w['status'] ?? 'idle') as WorkerStatus;
        const cls    = STATUS_STYLE[status] ?? STATUS_STYLE.idle;
        return (
          <div key={String(w['worker_id'])}
               className="grid grid-cols-[1fr_80px_70px_80px_90px] gap-2 px-3 py-2
                          text-xs text-parchment/80 border-b border-parchment/5 table-row-hover">
            <span className="font-mono truncate text-parchment/50">
              {String(w['worker_id']).slice(0, 8)}…
            </span>
            <span>{String(w['worker_type'] ?? '—')}</span>
            <span className={`badge ${cls} text-[10px]`}>{status}</span>
            <span>{w['memory_mb'] ? `${Number(w['memory_mb']).toFixed(0)} MB` : '—'}</span>
            <span>
              {String(w['tasks_completed'] ?? 0)} /{' '}
              <span className="text-red-400">{String(w['tasks_failed'] ?? 0)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Watcher events panel
// ─────────────────────────────────────────────────────────────────────────────

function WatcherEventsPanel() {
  const { data: events, isLoading } = useWatcherEvents(30);

  if (isLoading) return <PanelSkeleton label="טוען אירועי מעקב…" />;
  if (!events || (events as unknown[]).length === 0) {
    return (
      <div className="text-parchment/40 text-sm text-center py-8">
        לא זוהו אירועי קבצים
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {(events as Record<string, unknown>[]).map((e) => (
        <div key={String(e['id'])}
             className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-parchment/5">
          <span className="text-parchment/40 shrink-0 font-mono text-[10px]">
            {new Date(String(e['occurred_at'])).toLocaleTimeString('he-IL')}
          </span>
          <span className={`badge text-[10px] ${Number(e['queued']) ? 'badge-success' : Number(e['duplicate']) ? 'badge-warning' : 'bg-parchment/10 text-parchment/50'}`}>
            {Number(e['queued']) ? 'הועבר לתור' : Number(e['duplicate']) ? 'כפול' : 'זוהה'}
          </span>
          <span className="text-parchment/70 font-mono truncate">
            {String(e['file_path'] ?? '').split(/[/\\]/).pop()}
          </span>
          {!!e['error_message'] && (
            <span className="text-red-400 truncate">{String(e['error_message'])}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Backup snapshots panel
// ─────────────────────────────────────────────────────────────────────────────

function BackupSnapshotsPanel() {
  const { data: snapshots, isLoading } = useBackupSnapshots();
  const createBackup = useCreateBackup();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-parchment/60">גיבויים אחרונים</span>
        <button
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending}
          className="px-3 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs
                     rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {createBackup.isPending
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <DatabaseIcon size={12} />}
          צור גיבוי עכשיו
        </button>
      </div>

      {isLoading
        ? <PanelSkeleton label="טוען גיבויים…" />
        : (snapshots as Record<string, unknown>[] | undefined)?.length === 0
          ? <div className="text-parchment/40 text-sm text-center py-6">אין גיבויים</div>
          : (snapshots as Record<string, unknown>[])?.map((s) => (
            <div key={String(s['snapshot_id'])}
                 className="flex items-center justify-between px-3 py-2
                            bg-navy-900/30 rounded border border-parchment/5 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-parchment/70 font-mono text-[10px] truncate max-w-[180px]">
                    {String(s['backup_path']).split(/[/\\]/).pop()}
                  </span>
                  {Boolean(s['is_encrypted']) && (
                    <LockIcon size={10} className="text-gold shrink-0" weight="duotone" />
                  )}
                </div>
                <div className="text-parchment/40">
                  {(Number(s['size_bytes']) / (1024 * 1024)).toFixed(1)} MB ·{' '}
                  {String(s['document_count'])} מסמכים ·{' '}
                  {new Date(String(s['created_at'])).toLocaleDateString('he-IL')}
                </div>
              </div>
              {s['db_integrity'] === 'ok'
                ? <CheckCircleIcon size={16} className="text-green-400 shrink-0" />
                : s['db_integrity'] === 'error'
                  ? <WarningCircleIcon size={16} className="text-red-400 shrink-0" />
                  : <ClockCounterClockwiseIcon size={16} className="text-parchment/30 shrink-0" />}
            </div>
          ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Update status panel
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  success: 'text-green-400',
  failed:  'text-red-400',
  skipped: 'text-parchment/40',
};

function UpdateRow({ rec }: { rec: UpdateLogRecord }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-parchment/5 last:border-0 text-xs">
      <span className={`badge text-[10px] ${rec.channel === 'security' ? 'badge-gold' : 'badge-blue'}`}>
        {rec.channel === 'security' ? 'אבטחה' : 'תוכן'}
      </span>
      <span className={`font-semibold ${STATUS_CLS[rec.status] ?? 'text-parchment/50'}`}>
        {rec.status === 'success' ? 'הצליח' : rec.status === 'failed' ? 'נכשל' : 'דולג'}
      </span>
      {rec.version && <span className="text-parchment/40 font-mono">{rec.version}</span>}
      <span className="text-parchment/30 mr-auto">
        {new Date(rec.applied_at).toLocaleDateString('he-IL')}
      </span>
    </div>
  );
}

function UpdateStatusPanel() {
  const { data, isLoading } = useUpdateStatus();
  const trigger = useTriggerContentUpdate();

  const allLogs = [
    ...((data?.security ?? []) as UpdateLogRecord[]),
    ...((data?.content  ?? []) as UpdateLogRecord[]),
  ].sort((a, b) => b.applied_at.localeCompare(a.applied_at)).slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-parchment/60">עדכוני מערכת</span>
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          className="px-3 py-1.5 bg-blue-400/10 hover:bg-blue-400/20 text-blue-400 text-xs
                     rounded transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-blue-400/20"
        >
          {trigger.isPending
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <ArrowsClockwiseIcon size={12} />}
          עדכן תוכן עכשיו
        </button>
      </div>
      {isLoading
        ? <PanelSkeleton label="טוען עדכונים…" />
        : allLogs.length === 0
          ? <div className="text-parchment/40 text-sm text-center py-6">אין רישומי עדכון</div>
          : allLogs.map((rec) => <UpdateRow key={rec.id} rec={rec} />)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Repair tools panel
// ─────────────────────────────────────────────────────────────────────────────

function RepairToolsPanel() {
  const [jobId, setJobId]       = useState('');
  const repairManifest          = useRepairManifest();
  const replayJob               = useReplayJob();
  const checkIntegrity          = useCheckIntegrity();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RepairButton
          icon={<ArrowCounterClockwiseIcon size={14} />}
          label="תיקון מניפסט"
          description="בדיקה והתאמה מחדש של כל מצבי המסמכים"
          loading={repairManifest.isPending}
          onClick={() => repairManifest.mutate()}
        />
        <RepairButton
          icon={<ShieldCheckIcon size={14} />}
          label="בדיקת שלמות DB"
          description="PRAGMA integrity_check + foreign_key_check"
          loading={checkIntegrity.isPending}
          onClick={() => checkIntegrity.mutate()}
        />
        <div className="bg-navy-900/30 border border-parchment/10 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-parchment/70 text-sm font-medium">
            <ClockCounterClockwiseIcon size={14} />
            שחזור משימה
          </div>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Item ID…"
            className="w-full bg-navy-900/50 border border-parchment/10 rounded px-2 py-1
                       text-parchment text-xs placeholder:text-parchment/30 outline-none
                       focus:border-gold/40"
            dir="ltr"
          />
          <button
            onClick={() => { if (jobId.trim()) replayJob.mutate(jobId.trim()); }}
            disabled={!jobId.trim() || replayJob.isPending}
            className="w-full py-1.5 bg-parchment/10 hover:bg-parchment/20 text-parchment/70
                       text-xs rounded transition-colors disabled:opacity-40"
          >
            {replayJob.isPending ? 'מבצע…' : 'שחזר'}
          </button>
        </div>
      </div>

      {(repairManifest.isSuccess || checkIntegrity.isSuccess || replayJob.isSuccess) && (
        <div className="flex items-center gap-2 text-green-400 text-xs px-3 py-2
                        bg-green-900/20 rounded border border-green-700/30">
          <CheckCircleIcon size={14} />
          הפעולה הושלמה בהצלחה
        </div>
      )}
      {(repairManifest.isError || checkIntegrity.isError || replayJob.isError) && (
        <div className="flex items-center gap-2 text-red-400 text-xs px-3 py-2
                        bg-red-900/20 rounded border border-red-700/30">
          <WarningCircleIcon size={14} />
          אירעה שגיאה בביצוע הפעולה
        </div>
      )}
    </div>
  );
}

function RepairButton({ icon, label, description, loading, onClick }: {
  icon: React.ReactNode;
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="bg-navy-900/30 border border-parchment/10 rounded-lg p-3 text-right
                 hover:border-parchment/20 transition-colors disabled:opacity-50 group"
    >
      <div className="flex items-center gap-2 text-parchment/70 text-sm font-medium mb-1 group-hover:text-parchment">
        {loading ? <CircleNotchIcon size={14} className="animate-spin" /> : icon}
        {label}
      </div>
      <div className="text-parchment/40 text-xs leading-relaxed">{description}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Skeleton
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  AES-256 Vault panel
// ─────────────────────────────────────────────────────────────────────────────

function SecurityStatusPanel() {
  const { data, isLoading } = useSecurityStatus();

  if (isLoading) return <PanelSkeleton label="טוען מצב הצפנה…" />;

  const keySourceLabel: Record<string, string> = {
    env:        'מפתח סביבה',
    passphrase: 'סיסמה',
    dpapi:      'DPAPI',
  };

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
            {keySourceLabel[data.keySource] ?? data.keySource}
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

// ─────────────────────────────────────────────────────────────────────────────
//  AI Engine Health panel
// ─────────────────────────────────────────────────────────────────────────────

function AiHealthPanel() {
  const { data, isLoading } = useAiHealth();

  if (isLoading) return <PanelSkeleton label="טוען מצב AI…" />;

  const tierLabel: Record<string, string> = {
    high:     'חומרה גבוהה',
    standard: 'סטנדרטי',
    low:      'בסיסי',
    unknown:  'לא ידוע',
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          data?.isLegalBrain
            ? 'bg-gold/20 text-gold'
            : 'bg-navy-200/60 text-parchment/70'
        }`}>
          {data?.model ?? 'לא ידוע'}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-navy-200/60 text-parchment/70">
          {tierLabel[data?.tier ?? 'unknown']}
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          data?.ollamaReachable
            ? 'bg-green-900/30 text-green-300'
            : 'bg-red-900/30 text-red-300'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            data?.ollamaReachable ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`} />
          {data?.ollamaReachable ? 'Ollama פעיל' : 'Ollama לא זמין'}
        </span>
      </div>
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return <LoadingPanel label={label} rows={2} />;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vacuum Protocol panel
// ─────────────────────────────────────────────────────────────────────────────

const VACUUM_STATUS_LABELS: Record<VacuumSessionData['status'], string> = {
  pending:          'ממתין להפעלה',
  discovery:        'Phase 1 — גילוי קבצים',
  processing_ocr:   'Phase 2 — OCR / קליטה',
  locking_evidence: 'Phase 3 — נעילת ראיות',
  indexing_ai:      'Phase 4 — אינדוקס AI',
  completed:        'הושלם בהצלחה',
  failed:           'שגיאה',
};

function VacuumProtocolPanel() {
  const [targetPath, setTargetPath] = useState('');
  const [sessionId,  setSessionId]  = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const startVacuum = useStartVacuum();
  const { data: session } = useVacuumStatus(sessionId);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [session?.rawLogs]);

  const isRunning = session && session.status !== 'completed' && session.status !== 'failed';
  const pct = session?.progressPercentage ?? 0;

  const statusCls = !session
    ? ''
    : session.status === 'completed'
      ? 'bg-green-900/30 text-green-300'
      : session.status === 'failed'
        ? 'bg-red-900/30 text-red-300'
        : 'bg-gold/20 text-gold';

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          dir="ltr"
          type="text"
          value={targetPath}
          onChange={(e) => setTargetPath(e.target.value)}
          placeholder="C:\אלטמן משרד עורכי דין - סדר 2026"
          disabled={!!isRunning}
          className="flex-1 bg-navy-900/40 border border-parchment/20 rounded px-3 py-2
                     text-parchment text-sm font-mono placeholder:text-parchment/30
                     focus:outline-none focus:border-gold/50 disabled:opacity-50"
        />
        <button
          onClick={() => {
            if (!targetPath.trim()) return;
            startVacuum.mutate({ targetPath: targetPath.trim() }, {
              onSuccess: (d) => setSessionId(d.sessionId),
            });
          }}
          disabled={!targetPath.trim() || !!isRunning || startVacuum.isPending}
          className="px-4 py-2 bg-gold/20 hover:bg-gold/30 text-gold text-sm rounded
                     transition-colors disabled:opacity-50 flex items-center gap-1.5
                     border border-gold/30 shrink-0"
        >
          {(isRunning || startVacuum.isPending)
            ? <CircleNotchIcon size={14} className="animate-spin" />
            : <HardDrivesIcon size={14} weight="duotone" />}
          {isRunning ? 'מבצע…' : 'הפעל פרוטוקול'}
        </button>
      </div>

      {session && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-parchment/60 text-xs">
              {VACUUM_STATUS_LABELS[session.status]}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono ${statusCls}`}>
              {pct}%
            </span>
          </div>
          <div className="h-2 bg-navy-900/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {session?.rawLogs && (
        <div
          ref={logRef}
          dir="ltr"
          className="h-48 overflow-y-auto rounded border border-parchment/10
                     bg-black/80 p-3 font-mono text-xs text-green-400
                     whitespace-pre-wrap leading-5"
        >
          {session.rawLogs}
        </div>
      )}

      {startVacuum.isError && (
        <div className="flex items-center gap-2 text-red-400 text-xs px-3 py-2
                        bg-red-900/20 rounded border border-red-700/30">
          <WarningCircleIcon size={14} />
          {(startVacuum.error as Error).message}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  File ingestion (Vacuum Protocol) panel
// ─────────────────────────────────────────────────────────────────────────────

function eventStatusBadge(e: { processed: boolean; queued: boolean; duplicate: boolean; errorMessage: string | null }): { label: string; cls: string } {
  if (!e.processed) return e.errorMessage
    ? { label: 'ממתין (שגיאה)', cls: 'bg-yellow-900/30 text-yellow-300' }
    : { label: 'ממתין',         cls: 'bg-blue-900/30 text-blue-300' };
  if (e.duplicate)  return { label: 'כפילות',  cls: 'bg-parchment/10 text-parchment/60' };
  if (e.queued)     return { label: 'נקלט',    cls: 'bg-green-900/30 text-green-300' };
  return { label: 'הוחרג', cls: 'bg-parchment/10 text-parchment/50' };
}

function FileIngestionPanel() {
  const { data, isLoading } = useIngestionStatus();
  const setFolders  = useSetWatchFolders();
  const rescan      = useRescanFolder();
  const [draft, setDraft]       = useState<string | null>(null);
  const [rescanPath, setRescanPath] = useState('');

  if (isLoading || !data) return <PanelSkeleton label="טוען מצב קליטה…" />;

  // The textarea is seeded from server state until the user edits it.
  const foldersText = draft ?? data.watchFolders.join('\n');
  const s = data.stats;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'ממתינים', value: s.unprocessed, cls: 'text-blue-300' },
          { label: 'נקלטו',   value: s.processed,   cls: 'text-green-300' },
          { label: 'שגיאות',  value: s.errors,      cls: 'text-yellow-300' },
        ].map((m) => (
          <div key={m.label} className="bg-navy-900/40 rounded border border-parchment/10 py-2">
            <div className={`text-lg font-mono ${m.cls}`}>{m.value}</div>
            <div className="text-parchment/40 text-[11px]">{m.label}</div>
          </div>
        ))}
        <div className="bg-navy-900/40 rounded border border-parchment/10 py-2">
          <div className="text-parchment/80 text-[11px] font-mono mt-1.5">
            {s.lastProcessedAt ? new Date(s.lastProcessedAt).toLocaleString('he-IL') : '—'}
          </div>
          <div className="text-parchment/40 text-[11px]">קליטה אחרונה</div>
        </div>
      </div>

      {/* Watched folders editor */}
      <div className="space-y-2">
        <label className="text-parchment/60 text-xs">תיקיות במעקב (אחת בכל שורה)</label>
        <textarea
          dir="ltr" rows={3} value={foldersText}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'C:\\אלטמן\\נכנס'}
          className="w-full bg-navy-900/40 border border-parchment/20 rounded px-3 py-2
                     text-parchment text-sm font-mono placeholder:text-parchment/30
                     focus:outline-none focus:border-gold/50 resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFolders.mutate(
              foldersText.split('\n').map((f) => f.trim()).filter(Boolean),
              { onSuccess: () => setDraft(null) },
            )}
            disabled={setFolders.isPending}
            className="px-3 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs rounded
                       border border-gold/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {setFolders.isPending ? <CircleNotchIcon size={13} className="animate-spin" /> : <CheckCircleIcon size={13} weight="duotone" />}
            שמור תיקיות
          </button>
          {draft !== null && (
            <button onClick={() => setDraft(null)} className="text-parchment/40 hover:text-parchment text-xs">ביטול</button>
          )}
          {setFolders.isError && (
            <span className="text-red-400 text-xs flex items-center gap-1">
              <WarningCircleIcon size={13} /> {(setFolders.error as Error).message}
            </span>
          )}
          {setFolders.isSuccess && draft === null && (
            <span className="text-green-400 text-xs">נשמר</span>
          )}
        </div>
      </div>

      {/* One-shot rescan */}
      <div className="flex gap-2 items-center">
        <input
          dir="ltr" type="text" value={rescanPath}
          onChange={(e) => setRescanPath(e.target.value)}
          placeholder="סרוק תיקייה קיימת לקליטה חד-פעמית…"
          className="flex-1 bg-navy-900/40 border border-parchment/20 rounded px-3 py-2
                     text-parchment text-sm font-mono placeholder:text-parchment/30
                     focus:outline-none focus:border-gold/50"
        />
        <button
          onClick={() => {
            if (!rescanPath.trim()) return;
            rescan.mutate(rescanPath.trim(), { onSuccess: () => setRescanPath('') });
          }}
          disabled={!rescanPath.trim() || rescan.isPending}
          className="px-4 py-2 bg-navy-900/40 hover:bg-navy-900/60 text-parchment/80 text-sm rounded
                     transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-parchment/20 shrink-0"
        >
          {rescan.isPending ? <CircleNotchIcon size={14} className="animate-spin" /> : <ArrowsClockwiseIcon size={14} weight="duotone" />}
          סרוק
        </button>
      </div>
      {rescan.isSuccess && (
        <p className="text-green-400 text-xs">נוספו {rescan.data?.enqueued ?? 0} קבצים לתור.</p>
      )}

      {/* Recent events */}
      {data.recent.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded border border-parchment/10">
          <table className="w-full text-xs">
            <tbody>
              {data.recent.map((e) => {
                const badge = eventStatusBadge(e);
                return (
                  <tr key={e.id} className="border-b border-parchment/5 last:border-0">
                    <td dir="ltr" className="px-2 py-1.5 font-mono text-parchment/70 truncate max-w-[280px]" title={e.filePath}>
                      {e.filePath}
                    </td>
                    <td className="px-2 py-1.5 text-left whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Recent Crashes panel
// ─────────────────────────────────────────────────────────────────────────────

interface CrashSummary {
  id:         string;
  timestamp:  string;
  type:       string;
  message:    string;
  pid?:       number;
  source?:    string;
}

function RecentCrashesPanel() {
  const [crashes, setCrashes]   = useState<CrashSummary[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared]   = useState(false);

  async function fetchCrashes() {
    setLoading(true);
    setError(false);
    try {
      const res  = await fetch('/api/diagnostics/crashes');
      const body = (await res.json()) as
        | { success: true; data: CrashSummary[] }
        | CrashSummary[];
      const data = Array.isArray(body) ? body : (body as { success: true; data: CrashSummary[] }).data;
      setCrashes(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await deleteJSON('/api/diagnostics/crashes');
      setCleared(true);
      setCrashes([]);
      setTimeout(() => setCleared(false), 3000);
    } catch {
      // silently ignore
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    void fetchCrashes();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-parchment/60">תקלות שנקלטו על-ידי DiagnosticsService</span>
        <button
          onClick={() => void handleClear()}
          disabled={clearing || !crashes?.length}
          className="px-3 py-1.5 bg-red-900/20 hover:bg-red-900/30 text-red-400 text-xs
                     rounded transition-colors disabled:opacity-40 flex items-center gap-1.5
                     border border-red-700/30"
        >
          {clearing
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <TrashIcon size={12} />}
          נקה תקלות
        </button>
      </div>

      {cleared && (
        <div className="flex items-center gap-2 text-green-400 text-xs px-3 py-2
                        bg-green-900/20 rounded border border-green-700/30">
          <CheckCircleIcon size={14} />
          רשומות התקלות נמחקו
        </div>
      )}

      {loading && <PanelSkeleton label="טוען תקלות אחרונות…" />}

      {!loading && error && (
        <div className="flex items-center gap-2 text-red-400 text-xs px-3 py-2
                        bg-red-900/20 rounded border border-red-700/30">
          <WarningCircleIcon size={14} />
          לא ניתן לטעון נתוני תקלות
        </div>
      )}

      {!loading && !error && crashes !== null && crashes.length === 0 && (
        <div className="flex items-center gap-2 text-green-400/70 text-sm py-4 justify-center">
          <CheckCircleIcon size={14} />
          לא נרשמו תקלות — המערכת יציבה
        </div>
      )}

      {!loading && !error && crashes !== null && crashes.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {crashes.map((crash) => (
            <div
              key={crash.id}
              className="flex items-start gap-3 px-3 py-2 border-b border-parchment/5
                         last:border-0 text-xs"
            >
              <BugIcon size={12} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="badge text-[10px] bg-red-900/30 text-red-300">
                    {crash.type}
                  </span>
                  {crash.source && (
                    <span className="text-parchment/30 text-[10px] font-mono truncate">
                      {crash.source}
                    </span>
                  )}
                </div>
                <p className="text-parchment/60 truncate">{crash.message}</p>
              </div>
              <span className="text-parchment/30 font-mono text-[10px] shrink-0">
                {new Date(crash.timestamp).toLocaleString('he-IL')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ollama Status panel (detailed)
// ─────────────────────────────────────────────────────────────────────────────

function OllamaStatusPanel() {
  const { data, isLoading } = useAiHealth();

  if (isLoading) return <PanelSkeleton label="טוען מצב Ollama…" />;

  const MODEL_NAME = 'BrainboxAI/law-il-E2B:Q4_K_M';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">

        {/* Ollama reachability */}
        <div className="bg-navy-900/30 border border-parchment/10 rounded-lg p-3 space-y-1">
          <p className="text-parchment/40 text-xs">חיבור לשרת Ollama</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              data?.ollamaReachable ? 'bg-green-400 animate-pulse' : 'bg-red-400'
            }`} />
            <span className={`font-medium ${
              data?.ollamaReachable ? 'text-green-300' : 'text-red-300'
            }`}>
              {data?.ollamaReachable ? 'זמין' : 'לא זמין'}
            </span>
          </div>
          <p className="text-parchment/30 text-[10px] font-mono" dir="ltr">
            http://localhost:11434
          </p>
        </div>

        {/* Model loaded */}
        <div className="bg-navy-900/30 border border-parchment/10 rounded-lg p-3 space-y-1">
          <p className="text-parchment/40 text-xs">מודל AI</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              data?.isLegalBrain ? 'bg-gold' : 'bg-parchment/30'
            }`} />
            <span className={`font-medium text-xs ${
              data?.isLegalBrain ? 'text-gold' : 'text-parchment/50'
            }`}>
              {data?.isLegalBrain ? 'Law-IL E2B טעון' : 'מודל לא מזוהה'}
            </span>
          </div>
        </div>

        {/* Tier */}
        <div className="bg-navy-900/30 border border-parchment/10 rounded-lg p-3 space-y-1">
          <p className="text-parchment/40 text-xs">דרגת חומרה</p>
          <span className="text-parchment font-medium text-sm">
            {data?.tier === 'high'     ? 'חומרה גבוהה'
              : data?.tier === 'standard' ? 'סטנדרטי'
              : data?.tier === 'low'      ? 'בסיסי'
              : 'לא ידוע'}
          </span>
        </div>
      </div>

      {/* Model name row */}
      <div className="flex items-center gap-3 px-3 py-2 bg-navy-900/20 border border-parchment/10
                      rounded-lg text-xs">
        <RobotIcon size={14} className="text-gold shrink-0" weight="duotone" />
        <span className="text-parchment/50">שם המודל הנדרש:</span>
        <span className="font-mono text-parchment/80 flex-1" dir="ltr">{MODEL_NAME}</span>
        {data?.model && data.model !== MODEL_NAME && (
          <span className="badge text-[10px] bg-red-900/30 text-red-300">
            אי-התאמה
          </span>
        )}
        {data?.isLegalBrain && (
          <CheckCircleIcon size={14} className="text-green-400 shrink-0" />
        )}
      </div>

      {!data?.ollamaReachable && (
        <div className="flex items-center gap-2 text-yellow-400 text-xs px-3 py-2
                        bg-yellow-900/20 rounded border border-yellow-700/30">
          <WarningCircleIcon size={14} />
          Ollama אינו פעיל — יש להפעיל את Ollama לפני הפעלת תכונות AI
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Plugins Panel (SDK)
// ─────────────────────────────────────────────────────────────────────────────

function PluginsPanel() {
  const { data, isLoading } = usePlugins();
  const plugins = data?.plugins ?? [];

  if (isLoading) return <PanelSkeleton label="טוען תוספים…" />;

  return (
    <div className="space-y-2">
      {plugins.length === 0 ? (
        <p className="text-parchment/40 text-sm text-center py-6">אין תוספים טעונים</p>
      ) : (
        <ul className="space-y-1">
          {plugins.map((name) => (
            <li key={name} className="flex items-center gap-2 px-3 py-2 bg-navy-200/30 rounded text-sm text-parchment">
              <CheckCircleIcon size={14} className="text-green-400 shrink-0" />
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Encrypted Backup Panel
// ─────────────────────────────────────────────────────────────────────────────

function EncryptedBackupPanel() {
  const { data, isLoading, refetch } = useEncryptedBackups();
  const createBackup  = useCreateEncryptedBackup();
  const verifyBackup  = useVerifyEncryptedBackup();
  const restoreBackup = useRestoreEncryptedBackup();
  const [verifyState,  setVerifyState]  = useState<Record<string, boolean | null>>({});
  const [restoreState, setRestoreState] = useState<Record<string, string | null>>({});
  const noKey = !!(createBackup.error?.message?.includes('BACKUP_ENCRYPT_KEY'));

  const backups: EncryptedBackupManifest[] = data?.backups ?? [];

  async function handleCreate() {
    await createBackup.mutateAsync();
    void refetch();
  }

  async function handleVerify(id: string) {
    const result = await verifyBackup.mutateAsync(id);
    setVerifyState((s) => ({ ...s, [id]: result.valid }));
  }

  async function handleRestore(id: string) {
    const result = await restoreBackup.mutateAsync(id);
    setRestoreState((s) => ({ ...s, [id]: result.hash ? result.restoredTo : '⚠ אימות נכשל' }));
  }

  if (isLoading) return <PanelSkeleton label="טוען גיבויים מוצפנים…" />;

  return (
    <div className="space-y-3">
      {noKey && (
        <div className="flex items-center gap-2 text-yellow-400 text-xs px-3 py-2
                        bg-yellow-900/20 rounded border border-yellow-700/30">
          <WarningCircleIcon size={14} />
          BACKUP_ENCRYPT_KEY לא מוגדר — גיבוי מוצפן אינו זמין
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => void handleCreate()}
          disabled={createBackup.isPending}
          className="px-3 py-1.5 bg-gold/10 hover:bg-gold/20 text-gold text-xs rounded
                     transition-colors disabled:opacity-40 flex items-center gap-1.5 border border-gold/30"
        >
          {createBackup.isPending
            ? <CircleNotchIcon size={12} className="animate-spin" />
            : <DatabaseIcon size={12} />}
          צור גיבוי מוצפן
        </button>
      </div>
      {backups.length === 0 ? (
        <p className="text-parchment/40 text-sm text-center py-6">אין גיבויים מוצפנים</p>
      ) : (
        <div className="space-y-2">
          {backups.map((b) => (
            <div key={b.backupId}
                 className="flex items-center justify-between gap-3 px-3 py-2
                            bg-navy-200/30 rounded border border-parchment/10">
              <div className="min-w-0">
                <p className="text-xs font-mono text-parchment truncate">{b.backupId}</p>
                <p className="text-xs text-parchment/50 mt-0.5">{new Date(b.createdAt).toLocaleString('he-IL')}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {verifyState[b.backupId] !== undefined && (
                  verifyState[b.backupId]
                    ? <CheckCircleIcon size={14} className="text-green-400" />
                    : <WarningCircleIcon size={14} className="text-red-400" />
                )}
                <button
                  onClick={() => void handleVerify(b.backupId)}
                  disabled={verifyBackup.isPending}
                  className="px-2 py-1 text-xs text-parchment/60 hover:text-parchment
                             bg-parchment/5 hover:bg-parchment/10 rounded transition-colors"
                >
                  אמת
                </button>
                <button
                  onClick={() => void handleRestore(b.backupId)}
                  disabled={restoreBackup.isPending}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300
                             bg-red-900/10 hover:bg-red-900/20 rounded transition-colors"
                >
                  שחזר
                </button>
              </div>
              {restoreState[b.backupId] && (
                <p className="text-xs text-green-400 font-mono truncate w-full">
                  שוחזר ל: {restoreState[b.backupId]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Enterprise Capabilities Panel
// ─────────────────────────────────────────────────────────────────────────────

function EnterpriseCapabilitiesPanel() {
  const { data, isLoading } = useEnterpriseCapabilities();

  if (isLoading) return <PanelSkeleton label="טוען יכולות Enterprise…" />;
  if (!data) return null;

  const { firmProfile, capabilities } = data;
  const capList = [
    { key: 'multiUser',          label: 'ריבוי משתמשים',    enabled: capabilities.multiUser.enabled },
    { key: 'centralizedStorage', label: 'אחסון מרכזי',       enabled: capabilities.centralizedStorage.enabled },
    { key: 'adminConsole',       label: 'מסוף ניהול',        enabled: capabilities.adminConsole.enabled },
    { key: 'enterpriseBackup',   label: 'גיבוי Enterprise', enabled: capabilities.enterpriseBackup.enabled },
  ];

  return (
    <div className="space-y-3">
      {firmProfile && (
        <div className="flex items-center gap-3 px-3 py-2 bg-navy-200/30 rounded border border-parchment/10">
          <div>
            <p className="text-xs font-semibold text-parchment">{firmProfile.displayName}</p>
            <p className="text-xs text-parchment/50 mt-0.5">
              רישיון: <span className="font-medium">{firmProfile.licenseType}</span>
              {' · '}משתמשים מקסימום: {firmProfile.maxUsers}
            </p>
          </div>
        </div>
      )}
      {firmProfile?.licenseType === 'beta' && (
        <div className="text-xs text-parchment/50 px-1">
          * יכולות Enterprise זמינות ברישיון Standard ומעלה
        </div>
      )}
      <div className="space-y-1">
        {capList.map(({ key, label, enabled }) => (
          <div key={key} className="flex items-center justify-between px-3 py-2
                                    bg-navy-200/20 rounded text-sm">
            <span className="text-parchment/80">{label}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              enabled
                ? 'bg-green-900/30 text-green-400'
                : 'bg-parchment/5 text-parchment/30'
            }`}>
              {enabled ? 'פעיל' : 'מושבת'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-parchment/10">
        <span className="text-gold">{icon}</span>
        <h2 className="text-sm font-semibold text-parchment">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────

export function DiagnosticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">מרכז ניהול מערכת</h1>
        <p className="text-parchment/50 text-sm mt-1">
          ניטור פועלים, מעקב קבצים, גיבויים וכלי תיקון
        </p>
      </div>

      {/* System health — always shown at top */}
      <HealthStatusPanel compact={false} />

      <Section icon={<FirstAidKitIcon size={16} weight="duotone" />} title="פעולות תמיכה">
        <div className="space-y-2">
          <p className="text-parchment/40 text-xs mb-3">
            ייצא חבילת תמיכה כדי לשלוח לצוות התמיכה לצורך ניתוח תקלות.
            החבילה נשמרת מקומית ואינה נשלחת לשום שרת חיצוני.
          </p>
          <SupportExportButton />
        </div>
      </Section>

      <Section icon={<RobotIcon size={16} weight="duotone" />} title="מצב Ollama — מנוע AI">
        <OllamaStatusPanel />
      </Section>

      <Section icon={<BugIcon size={16} weight="duotone" />} title="תקלות אחרונות">
        <RecentCrashesPanel />
      </Section>

      <Section icon={<LockIcon size={16} weight="duotone" />} title="כספת AES-256">
        <SecurityStatusPanel />
      </Section>

      <Section icon={<BrainIcon size={16} weight="duotone" />} title="מנוע AI">
        <AiHealthPanel />
      </Section>

      <Section icon={<HeartbeatIcon size={16} weight="duotone" />} title="מצב פועלים">
        <WorkerHealthPanel />
      </Section>

      <Section icon={<FolderOpenIcon size={16} weight="duotone" />} title="קליטת קבצים אוטומטית">
        <FileIngestionPanel />
      </Section>

      <Section icon={<FolderOpenIcon size={16} weight="duotone" />} title="אירועי מעקב קבצים">
        <WatcherEventsPanel />
      </Section>

      <Section icon={<DatabaseIcon size={16} weight="duotone" />} title="גיבויים">
        <BackupSnapshotsPanel />
      </Section>

      <Section icon={<ArrowsClockwiseIcon size={16} weight="duotone" />} title="עדכוני מערכת">
        <UpdateStatusPanel />
      </Section>

      <Section icon={<WrenchIcon size={16} weight="duotone" />} title="כלי תיקון">
        <RepairToolsPanel />
      </Section>

      <Section icon={<HardDrivesIcon size={16} weight="duotone" />} title="פרוטוקול Vacuum">
        <VacuumProtocolPanel />
      </Section>

      <Section icon={<RobotIcon size={16} weight="duotone" />} title="תוספים טעונים">
        <PluginsPanel />
      </Section>

      <Section icon={<LockIcon size={16} weight="duotone" />} title="גיבוי מוצפן">
        <EncryptedBackupPanel />
      </Section>

      <Section icon={<ShieldCheckIcon size={16} weight="duotone" />} title="יכולות Enterprise">
        <EnterpriseCapabilitiesPanel />
      </Section>
    </div>
  );
}
