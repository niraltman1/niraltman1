// ActiveCasesWidget — Active cases grid with optional case intelligence.
// Extracted from DashboardPage.tsx; extended with enriched data for DashboardHomePage.

import { Link } from 'react-router-dom';
import { FolderIcon, ArrowRightIcon, WarningCircleIcon, GavelIcon, ChatCircleIcon } from '@phosphor-icons/react';
import type { EnrichedCaseRow } from './common.js';

interface Props {
  cases:   EnrichedCaseRow[];
  loading?: boolean;
  /** When true, shows per-case intelligence badges (deadlines, comms, evidence) */
  showIntelligence?: boolean;
}

export function ActiveCasesWidget({ cases, loading = false, showIntelligence = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cyber-panel animate-pulse" style={{ height: 88 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cases.length === 0 ? (
        <div className="cyber-panel col-span-full p-6 text-center">
          <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>אין תיקים פתוחים</p>
          <Link to="/cases" className="btn btn-ghost btn-sm mt-3 inline-flex items-center gap-1.5">
            <FolderIcon size={13} />
            נהל תיקים
          </Link>
        </div>
      ) : (
        <>
          {cases.map((c) => (
            <Link
              key={c.id}
              to={`/cases/${c.id}`}
              className="cyber-panel block p-4 hover:border-gold/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--brand-gold)', letterSpacing: '0.08em' }}
                  className="truncate"
                >
                  {c.case_number || '—'}
                </span>
                {c.procedure_type && (
                  <span className="badge badge-gold" style={{ fontSize: 9, flexShrink: 0 }}>{c.procedure_type}</span>
                )}
              </div>
              <div
                style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.4 }}
                className="truncate group-hover:text-parchment transition-colors"
              >
                {c.title || 'תיק ללא שם'}
              </div>

              {/* Enriched data row */}
              {(c.court_name || c.judge_name) && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', marginTop: 3 }} className="truncate">
                  {[c.court_name, c.judge_name].filter(Boolean).join(' · ')}
                </div>
              )}
              {c.next_hearing && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warn)', marginTop: 2 }}>
                  דיון: {new Date(c.next_hearing).toLocaleDateString('he-IL')}
                </div>
              )}

              {/* Case intelligence badges */}
              {showIntelligence && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {(c.overdue_tasks ?? 0) > 0 && (
                    <span className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--bad)' }}>
                      <WarningCircleIcon size={10} weight="fill" />
                      {c.overdue_tasks} באיחור
                    </span>
                  )}
                  {(c.unread_comms ?? 0) > 0 && (
                    <span className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--info)' }}>
                      <ChatCircleIcon size={10} weight="fill" />
                      {c.unread_comms} הודעות
                    </span>
                  )}
                  {(c.missing_evidence ?? 0) > 0 && (
                    <span className="flex items-center gap-1" style={{ fontSize: 10, color: 'var(--warn)' }}>
                      <GavelIcon size={10} weight="fill" />
                      {c.missing_evidence} ראיות חסרות
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
                  {c.status === 'open' ? 'פתוח' : c.status}
                </span>
                <ArrowRightIcon size={12} style={{ color: 'var(--fg-4)' }} className="group-hover:text-gold transition-colors" />
              </div>
            </Link>
          ))}
          <Link
            to="/cases"
            className="cyber-panel flex items-center justify-center p-4 hover:border-gold/30 transition-colors gap-2"
            style={{ color: 'var(--fg-3)', fontSize: 12 }}
          >
            <span>כל התיקים</span>
            <ArrowRightIcon size={12} />
          </Link>
        </>
      )}
    </div>
  );
}
