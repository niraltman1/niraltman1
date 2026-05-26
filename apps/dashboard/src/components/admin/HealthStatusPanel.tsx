import { useEffect, useRef, useState } from 'react';
import {
  CheckCircleIcon, WarningCircleIcon, XCircleIcon, CircleNotchIcon,
} from '@phosphor-icons/react';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckResult {
  ok: boolean;
  latencyMs?: number;
  /** migrations specific */
  current?: number;
  minimum?: number;
  /** queue specific */
  staleLocks?: number;
  /** disk specific */
  freeMB?: number;
}

interface HealthResponse {
  ok: boolean;
  ts: string;
  checks: {
    db:         CheckResult;
    migrations: CheckResult;
    ollama:     CheckResult;
    queue:      CheckResult;
    disk:       CheckResult;
    rag:        CheckResult;
  };
  ai_ready: boolean;
  version: string;
}

type OverallStatus = 'ok' | 'warn' | 'error' | 'loading' | 'unreachable';

// ─────────────────────────────────────────────────────────────────────────────
//  Hebrew label map
// ─────────────────────────────────────────────────────────────────────────────

const CHECK_LABELS: Record<keyof HealthResponse['checks'], string> = {
  db:         'בסיס נתונים',
  migrations: 'מיגרציות',
  ollama:     'Ollama AI',
  queue:      'תור עיבוד',
  disk:       'דיסק',
  rag:        'RAG',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deriveStatus(health: HealthResponse | null, error: boolean): OverallStatus {
  if (error) return 'unreachable';
  if (!health) return 'loading';
  if (!health.ok) {
    const anyFailed = Object.values(health.checks).some((c) => !c.ok);
    return anyFailed ? 'error' : 'warn';
  }
  return 'ok';
}

function OverallBadge({ status }: { status: OverallStatus }) {
  const cfg: Record<OverallStatus, { dot: string; label: string; badge: string }> = {
    ok:          { dot: 'bg-green-400 animate-pulse', label: 'תקין',        badge: 'bg-green-900/30 text-green-300' },
    warn:        { dot: 'bg-yellow-400',               label: 'אזהרה',       badge: 'bg-yellow-900/30 text-yellow-300' },
    error:       { dot: 'bg-red-400',                  label: 'תקלה',        badge: 'bg-red-900/30 text-red-300' },
    loading:     { dot: 'bg-parchment/30 animate-pulse', label: 'טוען…',     badge: 'bg-parchment/10 text-parchment/50' },
    unreachable: { dot: 'bg-red-600',                  label: 'לא מגיב',    badge: 'bg-red-900/40 text-red-300' },
  };
  const { dot, label, badge } = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

function CheckBadge({ ok }: { ok: boolean }) {
  return ok
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-900/30 text-green-300"><CheckCircleIcon size={10} />תקין</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/30 text-red-300"><XCircleIcon size={10} />שגיאה</span>;
}

function CheckRow({
  name, result,
}: {
  name: string;
  result: CheckResult;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-parchment/5 last:border-0 text-xs text-parchment/70">
      <span className="flex-1">{name}</span>
      {result.latencyMs !== undefined && (
        <span className="text-parchment/30 font-mono text-[10px]">{result.latencyMs}ms</span>
      )}
      {result.freeMB !== undefined && (
        <span className="text-parchment/30 font-mono text-[10px]">{result.freeMB.toLocaleString('he-IL')} MB</span>
      )}
      {result.current !== undefined && (
        <span className="text-parchment/30 font-mono text-[10px]">#{result.current}</span>
      )}
      <CheckBadge ok={result.ok} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2 px-3 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 bg-parchment/10 rounded flex-1" />
          <div className="h-3 w-12 bg-parchment/10 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthStatusPanelProps {
  compact?: boolean;
}

export function HealthStatusPanel({ compact = false }: HealthStatusPanelProps) {
  const [health, setHealth]     = useState<HealthResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchHealth() {
    try {
      const res  = await fetch('/api/health');
      const body = (await res.json()) as HealthResponse;
      setHealth(body);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchHealth();
    intervalRef.current = setInterval(() => void fetchHealth(), 30_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const status = loading ? 'loading' : deriveStatus(health, error);

  // ── Compact mode ──────────────────────────────────────────────────────────

  if (compact) {
    return (
      <div
        dir="rtl"
        className="flex items-center gap-2 px-3 py-2 bg-navy-100 border border-parchment/10
                   rounded-lg"
      >
        <span className="text-xs text-parchment/60 font-medium">מצב מערכת</span>
        {loading
          ? <CircleNotchIcon size={12} className="animate-spin text-parchment/30" />
          : <OverallBadge status={status} />}
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────

  return (
    <div
      dir="rtl"
      className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-parchment/10">
        <h2 className="text-sm font-semibold text-parchment">מצב מערכת</h2>
        <div className="flex items-center gap-2">
          {health && (
            <span className="text-parchment/25 text-[10px] font-mono">
              {new Date(health.ts).toLocaleTimeString('he-IL')}
            </span>
          )}
          <OverallBadge status={status} />
        </div>
      </div>

      {/* Body */}
      <div className="p-2">
        {loading && <Skeleton />}

        {!loading && error && (
          <div className="flex items-center gap-2 px-3 py-4 text-red-400 text-sm justify-center">
            <WarningCircleIcon size={16} />
            לא ניתן להתחבר לשרת
          </div>
        )}

        {!loading && !error && health && (
          <div className="space-y-0">
            {(Object.keys(health.checks) as Array<keyof HealthResponse['checks']>).map((key) => (
              <CheckRow
                key={key}
                name={CHECK_LABELS[key]}
                result={health.checks[key]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {health && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-parchment/5
                        bg-navy-900/10 text-[10px] text-parchment/30">
          <span>v{health.version}</span>
          <span>{health.ai_ready ? 'AI מוכן' : 'AI לא זמין'}</span>
        </div>
      )}
    </div>
  );
}
