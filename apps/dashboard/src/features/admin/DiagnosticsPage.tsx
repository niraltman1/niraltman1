import { useState, useRef, useEffect } from 'react';
import {
  useWorkerHealth, useWatcherEvents, useBackupSnapshots,
  useCreateBackup, useRepairManifest, useReplayJob, useCheckIntegrity,
  useUpdateStatus, useTriggerContentUpdate, useSecurityStatus, useAiHealth,
  useStartVacuum, useVacuumStatus,
} from '@/api/hooks.js';
import type { UpdateLogRecord, VacuumSessionData } from '@/api/hooks.js';
import {
  HeartbeatIcon, FolderOpenIcon, DatabaseIcon, WrenchIcon,
  CheckCircleIcon, WarningCircleIcon, CircleNotchIcon,
  ArrowCounterClockwiseIcon, ShieldCheckIcon, ClockCounterClockwiseIcon,
  LockIcon, ArrowsClockwiseIcon, BrainIcon, HardDrivesIcon,
} from '@phosphor-icons/react';

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
  return (
    <div className="flex items-center gap-2 text-parchment/40 text-sm py-4 justify-center">
      <CircleNotchIcon size={14} className="animate-spin" />
      {label}
    </div>
  );
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

      <Section icon={<LockIcon size={16} weight="duotone" />} title="כספת AES-256">
        <SecurityStatusPanel />
      </Section>

      <Section icon={<BrainIcon size={16} weight="duotone" />} title="מנוע AI">
        <AiHealthPanel />
      </Section>

      <Section icon={<HeartbeatIcon size={16} weight="duotone" />} title="מצב פועלים">
        <WorkerHealthPanel />
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
    </div>
  );
}
