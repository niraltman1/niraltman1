import { useEffect, useRef, useState } from 'react';
import { ShieldWarningIcon, LockKeyIcon, WarningCircleIcon, CheckCircleIcon, CircleNotchIcon } from '@phosphor-icons/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecoveryStatus {
  safeMode:        boolean;
  pid:             number;
  uptime:          number;
  nodeVersion:     string;
  factumRoot:      string | null;
  dataPath:        string;
  workersDisabled: boolean;
  ts:              string;
}

interface AgentLock {
  agent_type: string;
  case_id:    string;
  started_at: string;
  locked_at:  string;
}

interface AgentsResponse {
  running:    AgentLock[];
  staleCount: number;
  stale:      AgentLock[];
}

interface PipelineResponse {
  pending:       number;
  failed:        number;
  recentFailed:  { file_path: string; error_message: string | null; updated_at: string }[];
}

interface SystemEvent {
  event_id:   string;
  occurred_at: string;
  event_type: string;
  source:     string;
  severity:   'info' | 'warn' | 'critical';
  message:    string;
  details:    unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}ש' ${m}ד'` : m > 0 ? `${m}ד' ${s}ש"` : `${s}ש"`;
}

function fmtAge(isoDate: string): string {
  const age = (Date.now() - new Date(isoDate).getTime()) / 1000;
  return fmtUptime(age);
}

function severityColor(severity: string): string {
  if (severity === 'critical') return '#FF6B6B';
  if (severity === 'warn')     return '#C9A94F';
  return 'var(--fg-3, #8A95A3)';
}

const COL_STYLE: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, borderBottom: '1px solid rgba(220,227,236,0.06)',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function RecoveryPage() {
  const [status,   setStatus]   = useState<RecoveryStatus | null>(null);
  const [agents,   setAgents]   = useState<AgentsResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [events,   setEvents]   = useState<SystemEvent[]>([]);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAll() {
    const [s, a, p, e] = await Promise.allSettled([
      fetch('/api/recovery/status').then((r) => r.json() as Promise<RecoveryStatus>),
      fetch('/api/recovery/agents').then((r) => r.json() as Promise<AgentsResponse>),
      fetch('/api/recovery/pipeline').then((r) => r.json() as Promise<PipelineResponse>),
      fetch('/api/recovery/events?limit=100').then((r) => r.json() as Promise<{ events: SystemEvent[] }>),
    ]);
    if (s.status === 'fulfilled') setStatus(s.value);
    if (a.status === 'fulfilled') setAgents(a.value);
    if (p.status === 'fulfilled') setPipeline(p.value);
    if (e.status === 'fulfilled') setEvents(e.value.events ?? []);
  }

  useEffect(() => {
    void fetchAll();
    intervalRef.current = setInterval(() => void fetchAll(), 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function clearLocks() {
    setClearing(true);
    try {
      const res = await fetch('/api/recovery/clear-locks', { method: 'POST' });
      const data = (await res.json()) as { clearedCount: number };
      setClearMsg(`נוקו ${data.clearedCount} נעילות`);
      setTimeout(() => setClearMsg(null), 3000);
      void fetchAll();
    } catch {
      setClearMsg('שגיאה בניקוי נעילות');
    } finally {
      setClearing(false);
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-2, #0E1629)',
    border: '1px solid rgba(220,227,236,0.08)',
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 16,
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'var(--fg-1, #DCE3EC)',
    marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
  };

  return (
    <div dir="rtl" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <ShieldWarningIcon size={22} style={{ color: '#C9A94F' }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg-1, #DCE3EC)', margin: 0 }}>
          מצב שחזור ובריאות תפעולית
        </h1>
      </div>

      {/* ── System Mode Banner ── */}
      <div style={sectionStyle}>
        <div style={headingStyle}>מצב מערכת</div>
        {status === null ? (
          <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>טוען…</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {status.safeMode
                ? <WarningCircleIcon size={16} style={{ color: '#FF6B6B' }} />
                : <CheckCircleIcon  size={16} style={{ color: '#4ADE80' }} />}
              <span
                style={{
                  fontWeight: 700, fontSize: 13,
                  color: status.safeMode ? '#FF6B6B' : '#4ADE80',
                }}
              >
                {status.safeMode ? 'מצב בטוח (SAFE MODE)' : 'מצב רגיל'}
              </span>
            </div>
            <div style={{ color: 'var(--fg-3)' }}>PID: <strong style={{ color: 'var(--fg-1)' }}>{status.pid}</strong></div>
            <div style={{ color: 'var(--fg-3)' }}>
              זמן פעילות: <strong style={{ color: 'var(--fg-1)' }}>{fmtUptime(status.uptime)}</strong>
            </div>
            <div style={{ color: 'var(--fg-3)' }}>
              Node.js: <strong style={{ color: 'var(--fg-1)' }}>{status.nodeVersion}</strong>
            </div>
            {status.factumRoot && (
              <div style={{ color: 'var(--fg-3)' }} dir="ltr">
                Root: <strong style={{ color: 'var(--fg-1)', fontFamily: 'monospace', fontSize: 11 }}>{status.factumRoot}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Agent Locks ── */}
      <div style={sectionStyle}>
        <div style={{ ...headingStyle, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockKeyIcon size={16} style={{ color: '#C9A94F' }} />
            נעילות סוכנים
            {agents && agents.staleCount > 0 && (
              <span style={{ background: '#7B2D2D', color: '#FFAAAA', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>
                {agents.staleCount} ישנות
              </span>
            )}
          </span>
          <button
            onClick={() => void clearLocks()}
            disabled={clearing}
            style={{
              background: clearing ? 'rgba(201,169,79,0.1)' : 'rgba(201,169,79,0.2)',
              border: '1px solid rgba(201,169,79,0.35)',
              color: '#C9A94F', borderRadius: 5,
              padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {clearing && <CircleNotchIcon size={11} style={{ animation: 'spin 1s linear infinite' }} />}
            נקה נעילות ישנות
          </button>
        </div>
        {clearMsg && (
          <div style={{ fontSize: 11, color: '#4ADE80', marginBottom: 8 }}>{clearMsg}</div>
        )}
        {agents === null ? (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>טוען…</div>
        ) : agents.running.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>אין נעילות פעילות</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ color: 'var(--fg-3)' }}>
                <th style={{ ...COL_STYLE, textAlign: 'right' }}>סוכן</th>
                <th style={{ ...COL_STYLE, textAlign: 'right' }}>תיק</th>
                <th style={{ ...COL_STYLE, textAlign: 'right' }}>נעול מאז</th>
                <th style={{ ...COL_STYLE, textAlign: 'right' }}>גיל</th>
              </tr>
            </thead>
            <tbody>
              {agents.running.map((lock) => {
                const isStale = agents.stale.some((s) => s.case_id === lock.case_id && s.agent_type === lock.agent_type);
                return (
                  <tr key={`${lock.agent_type}-${lock.case_id}`}
                    style={{ color: isStale ? '#C9A94F' : 'var(--fg-1)' }}>
                    <td style={COL_STYLE}>{lock.agent_type}</td>
                    <td style={{ ...COL_STYLE, fontFamily: 'monospace' }}>{lock.case_id}</td>
                    <td style={{ ...COL_STYLE, direction: 'ltr', textAlign: 'left' }}>
                      {new Date(lock.locked_at).toLocaleTimeString('he-IL')}
                    </td>
                    <td style={COL_STYLE}>{fmtAge(lock.locked_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pipeline Health ── */}
      <div style={sectionStyle}>
        <div style={headingStyle}>תור עיבוד</div>
        {pipeline === null ? (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>טוען…</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 12 }}>
              <div style={{ color: 'var(--fg-3)' }}>
                ממתינים: <strong style={{ color: 'var(--fg-1)', fontSize: 14 }}>{pipeline.pending}</strong>
              </div>
              <div style={{ color: 'var(--fg-3)' }}>
                נכשלו: <strong style={{ color: pipeline.failed > 0 ? '#FF6B6B' : '#4ADE80', fontSize: 14 }}>
                  {pipeline.failed}
                </strong>
              </div>
            </div>
            {pipeline.recentFailed.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--fg-3)' }}>
                    <th style={{ ...COL_STYLE, textAlign: 'right' }}>קובץ</th>
                    <th style={{ ...COL_STYLE, textAlign: 'right' }}>שגיאה</th>
                    <th style={{ ...COL_STYLE, textAlign: 'right' }}>זמן</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.recentFailed.map((f, i) => (
                    <tr key={i} style={{ color: '#FF6B6B' }}>
                      <td style={{ ...COL_STYLE, fontFamily: 'monospace', direction: 'ltr', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.file_path.split(/[\\/]/).pop() ?? f.file_path}
                      </td>
                      <td style={{ ...COL_STYLE, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.error_message ?? '—'}
                      </td>
                      <td style={{ ...COL_STYLE, direction: 'ltr', whiteSpace: 'nowrap' }}>
                        {new Date(f.updated_at).toLocaleString('he-IL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* ── System Events Log ── */}
      <div style={sectionStyle}>
        <div style={headingStyle}>יומן אירועי מערכת (מתרענן כל 10 שניות)</div>
        {events.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>אין אירועים</div>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-2, #0E1629)' }}>
                <tr style={{ color: 'var(--fg-3)' }}>
                  <th style={{ ...COL_STYLE, textAlign: 'right', whiteSpace: 'nowrap' }}>זמן</th>
                  <th style={{ ...COL_STYLE, textAlign: 'right' }}>סוג</th>
                  <th style={{ ...COL_STYLE, textAlign: 'right' }}>מקור</th>
                  <th style={{ ...COL_STYLE, textAlign: 'right', width: '100%' }}>הודעה</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.event_id}>
                    <td style={{ ...COL_STYLE, direction: 'ltr', whiteSpace: 'nowrap', color: 'var(--fg-3)' }}>
                      {new Date(ev.occurred_at).toLocaleString('he-IL')}
                    </td>
                    <td style={{ ...COL_STYLE, fontFamily: 'monospace', whiteSpace: 'nowrap', color: severityColor(ev.severity) }}>
                      {ev.event_type}
                    </td>
                    <td style={{ ...COL_STYLE, color: 'var(--fg-3)' }}>{ev.source}</td>
                    <td style={{ ...COL_STYLE, color: severityColor(ev.severity) }}>{ev.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
