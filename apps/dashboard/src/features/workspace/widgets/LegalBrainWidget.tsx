// LegalBrainWidget — Recent AI activity: agent runs, research sessions, drafts.
// New section for DashboardHomePage (Section 6). No equivalent in DashboardPage.

import { Link } from 'react-router-dom';
import { BrainIcon, RobotIcon, FileTextIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { PanelHeader } from './common.js';

interface AgentRun {
  id:         number;
  agent_name: string;
  case_id?:   number | null;
  confidence: number;
  created_at: string;
  flag_review?: number | boolean;
}

interface BrainSession {
  id:         number;
  title?:     string | null;
  case_id?:   number | null;
  created_at: string;
}

interface LegalDraft {
  id:         number;
  title?:     string | null;
  draft_type?: string | null;
  case_id?:   number | null;
  created_at: string;
}

interface Props {
  agentRuns?:     AgentRun[];
  brainSessions?: BrainSession[];
  drafts?:        LegalDraft[];
  loading?:       boolean;
}

const AGENT_NAMES: Record<string, string> = {
  'case-summarizer':      'סיכום תיק',
  'timeline-builder':     'ציר זמן',
  'research-agent':       'מחקר משפטי',
  'contract-review':      'ביקורת חוזה',
  'discovery-agent':      'גילוי ראיות',
  'insolvency-agent':     'חדלות פירעון',
  'deadline-analysis':    'ניתוח מועדים',
  'hearing-prep':         'הכנה לדיון',
  'case-intake':          'קליטת תיק',
};

export function LegalBrainWidget({ agentRuns, brainSessions, drafts, loading }: Props) {
  if (loading) {
    return (
      <div className="cyber-panel" style={{ borderColor: 'rgba(197,160,89,0.25)', background: 'rgba(197,160,89,0.03)' }}>
        <div className="cyber-panel-header">
          <div className="flex items-center gap-2.5">
            <BrainIcon size={13} weight="duotone" style={{ color: 'var(--brand-gold)' }} />
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
              בינה משפטית
            </span>
          </div>
        </div>
        <div style={{ padding: '10px 16px', height: 80 }} className="animate-pulse" />
      </div>
    );
  }

  const hasContent = (agentRuns?.length ?? 0) > 0 || (brainSessions?.length ?? 0) > 0 || (drafts?.length ?? 0) > 0;

  return (
    <div className="cyber-panel" style={{ borderColor: 'rgba(197,160,89,0.25)', background: 'rgba(197,160,89,0.03)' }}>
      <PanelHeader
        icon={<BrainIcon size={13} weight="duotone" style={{ color: 'var(--brand-gold)' }} />}
        title="בינה משפטית — law-il-E2B"
        right={
          <div className="flex items-center gap-2">
            <Link to="/agents" className="btn btn-ghost btn-sm flex items-center gap-1" style={{ fontSize: 10, padding: '2px 6px' }}>
              <RobotIcon size={11} />
              סוכנים
            </Link>
            <Link to="/drafting" className="btn btn-ghost btn-sm flex items-center gap-1" style={{ fontSize: 10, padding: '2px 6px' }}>
              <FileTextIcon size={11} />
              טיוטות
            </Link>
          </div>
        }
      />
      <div style={{ padding: '8px 16px 14px' }}>
        {!hasContent ? (
          <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            אין פעילות AI לאחרונה
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

            {/* Recent agent runs */}
            {(agentRuns?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  ריצות אחרונות
                </div>
                {agentRuns!.slice(0, 4).map((r) => (
                  <Link
                    key={r.id}
                    to={r.case_id ? `/cases/${r.case_id}` : '/agents'}
                    className="flex items-center gap-2 py-1.5 rounded hover:bg-white/[0.02] transition-colors px-1"
                  >
                    <RobotIcon size={11} weight="duotone" style={{ color: 'var(--brand-gold)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, color: 'var(--fg-2)' }} className="truncate">
                        {AGENT_NAMES[r.agent_name] ?? r.agent_name}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                        {Math.round(r.confidence * 100)}% ביטחון
                        {r.flag_review ? ' · דורש בדיקה' : ''}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', flexShrink: 0 }}>
                      {new Date(r.created_at).toLocaleDateString('he-IL')}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* Recent brain sessions */}
            {(brainSessions?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  מחקר משפטי
                </div>
                {brainSessions!.slice(0, 4).map((s) => (
                  <Link
                    key={s.id}
                    to="/agents"
                    className="flex items-center gap-2 py-1.5 rounded hover:bg-white/[0.02] transition-colors px-1"
                  >
                    <MagnifyingGlassIcon size={11} weight="duotone" style={{ color: 'var(--info)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, color: 'var(--fg-2)' }} className="truncate">
                        {s.title ?? 'שיחה משפטית'}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                        {new Date(s.created_at).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Recent drafts */}
            {(drafts?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                  טיוטות אחרונות
                </div>
                {drafts!.slice(0, 4).map((d) => (
                  <Link
                    key={d.id}
                    to={`/drafting/${d.id}`}
                    className="flex items-center gap-2 py-1.5 rounded hover:bg-white/[0.02] transition-colors px-1"
                  >
                    <FileTextIcon size={11} weight="duotone" style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, color: 'var(--fg-2)' }} className="truncate">
                        {d.title ?? d.draft_type ?? 'טיוטה'}
                      </div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                        {new Date(d.created_at).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
