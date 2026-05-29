import { Link } from 'react-router-dom';
import {
  DatabaseIcon, RobotIcon, HeartbeatIcon, CalendarIcon,
  WarningCircleIcon, CheckCircleIcon, CircleNotchIcon, LockIcon,
  ClockCounterClockwiseIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useMissionControl } from '@/api/hooks.js';
import type { MissionControlSnapshot } from '@/api/hooks.js';
import { HealthStatusPanel } from '@/components/admin/HealthStatusPanel.js';

function SectionCard({ title, icon, children }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-parchment/60 text-xs font-semibold uppercase tracking-widest">
        <span className="text-gold">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
  );
}

function QueuePanel({ data }: { data: MissionControlSnapshot['queues'] }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3 text-parchment/70">
        <StatusDot ok={data.poisoned === 0} />
        <span>
          <span className="font-mono text-parchment">{data.total}</span> פריטים בתור
          {data.poisoned > 0 && (
            <span className="badge ml-2 text-[10px]">{data.poisoned} רעילים</span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.byState.map(({ state, n }) => (
          <span key={state} className="badge badge-neutral text-[10px] font-mono">
            {state}: {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkersPanel({ workers }: { data: MissionControlSnapshot['workers']; workers: MissionControlSnapshot['workers'] }) {
  if (workers.length === 0) {
    return <p className="text-parchment/30 text-sm">אין פועלים רשומים</p>;
  }
  return (
    <div className="space-y-1">
      {workers.map((w) => (
        <div key={w.worker_id} className="flex items-center gap-3 text-sm text-parchment/70 border-b border-parchment/5 py-1.5 last:border-0">
          <StatusDot ok={w.status !== 'dead'} />
          <span className="font-mono text-xs text-parchment/50 w-20 shrink-0 truncate">
            {w.worker_id.slice(0, 8)}
          </span>
          <span className="flex-1 text-xs">{w.status}</span>
          {w.memory_mb > 0 && (
            <span className="text-xs text-parchment/40">{w.memory_mb.toFixed(0)} MB</span>
          )}
          <span className="text-xs text-parchment/40">{w.current_task_count} משימות</span>
        </div>
      ))}
    </div>
  );
}

function AIPanel({ ai }: { ai: MissionControlSnapshot['ai'] }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3 text-parchment/70">
        <StatusDot ok={ai.ollama} />
        <span>Ollama — {ai.ollama ? 'זמין' : 'לא זמין'}</span>
        {ai.latencyMs > 0 && (
          <span className="text-xs text-parchment/40 font-mono">{ai.latencyMs}ms</span>
        )}
      </div>
      <span className="badge badge-neutral text-[10px] font-mono">{ai.model}</span>
    </div>
  );
}

function DatabasePanel({ database, writeMutex }: {
  database: MissionControlSnapshot['database'];
  writeMutex: MissionControlSnapshot['writeMutex'];
}) {
  return (
    <div className="space-y-2 text-sm text-parchment/70">
      {database.sizeMb != null && (
        <div className="flex items-center gap-2">
          <DatabaseIcon size={12} className="text-parchment/30" />
          <span>{database.sizeMb.toFixed(1)} MB</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-parchment/40 text-xs">WAL frames:</span>
        <span className="font-mono text-xs">{database.walFrames}</span>
      </div>
      <div className="flex items-center gap-2">
        <LockIcon size={12} className={writeMutex.locked ? 'text-gold' : 'text-parchment/30'} />
        <span className="text-xs">
          mutex — {writeMutex.locked ? `נעול (תור: ${writeMutex.queueDepth})` : 'פנוי'}
        </span>
      </div>
    </div>
  );
}

function SchedulersPanel({ schedulers }: { schedulers: MissionControlSnapshot['schedulers'] }) {
  if (schedulers.length === 0) {
    return <p className="text-parchment/30 text-sm">אין מתזמנים</p>;
  }
  return (
    <div className="space-y-1">
      {schedulers.map((s) => (
        <div key={s.source} className="flex items-center gap-3 text-xs text-parchment/60 border-b border-parchment/5 py-1.5 last:border-0">
          <CalendarIcon size={12} className="text-parchment/30 shrink-0" />
          <span className="flex-1 font-mono">{s.source}</span>
          <span className="text-parchment/40">{s.run_count} הרצות</span>
          {s.last_run && (
            <span className="text-parchment/30 font-mono">{s.last_run.slice(0, 16)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function RecentFailuresPanel({ failures }: { failures: MissionControlSnapshot['recentFailures'] }) {
  if (failures.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-400/70 text-sm py-2">
        <CheckCircleIcon size={14} />
        <span>אין כשלים אחרונים</span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {failures.map((f) => (
        <div key={f.id} className="flex items-start gap-2 text-xs border-b border-parchment/5 py-1.5 last:border-0">
          <WarningCircleIcon size={12} className="text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="badge text-[10px]">{f.kind}</span>
            {f.message && (
              <p className="text-parchment/50 truncate mt-0.5">{f.message}</p>
            )}
          </div>
          <span className="text-parchment/30 font-mono shrink-0">
            {f.emitted_at.slice(0, 16)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MissionControlPage() {
  const { data, isLoading, isError, refetch } = useMissionControl();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-parchment/30 text-sm">
        <CircleNotchIcon size={16} className="animate-spin" />
        טוען מידע...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <WarningCircleIcon size={32} className="text-red-400/40" />
        <p className="text-parchment/40 text-sm">שגיאה בטעינת נתוני Mission Control</p>
        <button onClick={() => void refetch()} className="text-gold text-xs hover:underline">נסה שוב</button>
      </div>
    );
  }

  const snap = data as MissionControlSnapshot;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartbeatIcon size={20} className="text-gold" weight="duotone" />
          <h1 className="text-parchment font-semibold text-lg">Mission Control</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-parchment/30 text-xs font-mono">{snap.ts?.slice(0, 19)}</span>
          <button onClick={() => void refetch()} className="text-parchment/40 hover:text-gold transition-colors">
            <HeartbeatIcon size={14} />
          </button>
        </div>
      </div>

      {/* ── Admin quick-nav ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/journal"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     bg-navy-100 border border-parchment/10 text-parchment/60
                     hover:border-gold/30 hover:text-parchment transition-colors"
        >
          <ClockCounterClockwiseIcon size={12} className="text-gold" />
          יומן ביצוע
        </Link>
        <Link
          to="/admin/rbac"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     bg-navy-100 border border-parchment/10 text-parchment/60
                     hover:border-gold/30 hover:text-parchment transition-colors"
        >
          <ShieldCheckIcon size={12} className="text-gold" weight="duotone" />
          ניהול גישה
        </Link>
      </div>

      {/* ── Operational Health ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-parchment/60 text-xs font-semibold uppercase tracking-widest">
          <span className="text-gold"><HeartbeatIcon size={14} /></span>
          בריאות התפעול
        </h2>
        <HealthStatusPanel compact={false} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="תור עבודות" icon={<HeartbeatIcon size={14} />}>
          <QueuePanel data={snap.queues} />
        </SectionCard>

        <SectionCard title="מנוע AI" icon={<RobotIcon size={14} />}>
          <AIPanel ai={snap.ai} />
        </SectionCard>

        <SectionCard title="בסיס נתונים" icon={<DatabaseIcon size={14} />}>
          <DatabasePanel database={snap.database} writeMutex={snap.writeMutex} />
        </SectionCard>

        <SectionCard title="פועלים" icon={<HeartbeatIcon size={14} />}>
          <WorkersPanel workers={snap.workers} data={snap.workers} />
        </SectionCard>

        <SectionCard title="מתזמנים" icon={<CalendarIcon size={14} />}>
          <SchedulersPanel schedulers={snap.schedulers} />
        </SectionCard>

        <SectionCard title="כשלים אחרונים" icon={<WarningCircleIcon size={14} />}>
          <RecentFailuresPanel failures={snap.recentFailures} />
        </SectionCard>
      </div>
    </div>
  );
}
