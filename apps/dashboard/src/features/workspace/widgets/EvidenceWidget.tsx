// EvidenceWidget — Document center panel with OCR failures and evidence status.
// Extracted from DashboardPage.tsx; extended for DashboardHomePage.

import { Link } from 'react-router-dom';
import { FilesIcon, LockIcon, FileTextIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { PanelHeader } from './common.js';

interface WatcherEvent {
  id:          unknown;
  file_path?:  string;
  occurred_at?: string;
  detected_at?: string;
}

interface Stats {
  documentsTotal: number;
  aiEnriched:     number;
}

interface OcrFailure {
  id:          number;
  file_path:   string;
  error?:      string;
  created_at:  string;
}

interface Props {
  events:       WatcherEvent[];
  stats?:       Stats;
  ocrFailures?: OcrFailure[];
}

export function EvidenceWidget({ events, stats, ocrFailures }: Props) {
  const failCount = ocrFailures?.length ?? 0;

  return (
    <div className="cyber-panel">
      <PanelHeader
        icon={<FilesIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />}
        title="מרכז מסמכים"
        right={
          stats ? (
            <div className="flex items-center gap-2">
              {failCount > 0 && (
                <span className="badge badge-error" style={{ fontSize: 9 }}>
                  <WarningCircleIcon size={9} weight="fill" style={{ marginInlineEnd: 2 }} />
                  {failCount} כישלונות OCR
                </span>
              )}
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-4)' }}>
                {stats.aiEnriched}/{stats.documentsTotal} הועשרו
              </span>
            </div>
          ) : undefined
        }
      />
      <div style={{ padding: '6px 10px' }}>
        {/* OCR failures */}
        {failCount > 0 && (
          <div style={{ marginBottom: 6, padding: '6px 3px', borderBottom: '1px solid var(--hairline)' }}>
            {ocrFailures!.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center gap-2 py-1 px-2">
                <WarningCircleIcon size={11} weight="fill" style={{ color: 'var(--bad)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--bad)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {String(f.file_path).split(/[/\\]/).pop()}
                </span>
              </div>
            ))}
            {failCount > 3 && (
              <p style={{ fontSize: 10, color: 'var(--fg-4)', textAlign: 'center', marginTop: 2 }}>
                ועוד {failCount - 3} נוספים
              </p>
            )}
          </div>
        )}

        {/* Recent ingestion events */}
        {events.length === 0 ? (
          <p style={{ color: 'var(--fg-4)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            אין קבצים שנקלטו לאחרונה
          </p>
        ) : (
          events.map((e) => (
            <div
              key={String(e.id)}
              className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-white/[0.02] transition-colors"
            >
              <FileTextIcon size={12} weight="duotone" style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {String(e.file_path ?? '').split(/[/\\]/).pop()}
              </span>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>
                {new Date(String(e.occurred_at ?? e.detected_at)).toLocaleTimeString('he-IL')}
              </span>
            </div>
          ))
        )}

        <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--border)', marginTop: 6 }}>
          <Link to="/documents" className="btn btn-ghost btn-sm flex items-center gap-1">
            <FilesIcon size={11} />
            כל המסמכים
          </Link>
          <Link to="/evidence" className="btn btn-ghost btn-sm flex items-center gap-1">
            <LockIcon size={11} />
            כספת ראיות
          </Link>
          <Link to="/queue" className="btn btn-ghost btn-sm flex items-center gap-1">
            תור קליטה
          </Link>
        </div>
      </div>
    </div>
  );
}
