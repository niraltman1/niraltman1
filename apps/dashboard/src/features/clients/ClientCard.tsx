import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  UserIcon, PhoneIcon, EnvelopeSimpleIcon, IdentificationCardIcon,
  PencilSimpleIcon, GavelIcon, FolderOpenIcon, ClockCounterClockwiseIcon,
  ArrowRightIcon, ClipboardTextIcon, CircleNotchIcon, CurrencyCircleDollarIcon,
} from '@phosphor-icons/react';
import { useClient, useCases, useDocuments, useExportWorksheet } from '@/api/hooks.js';
import { ClientTimeline } from './ClientTimeline.js';
import { CaseProcedurePanel } from '@/features/legal-engine/CaseProcedurePanel.js';
import { TrafficCasePanel }  from '@/features/traffic/TrafficCasePanel.js';
import { LedgerPage } from '@/features/ledger/LedgerPage.js';

type Tab = 'cases' | 'documents' | 'timeline' | 'worksheet' | 'ledger';

function StatuteCountdownBadge({ deadline }: { deadline?: string | null }) {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  const cls  = days <= 7 ? 'badge-error' : days <= 30 ? 'badge-warning' : 'badge-success';
  return (
    <span className={`badge ${cls} text-sm`} dir="rtl">
      {days > 0 ? `${days} ימים לתום ההתיישנות` : 'פג תוקף ההתיישנות'}
    </span>
  );
}

const CASE_STATUS_LABELS: Record<string, string> = {
  open:      'פתוח',
  closed:    'סגור',
  suspended: 'מושהה',
  archived:  'בארכיון',
};

const CASE_STATUS_CLASS: Record<string, string> = {
  open:      'badge-success',
  closed:    'badge-neutral',
  suspended: 'badge-warning',
  archived:  'badge-neutral',
};

const DOC_STATE_CLASS: Record<string, string> = {
  VERIFIED:      'badge-success',
  APPLIED:       'badge-success',
  FAILED:        'badge-error',
  ROLLED_BACK:   'badge-error',
  REVIEW_PENDING:'badge-warning',
  OCR_PENDING:   'badge-neutral',
  OCR_COMPLETE:  'badge-neutral',
  CLASSIFIED:    'badge-neutral',
  ENRICHED:      'badge-neutral',
  HASHED:        'badge-neutral',
  DISCOVERED:    'badge-neutral',
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('');
}

export function ClientCard() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);

  const { data: client, isLoading, isError } = useClient(clientId);
  const { data: casesData }  = useCases(1, 50, clientId);
  const { data: docsData }   = useDocuments(1, 50);

  const [tab, setTab]         = useState<Tab>('cases');
  const exportWorksheet       = useExportWorksheet();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-parchment/40" dir="rtl">
        טוען פרטי לקוח…
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-parchment/40" dir="rtl">
        <span>הלקוח לא נמצא</span>
        <Link to="/clients" className="text-gold hover:underline text-sm">
          <ArrowRightIcon className="inline ml-1" size={14} />חזרה לרשימת לקוחות
        </Link>
      </div>
    );
  }

  const c = client as Record<string, unknown>;
  const cases = (casesData as { items: Record<string, unknown>[] } | undefined)?.items ?? [];
  const allDocs = (docsData as { items: Record<string, unknown>[] } | undefined)?.items ?? [];
  const clientDocs = allDocs.filter((d) => d['clientId'] === clientId || d['client_id'] === clientId);

  return (
    <div className="space-y-5" dir="rtl">
      {/* Breadcrumb */}
      <Link to="/clients" className="flex items-center gap-1 text-parchment/40 hover:text-parchment/70 text-sm transition-colors w-fit">
        <ArrowRightIcon size={14} />
        רשימת לקוחות
      </Link>

      {/* Header card */}
      <div className="bg-navy-100 border border-parchment/10 rounded-lg p-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center
                          text-gold font-serif font-bold text-xl shrink-0">
            {initials(c['nameHe'] as string)}
          </div>

          <div>
            <h1 className="text-xl font-serif font-bold text-parchment">{c['nameHe'] as string}</h1>
            {!!c['nameEn'] && (
              <p className="text-parchment/50 text-sm">{c['nameEn'] as string}</p>
            )}

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-2">
              {!!c['idNumber'] && (
                <span className="badge badge-neutral flex items-center gap-1">
                  <IdentificationCardIcon size={12} />
                  {c['idNumber'] as string}
                </span>
              )}
              {!!c['phone'] && (
                <span className="badge badge-neutral flex items-center gap-1">
                  <PhoneIcon size={12} />
                  {c['phone'] as string}
                </span>
              )}
              {!!c['email'] && (
                <a
                  href={`mailto:${c['email'] as string}`}
                  className="badge badge-neutral flex items-center gap-1 hover:border-gold/40 transition-colors"
                >
                  <EnvelopeSimpleIcon size={12} />
                  {c['email'] as string}
                </a>
              )}
              <span className={`badge ${c['isActive'] ? 'badge-success' : 'badge-neutral'}`}>
                <UserIcon size={12} className="inline ml-1" />
                {c['isActive'] ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
          </div>
        </div>

        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-parchment/20
                     text-parchment/60 hover:text-parchment hover:border-parchment/40 text-sm transition-colors"
        >
          <PencilSimpleIcon size={14} />
          עריכה
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-parchment/10">
        {([
          { key: 'cases',     label: 'תיקים',       Icon: GavelIcon                 },
          { key: 'documents', label: 'מסמכים',      Icon: FolderOpenIcon            },
          { key: 'timeline',  label: 'ציר זמן',     Icon: ClockCounterClockwiseIcon },
          { key: 'worksheet', label: 'גיליון עבודה', Icon: ClipboardTextIcon        },
          { key: 'ledger',    label: 'ספר גבייה',   Icon: CurrencyCircleDollarIcon  },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors
              ${tab === key
                ? 'border-gold text-parchment font-medium'
                : 'border-transparent text-parchment/50 hover:text-parchment/80'}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'cases' && (
        <div className="space-y-2">
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-parchment/30 gap-3">
              <GavelIcon size={36} weight="thin" />
              <span className="text-sm">אין תיקים ללקוח זה</span>
            </div>
          ) : (
            cases.map((cs) => (
              <div key={cs['id'] as number} className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden hover:border-parchment/20 transition-colors">
                <Link
                  to={`/cases/${cs['id'] as number}`}
                  className="block p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-parchment font-medium text-sm">{cs['titleHe'] as string}</p>
                      <p className="text-parchment/50 text-xs mt-0.5">{cs['caseNumber'] as string}</p>
                    </div>
                    <span className={`badge ${CASE_STATUS_CLASS[cs['status'] as string] ?? 'badge-neutral'}`}>
                      {CASE_STATUS_LABELS[cs['status'] as string] ?? String(cs['status'])}
                    </span>
                  </div>
                </Link>
                <div className="border-t border-parchment/10 px-3 py-2 space-y-1">
                  <CaseProcedurePanel
                    caseId={cs['id'] as number}
                    caseType={cs['caseType'] as string}
                  />
                  <TrafficCasePanel caseId={cs['id'] as number} />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-2">
          {clientDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-parchment/30 gap-3">
              <FolderOpenIcon size={36} weight="thin" />
              <span className="text-sm">אין מסמכים ללקוח זה</span>
            </div>
          ) : (
            clientDocs.map((doc) => (
              <Link
                key={doc['id'] as number}
                to={`/documents/${doc['id'] as number}`}
                className="block bg-navy-100 border border-parchment/10 rounded-lg p-3
                           hover:border-parchment/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-parchment text-sm truncate">{doc['filename'] as string}</p>
                  <span className={`badge ${DOC_STATE_CLASS[doc['processingState'] as string ?? doc['processing_state'] as string] ?? 'badge-neutral'} text-xs shrink-0`}>
                    {String(doc['processingState'] ?? doc['processing_state'] ?? '')}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <ClientTimeline clientId={clientId} />
      )}

      {tab === 'ledger' && (
        <LedgerPage clientId={clientId} />
      )}

      {tab === 'worksheet' && (
        <div className="space-y-4" dir="rtl">
          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-parchment/30 gap-3">
              <ClipboardTextIcon size={36} weight="thin" />
              <span className="text-sm">אין תיקים — גיליון העבודה דורש תיק מקושר</span>
            </div>
          ) : (
            cases.map((cs) => {
              const procedureType = String(cs['procedureType'] ?? cs['procedure_type'] ?? '');
              const isTraffic  = /traffic|תעבורה/i.test(procedureType);
              const isCriminal = /criminal|פלילי/i.test(procedureType);

              return (
                <div key={cs['id'] as number} className="bg-navy-100 border border-parchment/10 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-parchment font-medium text-sm">{cs['titleHe'] as string}</p>
                    <StatuteCountdownBadge deadline={cs['statuteDeadline'] as string | null ?? cs['statute_deadline'] as string | null} />
                  </div>

                  {isTraffic && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-parchment/40">סעיף עבירה</dt>
                      <dd className="text-parchment">{String(cs['statuteSection'] ?? cs['statute_section'] ?? '—')}</dd>
                      <dt className="text-parchment/40">חומרת העבירה</dt>
                      <dd className="text-parchment">{String(cs['offenseType'] ?? cs['offense_type'] ?? '—')}</dd>
                      <dt className="text-parchment/40">תאריך התיישנות</dt>
                      <dd className="text-parchment">{String(cs['statuteDeadline'] ?? cs['statute_deadline'] ?? '—')}</dd>
                    </dl>
                  )}

                  {isCriminal && !isTraffic && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-parchment/40">פרק בחוק העונשין</dt>
                      <dd className="text-parchment">{String(cs['statuteSection'] ?? cs['statute_section'] ?? '—')}</dd>
                      <dt className="text-parchment/40">מדיניות ענישה</dt>
                      <dd className="text-parchment">—</dd>
                      <dt className="text-parchment/40">מעצר פעיל</dt>
                      <dd className="text-parchment">—</dd>
                    </dl>
                  )}

                  {!isTraffic && !isCriminal && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <dt className="text-parchment/40">סכום תביעה</dt>
                      <dd className="text-parchment">—</dd>
                      <dt className="text-parchment/40">סעדים מבוקשים</dt>
                      <dd className="text-parchment">—</dd>
                      <dt className="text-parchment/40">מועד הגשה</dt>
                      <dd className="text-parchment">{String(cs['statuteDeadline'] ?? cs['statute_deadline'] ?? '—')}</dd>
                    </dl>
                  )}

                  <button
                    onClick={() => exportWorksheet.mutate(cs['id'] as number)}
                    disabled={exportWorksheet.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-parchment/20
                               text-parchment/60 hover:text-parchment hover:border-parchment/40 rounded
                               transition-colors disabled:opacity-50"
                  >
                    {exportWorksheet.isPending
                      ? <CircleNotchIcon size={12} className="animate-spin" />
                      : <ClipboardTextIcon size={12} />}
                    {exportWorksheet.isPending ? 'מייצא...' : 'ייצוא Word'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
