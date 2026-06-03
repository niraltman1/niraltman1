import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GavelIcon, UserIcon, CalendarIcon, ArrowRightIcon, SquaresFourIcon,
  UsersIcon, FileTextIcon, RobotIcon, PulseIcon,
  WarningCircleIcon, CheckCircleIcon, CaretDownIcon, CaretUpIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useCase, useCaseContacts, useDocuments, useCaseInsights, useCaseActivity, useAgentSummarize, useAgentTimeline, useAgentDiscovery } from '@/api/hooks.js';
import type { CaseContactRecord, CaseInsightRecord, ActivityEventRow, AgentOutput } from '@/api/hooks.js';
import { AgentOutputPanel } from '@/components/common/AgentOutputPanel.js';
import { CaseRiskPanel } from './CaseRiskPanel.js';
import { CaseTimeline } from './CaseTimeline.js';
import { CaseCitations } from './CaseCitations.js';

const STATUS_LABELS: Record<string, string> = {
  open:      'פתוח',
  closed:    'סגור',
  suspended: 'מושהה',
  archived:  'ארכיון',
};

const PROC_LABELS: Record<string, string> = {
  civil:                  'אזרחי',
  traffic_administrative: 'תעבורה - מנהלי',
  traffic_criminal:       'תעבורה - פלילי',
  academic:               'אקדמי',
};

const STATUS_CLS: Record<string, string> = {
  open:      'badge badge-gold',
  closed:    'badge badge-neutral',
  suspended: 'badge',
  archived:  'badge badge-neutral',
};

type Tab = 'documents' | 'timeline' | 'contacts' | 'insights' | 'citations' | 'activity';

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const caseId = Number(id);
  const [tab, setTab] = useState<Tab>('documents');
  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiOutput, setAiOutput] = useState<AgentOutput | null>(null);
  const [aiLabel,  setAiLabel]  = useState('');
  const summarize = useAgentSummarize();
  const timeline  = useAgentTimeline();
  const discovery = useAgentDiscovery();
  const aiLoading = summarize.isPending || timeline.isPending || discovery.isPending;

  const { data: caseData, isLoading, isError } = useCase(caseId);
  const { data: contacts = [] }    = useCaseContacts(tab === 'contacts' ? caseId : null);
  const { data: docsData }         = useDocuments(1, 50);
  const { data: caseInsights = [] } = useCaseInsights(tab === 'insights' ? caseId : null);
  const { data: activityEvents = [] } = useCaseActivity(tab === 'activity' ? caseId : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-parchment/30 text-sm">
        טוען תיק...
      </div>
    );
  }

  if (isError || !caseData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <GavelIcon size={36} className="text-parchment/20" />
        <p className="text-parchment/40 text-sm">תיק לא נמצא</p>
        <Link to="/cases" className="text-gold text-xs hover:underline">← חזרה לרשימת התיקים</Link>
      </div>
    );
  }

  const c = caseData as Record<string, unknown>;
  const caseDocs = (docsData?.items ?? []).filter(
    (d: Record<string, unknown>) => d['caseId'] === caseId || d['case_id'] === caseId,
  );

  const procedureType  = String(c['procedureType'] ?? c['procedure_type'] ?? '');
  const statusStr      = String(c['status'] ?? '');
  const courtName      = String(c['courtName']  ?? c['court_name']  ?? '');
  const judgeName      = String(c['judgeName']  ?? c['judge_name']  ?? '');
  const openedDate     = String(c['openedDate'] ?? c['opened_date'] ?? '');
  const titleHe        = String(c['titleHe']    ?? c['title_he']    ?? '—');
  const caseNumber     = String(c['caseNumber'] ?? c['case_number'] ?? '');

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6" dir="rtl">

      {/* Breadcrumb */}
      <Link to="/cases" className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment transition-colors">
        <ArrowRightIcon size={12} />
        רשימת תיקים
      </Link>

      {/* Header */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <GavelIcon size={18} className="text-gold" weight="duotone" />
              <h1 className="text-parchment font-semibold text-lg">{titleHe}</h1>
              <span className={STATUS_CLS[statusStr] ?? 'badge'}>
                {STATUS_LABELS[statusStr] ?? statusStr}
              </span>
            </div>
            <p className="text-parchment/40 text-sm font-mono">{caseNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            {procedureType && (
              <span className="badge badge-neutral text-xs">
                {PROC_LABELS[procedureType] ?? procedureType}
              </span>
            )}
            <Link
              to={`/cases/${caseId}/workbench`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/40 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors"
            >
              <SquaresFourIcon size={12} />
              שולחן עבודה
            </Link>
            <Link
              to={`/cases/${caseId}/hearing-prep`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/30 rounded-lg hover:bg-gold/10 transition-colors"
            >
              <GavelIcon size={12} />
              הכנה לדיון
            </Link>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 text-sm text-parchment/50 border-t border-parchment/5 pt-3">
          {courtName && (
            <span className="flex items-center gap-1">
              <GavelIcon size={12} className="text-parchment/30" />
              {courtName}
            </span>
          )}
          {judgeName && (
            <span className="flex items-center gap-1">
              <UserIcon size={12} className="text-parchment/30" />
              {judgeName}
            </span>
          )}
          {openedDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon size={12} className="text-parchment/30" />
              {openedDate}
            </span>
          )}
        </div>
      </div>

      {/* Risk dashboard (always-visible context) */}
      <CaseRiskPanel caseId={caseId} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-parchment/10">
        {([
          { key: 'documents' as Tab, label: 'מסמכים', Icon: FileTextIcon },
          { key: 'timeline'  as Tab, label: 'ציר זמן', Icon: CalendarIcon },
          { key: 'contacts'  as Tab, label: 'אנשי קשר', Icon: UsersIcon },
          { key: 'insights'  as Tab, label: 'תובנות AI', Icon: RobotIcon },
          { key: 'citations' as Tab, label: 'אסמכתאות', Icon: GavelIcon },
          { key: 'activity'  as Tab, label: 'פעילות',    Icon: PulseIcon },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px
              ${tab === key
                ? 'border-gold text-gold'
                : 'border-transparent text-parchment/40 hover:text-parchment'}`}
          >
            <Icon size={14} weight="duotone" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'documents' && (
        <ul className="space-y-2">
          {caseDocs.length === 0 && (
            <li className="text-center text-parchment/30 py-10 text-sm">אין מסמכים משויכים לתיק זה</li>
          )}
          {caseDocs.map((doc: Record<string, unknown>) => (
            <li key={doc['id'] as number}>
              <Link
                to={`/documents/${doc['id'] as number}`}
                className="flex items-center gap-3 px-4 py-3 bg-navy-100 border border-parchment/10 rounded-lg hover:border-gold/30 transition-colors"
              >
                <FileTextIcon size={16} className="text-parchment/30" weight="duotone" />
                <span className="flex-1 text-parchment text-sm truncate">
                  {String(doc['filename'] ?? '')}
                </span>
                <span className="badge badge-neutral text-[10px]">
                  {String(doc['documentType'] ?? doc['document_type'] ?? 'מסמך')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'timeline' && <CaseTimeline caseId={caseId} />}

      {tab === 'citations' && <CaseCitations caseId={caseId} />}

      {tab === 'contacts' && (
        <ul className="space-y-2">
          {contacts.length === 0 && (
            <li className="text-center text-parchment/30 py-10 text-sm">אין אנשי קשר משויכים</li>
          )}
          {contacts.map((ct: CaseContactRecord) => (
            <li key={ct.id}
              className="flex items-center gap-3 px-4 py-3 bg-navy-100 border border-parchment/10 rounded-lg"
            >
              <UserIcon size={16} className="text-blue-400" weight="duotone" />
              <span className="flex-1 text-parchment text-sm">{ct.nameHe}</span>
              {ct.roleInCase && (
                <span className="badge badge-neutral text-[10px]">{ct.roleInCase}</span>
              )}
              <span className="badge badge-neutral text-[10px]">{ct.role}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === 'insights' && (
        <div className="space-y-3">
          {caseInsights.length === 0 ? (
            <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5">
              <p className="text-parchment/30 text-sm text-center py-6">
                תובנות AI יוצגו כאן לאחר עיבוד מסמכי התיק על ידי מנוע law-il-E2B
              </p>
            </div>
          ) : (
            caseInsights.map((ins: CaseInsightRecord) => (
              <div key={ins.document_id} className="bg-navy-100 border border-parchment/10 rounded-xl p-4" dir="rtl">
                <div className="text-parchment/50 text-xs font-mono mb-2 truncate">{ins.filename}</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {ins.case_number   && <><dt className="text-parchment/40">מספר תיק</dt><dd className="text-parchment font-mono">{ins.case_number}</dd></>}
                  {ins.court_name    && <><dt className="text-parchment/40">בית משפט</dt><dd className="text-parchment">{ins.court_name}</dd></>}
                  {ins.judge_name    && <><dt className="text-parchment/40">שופט/ת</dt><dd className="text-parchment">{ins.judge_name}</dd></>}
                  {ins.offense_type  && <><dt className="text-parchment/40">עבירה</dt><dd className="text-parchment">{ins.offense_type}</dd></>}
                  {ins.next_hearing  && <><dt className="text-parchment/40">דיון הבא</dt><dd className="text-parchment font-mono">{ins.next_hearing}</dd></>}
                  {ins.confidence != null && (
                    <><dt className="text-parchment/40">ביטחון</dt><dd className="text-parchment">{Math.round(ins.confidence * 100)}%</dd></>
                  )}
                </dl>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
          {activityEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <PulseIcon size={28} className="text-parchment/20" />
              <p className="text-parchment/30 text-sm">אין אירועי פעילות לתיק זה</p>
            </div>
          ) : (
            activityEvents.map((ev: ActivityEventRow) => (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 border-b border-parchment/5 last:border-0" dir="rtl">
                {ev.kind.includes('fail') || ev.kind.includes('error')
                  ? <WarningCircleIcon size={14} className="text-red-400 mt-0.5 shrink-0" />
                  : <CheckCircleIcon size={14} className="text-green-400/70 mt-0.5 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-parchment">{ev.kind.replace(/_/g, ' ')}</span>
                    {ev.confidence != null && (
                      <span className="badge badge-neutral text-[10px]">{Math.round(ev.confidence * 100)}%</span>
                    )}
                  </div>
                  {ev.message && (
                    <p className="text-xs text-parchment/50 truncate">{ev.message}</p>
                  )}
                  <span className="text-[10px] text-parchment/30 font-mono">
                    {ev.emittedAt?.slice(0, 16)}
                  </span>
                </div>
                {ev.documentId != null && (
                  <Link to={`/documents/${ev.documentId}`} className="text-blue-400/60 text-xs hover:underline shrink-0">
                    מסמך
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Intelligence section */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setAiOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <RobotIcon size={15} weight="duotone" className="text-blue-400" />
            <span className="text-parchment/70 text-sm font-medium">בינה מלאכותית</span>
            <span className="badge badge-neutral text-[10px]">law-il-E2B</span>
          </div>
          {aiOpen
            ? <CaretUpIcon size={14} className="text-parchment/30" />
            : <CaretDownIcon size={14} className="text-parchment/30" />}
        </button>

        {aiOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-parchment/10">
            <div className="flex gap-2 pt-3 flex-wrap">
              <button
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                disabled={aiLoading}
                onClick={() => { setAiLabel('סיכום תיק'); setAiOutput(null); summarize.mutate(caseId, { onSuccess: setAiOutput }); }}
              >
                <FileTextIcon size={13} />
                סכם תיק
              </button>
              <button
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                disabled={aiLoading}
                onClick={() => { setAiLabel('ציר זמן'); setAiOutput(null); timeline.mutate(caseId, { onSuccess: setAiOutput }); }}
              >
                <CalendarIcon size={13} />
                בנה ציר זמן
              </button>
              <button
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
                disabled={aiLoading}
                onClick={() => { setAiLabel('גילוי ראיות'); setAiOutput(null); discovery.mutate(caseId, { onSuccess: setAiOutput }); }}
              >
                <ShieldCheckIcon size={13} />
                נתח גילוי ראיות
              </button>
            </div>
            {(aiLoading || aiOutput) && (
              <AgentOutputPanel output={aiOutput} loading={aiLoading} agentLabel={aiLabel} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
