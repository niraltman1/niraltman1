import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  FileTextIcon,
  ArrowSquareOutIcon,
  ArrowsOutSimpleIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react';
import { useCases } from '@/api/hooks.js';
import { NewCaseWizard } from '@/features/legal-engine/NewCaseWizard.js';

const STATUS_LABELS: Record<string, string> = {
  open:      'פתוח · פעיל',
  closed:    'סגור',
  suspended: 'מושהה',
  archived:  'בארכיון',
};

const STATUS_TONE: Record<string, string> = {
  open:      'gold',
  closed:    'neut',
  suspended: 'warn',
  archived:  'neut',
};

const TYPE_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
};

const FILTERS = ['הכל', 'שלי', 'פעיל', 'הגשה', 'ערעור', 'עיזבון'] as const;

/** Inline AI summary panel showing demo data for the selected case */
function AiSummaryPanel({ cs }: { cs: Record<string, unknown> | null }) {
  if (!cs) {
    return (
      <div
        className="glass flex flex-col items-center justify-center"
        style={{ flex: '1 1 36%', minWidth: 0, overflow: 'hidden' }}
      >
        <SparkleIcon size={32} style={{ color: 'var(--fg-4)' }} />
        <p style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 10 }}>
          בחר תיק לסיכום AI
        </p>
      </div>
    );
  }

  const caseNumber = String(cs['caseNumber'] ?? '');
  const title      = String(cs['titleHe'] ?? '');
  const client     = String(cs['clientName'] ?? cs['titleHe'] ?? '');

  return (
    <div
      className="glass flex flex-col min-w-0 overflow-hidden"
      style={{ flex: '1 1 36%', position: 'relative' }}
    >
      {/* Gold left edge — AI surface indicator */}
      <div
        style={{
          position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 2,
          background: 'linear-gradient(180deg, transparent, var(--brand-gold-edge), transparent)',
        }}
      />

      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--hairline-2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <SparkleIcon size={15} style={{ color: 'var(--brand-gold-2)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 16, color: 'var(--fg-1)' }}>
            סיכום AI{' '}
            <span style={{ color: 'var(--fg-3)', fontStyle: 'italic' }}>· {caseNumber}</span>
          </div>
          <div
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              color: 'var(--fg-3)', letterSpacing: '0.14em', marginTop: 2,
            }}
          >
            LAW-IL E2B · מקומי · 1.4S
          </div>
        </div>
        <button className="btn btn-ghost" style={{ padding: 6 }}>
          <ArrowsOutSimpleIcon size={14} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1, overflow: 'auto',
          padding: '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 22, color: 'var(--fg-1)' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2, fontStyle: 'italic', fontFamily: 'var(--f-serif)' }}>
            {client}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="glass-2" style={{ padding: 12, borderRadius: 6 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.14em' }}>
              חשיפה
            </div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: 20, color: 'var(--fg-1)', marginTop: 4 }}>
              —
            </div>
          </div>
          <div className="glass-2" style={{ padding: 12, borderRadius: 6 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.14em' }}>
              הסתברות זכייה
            </div>
            <div style={{ fontFamily: 'var(--f-serif)', fontSize: 20, color: 'var(--brand-gold-2)', marginTop: 4 }}>
              —
            </div>
          </div>
        </div>

        {/* Key findings */}
        <div>
          <div
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              letterSpacing: '0.14em', color: 'var(--fg-3)',
            }}
          >
            ממצאים עיקריים
          </div>
          <ul
            style={{
              margin: '10px 0 0', padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            {[
              { t: 'הפעל ניתוח AI מלא לקבלת ממצאים עיקריים, פסיקה רלוונטית ומסמכים חסרים.', tone: 'gold' },
            ].map((f, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 4, alignSelf: 'stretch', borderRadius: 2, marginTop: 2, flexShrink: 0,
                    background: f.tone === 'gold' ? 'var(--brand-gold)'
                              : f.tone === 'ok'   ? 'var(--ok)' : 'var(--warn)',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.55 }}>{f.t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Cited documents */}
        <div>
          <div
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              letterSpacing: '0.14em', color: 'var(--fg-3)', marginBottom: 8,
            }}
          >
            מסמכים קשורים
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { id: 'DOC-001', t: 'כתב תביעה', p: '—' },
              { id: 'DOC-002', t: 'כתב הגנה', p: '—' },
            ].map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--hairline)',
                  borderRadius: 4,
                  background: 'rgba(0,0,0,0.25)',
                }}
              >
                <FileTextIcon size={13} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12, color: 'var(--fg-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {d.t}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--f-mono)', fontSize: 9,
                      color: 'var(--fg-3)', letterSpacing: '0.10em',
                    }}
                  >
                    {d.id}
                  </div>
                </div>
                <ArrowSquareOutIcon size={12} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: 14,
          borderTop: '1px solid var(--hairline-2)',
          display: 'flex', gap: 8,
        }}
      >
        <button className="btn" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
          <SparkleIcon size={13} /> ניתוח מחדש
        </button>
        <Link
          to={`/cases/${cs['id'] as number}`}
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, textDecoration: 'none' }}
        >
          פתח תיק ›
        </Link>
        <Link
          to={`/cases/${cs['id'] as number}/workbench`}
          className="btn"
          style={{ justifyContent: 'center', fontSize: 12, textDecoration: 'none', padding: '0 10px' }}
          title="שולחן עבודה"
        >
          <SquaresFourIcon size={14} />
        </Link>
      </div>
    </div>
  );
}

export function CasesPage() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [activeFilter, setFilter] = useState(0);
  const [selectedCase, setSelected] = useState<Record<string, unknown> | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Quick-Add deep link (§4.6.1): /cases?new=1 opens the create form.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowForm(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, isLoading, isError } = useCases(page, 50);
  const items = (data?.items ?? []) as Record<string, unknown>[];
  const total = data?.total ?? 0;

  const filtered = search.trim()
    ? items.filter((c) => {
        const q = search.toLowerCase();
        return (
          String(c['titleHe'] ?? '').toLowerCase().includes(q) ||
          String(c['caseNumber'] ?? '').toLowerCase().includes(q)
        );
      })
    : items;

  return (
    <div
      dir="rtl"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, height: 'calc(100vh - 112px)' }}
    >
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* LEFT — Table */}
        <div
          className="glass"
          style={{ flex: '1 1 64%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}
        >
          {/* Toolbar */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--hairline-2)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: 18, color: 'var(--fg-1)' }}>
                תיקים פעילים
              </div>
              <div
                style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10,
                  color: 'var(--fg-3)', letterSpacing: '0.12em', marginTop: 2,
                }}
              >
                {total} פתוחים
              </div>
            </div>
            <div style={{ flex: 1 }} />

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map((f, i) => (
                <button
                  key={f}
                  className="btn btn-sm"
                  onClick={() => setFilter(i)}
                  style={i === activeFilter ? {
                    borderColor: 'var(--border-gold)',
                    color: 'var(--brand-gold-2)',
                    background: 'rgba(197,160,89,0.08)',
                  } : {}}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ width: 220, position: 'relative' }}>
              <MagnifyingGlassIcon
                size={13}
                style={{
                  position: 'absolute', insetInlineStart: 10,
                  top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--fg-3)',
                }}
              />
              <input
                className="inp"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש תיקים…"
                style={{ paddingInlineStart: 30, fontSize: 12 }}
                dir="rtl"
              />
            </div>

            {/* New case */}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm(true)}
            >
              <PlusIcon size={13} weight="bold" />
              תיק חדש
            </button>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {isLoading && (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>
                טוען…
              </div>
            )}
            {isError && (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--bad)', fontSize: 12 }}>
                שגיאה בטעינת הנתונים
              </div>
            )}
            {!isLoading && !isError && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>מס׳ תיק</th>
                    <th>כותרת</th>
                    <th style={{ width: 130 }}>סטטוס</th>
                    <th style={{ width: 130 }}>בית משפט</th>
                    <th style={{ width: 110 }}>תאריך פתיחה</th>
                    <th style={{ width: 80, textAlign: 'center' }}>סוג</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: 'var(--fg-3)' }}>
                        {search ? `אין תוצאות עבור "${search}"` : 'אין תיקים לתצוגה'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((cs) => {
                      const isActive = selectedCase?.['id'] === cs['id'];
                      return (
                        <tr
                          key={cs['id'] as number}
                          className={isActive ? 'active' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(isActive ? null : cs)}
                        >
                          <td>
                            <span
                              style={{
                                fontFamily: 'var(--f-mono)', fontSize: 11,
                                color: isActive ? 'var(--brand-gold-2)' : 'var(--fg-3)',
                              }}
                            >
                              {String(cs['caseNumber'] ?? '')}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 500, color: 'var(--fg-1)', fontSize: 13 }}>
                                {String(cs['titleHe'] ?? '')}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${STATUS_TONE[cs['status'] as string] ?? 'neut'}`}
                            >
                              {STATUS_LABELS[cs['status'] as string] ?? String(cs['status'])}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                              {String(cs['courtName'] ?? '—')}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontFamily: 'var(--f-mono)', fontSize: 11,
                                color: 'var(--fg-3)',
                              }}
                            >
                              {String(cs['openedDate'] ?? '—')}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                              {TYPE_LABELS[cs['caseType'] as string] ?? String(cs['caseType'] ?? '—')}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer / pagination */}
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--hairline-2)',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 10,
                color: 'var(--fg-3)', letterSpacing: '0.12em',
              }}
            >
              {filtered.length} מתוך {total} · ממוין לפי מס׳ תיק
            </span>
            <div style={{ flex: 1 }} />
            {total > 50 && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹ הקודם
                </button>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
                  {page} / {Math.ceil(total / 50)}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= Math.ceil(total / 50)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  הבא ›
                </button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT — AI Summary */}
        <AiSummaryPanel cs={selectedCase} />
      </div>

      {showForm && <NewCaseWizard onClose={() => setShowForm(false)} />}
    </div>
  );
}
