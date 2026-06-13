// DashboardHomePage — Daily Legal Workspace (/workspace)
// 7-section layout: Active Matters → Agenda → Active Cases → Communications
//                   → Evidence & Documents → Legal Brain → Notifications

import { Link } from 'react-router-dom';
import { BellIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useWorkspaceOverview } from './store/useWorkspaceOverview.js';
import { ActiveMattersWidget } from './widgets/ActiveMattersWidget.js';
import { AgendaWidget }        from './widgets/AgendaWidget.js';
import { ActiveCasesWidget }   from './widgets/ActiveCasesWidget.js';
import { CommunicationsWidget } from './widgets/CommunicationsWidget.js';
import { EvidenceWidget }      from './widgets/EvidenceWidget.js';
import { LegalBrainWidget }    from './widgets/LegalBrainWidget.js';
import { hebrewDate }          from './widgets/common.js';

// Skeleton pulse used during initial load
function SkeletonPanel({ height = 120 }: { height?: number }) {
  return (
    <div
      className="cyber-panel animate-pulse"
      style={{ height, borderColor: 'rgba(255,255,255,0.04)' }}
    />
  );
}

export function DashboardHomePage() {
  const overview = useWorkspaceOverview();

  // Stats derived from overview for the header strip
  const unreadCount  = overview.commsNotifs.length + overview.channelSummary.reduce((s, c) => s + c.unread, 0);
  const failureCount = overview.ocrFailures.length;
  const pendingCount = overview.ocrFailures.length; // reuse as pending evidence proxy

  // Overdue task count from active matters (items with 'task' urgency critical)
  const overdueTaskCount = 0; // TODO: connect /api/tasks?status=overdue when endpoint available

  return (
    <div dir="rtl" style={{ minHeight: '100vh', padding: '0 0 40px' }}>

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '18px 24px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-1)', margin: 0 }}>
            שולחן העבודה
          </h1>
          <p style={{ fontSize: 12, color: 'var(--fg-4)', marginTop: 3 }}>
            {hebrewDate()}
          </p>
        </div>

        {/* Header status chips */}
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Link to="/communications" className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--info)' }}>
              <BellIcon size={13} weight="fill" />
              {unreadCount} חדשים
            </Link>
          )}
          {failureCount > 0 && (
            <Link to="/queue" className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--bad)' }}>
              <WarningCircleIcon size={13} weight="fill" />
              {failureCount} כישלונות OCR
            </Link>
          )}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Section 1 — My Active Matters (primary cockpit) */}
        {overview.loading ? (
          <SkeletonPanel height={160} />
        ) : (
          <ActiveMattersWidget
            urgentDeadlines={overview.atRisk}
            commsNotifs={overview.commsNotifs}
            cases={overview.cases}
            pendingEvidence={pendingCount}
            overdueTaskCount={overdueTaskCount}
          />
        )}

        {/* Section 2 & 3 — Agenda + Active Cases (two-column) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Section 2 — Today's Agenda */}
          {overview.loading ? (
            <SkeletonPanel height={260} />
          ) : (
            <AgendaWidget
              agenda={overview.agenda}
              atRisk={overview.atRisk}
              maxDeadlineDays={7}
            />
          )}

          {/* Section 3 — Active Cases with Case Intelligence */}
          {overview.loading ? (
            <SkeletonPanel height={260} />
          ) : (
            <ActiveCasesWidget
              cases={overview.cases}
              loading={false}
              showIntelligence
            />
          )}
        </div>

        {/* Section 4 & 5 — Communications + Evidence (two-column) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Section 4 — Communications */}
          {overview.loading ? (
            <SkeletonPanel height={220} />
          ) : (
            <CommunicationsWidget
              commsNotifs={overview.commsNotifs}
              channelSummary={overview.channelSummary}
            />
          )}

          {/* Section 5 — Evidence & Documents */}
          {overview.loading ? (
            <SkeletonPanel height={220} />
          ) : (
            <EvidenceWidget
              events={overview.watcherEvents}
              ocrFailures={overview.ocrFailures}
            />
          )}
        </div>

        {/* Section 6 — Legal Brain (full width) */}
        <LegalBrainWidget
          agentRuns={overview.agentRuns}
          brainSessions={overview.brainSessions}
          drafts={overview.drafts}
          loading={overview.loading}
        />

        {/* Section 7 — Recent Notifications */}
        {overview.notifications.length > 0 && (
          <div className="cyber-panel">
            <div className="cyber-panel-header">
              <div className="flex items-center gap-2.5">
                <BellIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                  התראות אחרונות
                </span>
              </div>
              <Link
                to="/activity"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--brand-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                כל הפעילות
              </Link>
            </div>
            <div style={{ padding: '6px 10px' }}>
              {overview.notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-3 py-2 px-3 rounded-md"
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: n.severity === 'critical' ? 'var(--bad)' : n.severity === 'warning' ? 'var(--warn)' : 'var(--info)',
                    boxShadow: `0 0 5px ${n.severity === 'critical' ? 'var(--bad)' : n.severity === 'warning' ? 'var(--warn)' : 'var(--info)'}`,
                  }} />
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, color: 'var(--fg-1)' }} className="truncate">{n.titleHe}</div>
                    {n.bodyHe && (
                      <div style={{ fontSize: 11, color: 'var(--fg-4)', marginTop: 1 }} className="truncate">{n.bodyHe}</div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>
                    {new Date(n.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
