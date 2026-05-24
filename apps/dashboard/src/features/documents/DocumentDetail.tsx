import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileTextIcon, ArrowRightIcon, CheckCircleIcon,
  WarningCircleIcon, RobotIcon, CalendarIcon, SquaresFourIcon,
  ThumbsUpIcon, ThumbsDownIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';
import { useDocument, useDocumentInsights, useVerifyInsight, useAgentContractReview } from '@/api/hooks.js';
import type { AgentOutput } from '@/api/hooks.js';
import { DocumentSigningPanel } from './DocumentSigningPanel.js';
import { AgentOutputPanel } from '@/components/common/AgentOutputPanel.js';

const PROC_STATE_LABELS: Record<string, { label: string; cls: string }> = {
  DISCOVERED:     { label: 'התגלה',    cls: 'badge badge-neutral' },
  HASHED:         { label: 'גיבוב',    cls: 'badge badge-neutral' },
  OCR_PENDING:    { label: 'ממתין OCR', cls: 'badge' },
  OCR_COMPLETE:   { label: 'OCR הושלם', cls: 'badge badge-gold' },
  CLASSIFIED:     { label: 'סווג',      cls: 'badge badge-gold' },
  ENRICHED:       { label: 'הועשר AI',  cls: 'badge badge-blue' },
  REVIEW_PENDING: { label: 'ממתין סקירה', cls: 'badge badge-gold' },
  APPLIED:        { label: 'יושם',      cls: 'badge badge-neutral' },
  VERIFIED:       { label: 'אומת ✓',    cls: 'badge badge-blue' },
  FAILED:         { label: 'נכשל',      cls: 'badge' },
  complete:       { label: 'הושלם',     cls: 'badge badge-blue' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  court_ruling:      'פסק דין',
  petition:          'בקשה',
  summons:           'הזמנה לדין',
  contract:          'חוזה',
  power_of_attorney: 'ייפוי כוח',
  correspondence:    'התכתבות',
  invoice:           'חשבונית',
  evidence:          'ראיה',
  protocol:          'פרוטוקול',
  other:             'אחר',
};

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const { data: doc, isLoading, isError } = useDocument(docId);
  const { data: insights } = useDocumentInsights(docId > 0 ? docId : null);
  const verifyInsight    = useVerifyInsight();
  const contractReviewAgent = useAgentContractReview();
  const [contractOutput, setContractOutput] = useState<AgentOutput | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-parchment/30 text-sm">
        טוען מסמך...
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <FileTextIcon size={36} className="text-parchment/20" />
        <p className="text-parchment/40 text-sm">מסמך לא נמצא</p>
        <Link to="/documents" className="text-gold text-xs hover:underline">← חזרה לרשימת מסמכים</Link>
      </div>
    );
  }

  const d = doc as Record<string, unknown>;
  const procState  = String(d['processingState'] ?? d['processing_state'] ?? '');
  const stateInfo  = PROC_STATE_LABELS[procState] ?? { label: procState, cls: 'badge badge-neutral' };
  const docType    = String(d['documentType']  ?? d['document_type']  ?? '');
  const ocrText    = String(d['ocrText']       ?? d['ocr_text']       ?? '');
  const aiEnriched = Boolean(d['aiEnriched']   ?? d['ai_enriched']);
  const filename   = String(d['filename']      ?? '');
  const storagePath = String(d['storagePath']  ?? d['storage_path']   ?? '');
  const fileSizeBytes = Number(d['fileSizeBytes'] ?? d['file_size_bytes'] ?? 0);
  const documentDate  = String(d['documentDate']  ?? d['document_date']  ?? '');
  const pageCount     = d['pageCount']   ?? d['page_count'];

  return (
    <div className="max-w-3xl mx-auto space-y-5 p-6" dir="rtl">

      {/* Breadcrumb + Canvas link */}
      <div className="flex items-center justify-between">
        <Link to="/documents" className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment transition-colors">
          <ArrowRightIcon size={12} />
          רשימת מסמכים
        </Link>
        <Link
          to={`/canvas/${docId}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/10 transition-colors"
        >
          <SquaresFourIcon size={12} />
          פתח בקנבס
        </Link>
      </div>

      {/* Header card */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <FileTextIcon size={22} className="text-parchment/40 mt-0.5 shrink-0" weight="duotone" />
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-parchment font-semibold truncate">{filename}</h1>
            <div className="flex flex-wrap gap-2">
              <span className={stateInfo.cls}>{stateInfo.label}</span>
              {docType && (
                <span className="badge badge-gold">
                  {DOC_TYPE_LABELS[docType] ?? docType}
                </span>
              )}
              {aiEnriched && (
                <span className="badge badge-blue flex items-center gap-1">
                  <RobotIcon size={10} />
                  AI הועשר
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-parchment/40 border-t border-parchment/5 pt-3">
          {fileSizeBytes > 0 && (
            <span>{Math.round(fileSizeBytes / 1024)} KB</span>
          )}
          {documentDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon size={10} />
              {documentDate}
            </span>
          )}
          {pageCount != null && (
            <span>{String(pageCount)} עמודים</span>
          )}
          <span className="font-mono opacity-60 text-[10px] truncate max-w-[200px]">
            {storagePath}
          </span>
        </div>
      </div>

      {/* OCR text preview */}
      {ocrText && (
        <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-2">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <CheckCircleIcon size={12} className="text-gold" />
            טקסט שחולץ (OCR)
          </h2>
          <p className="text-parchment/60 text-sm whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-mono text-[11px]" dir="rtl">
            {ocrText.slice(0, 1500)}{ocrText.length > 1500 ? '…' : ''}
          </p>
        </div>
      )}

      {/* AI Insights + Provenance */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <RobotIcon size={12} className="text-blue-400" />
            תובנות AI (law-il-E2B)
          </h2>
          {insights?.verification_state && (
            <VerificationBadge state={insights.verification_state} />
          )}
        </div>

        {/* Provenance metadata */}
        {insights && (insights.extraction_method || insights.ai_model_version || insights.source_page != null || insights.ocr_confidence != null) && (
          <div className="flex flex-wrap gap-2">
            {insights.extraction_method && (
              <span className="badge badge-neutral text-[10px]">
                {insights.extraction_method}
              </span>
            )}
            {insights.ai_model_version && (
              <span className="badge badge-neutral text-[10px] font-mono">
                {insights.ai_model_version}
              </span>
            )}
            {insights.source_page != null && (
              <span className="badge badge-neutral text-[10px]">עמ׳ {insights.source_page}</span>
            )}
            {insights.ocr_confidence != null && (
              <span className="badge badge-neutral text-[10px]">
                OCR {Math.round(insights.ocr_confidence * 100)}%
              </span>
            )}
          </div>
        )}

        {/* Confidence bar */}
        {insights?.confidence != null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-parchment/40">
              <span>ביטחון</span>
              <span>{Math.round(insights.confidence * 100)}%</span>
            </div>
            <div className="h-1 bg-parchment/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round(insights.confidence * 100)}%`,
                  background: insights.confidence >= 0.7
                    ? 'var(--brand-cyan)'
                    : insights.confidence >= 0.4
                      ? 'var(--brand-gold)'
                      : '#f87171',
                }}
              />
            </div>
          </div>
        )}

        {insights && (insights.case_number || insights.court_name || insights.judge_name || insights.offense_type || insights.next_hearing) ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" dir="rtl">
            {insights.case_number   && <><dt className="text-parchment/40">מספר תיק</dt><dd className="text-parchment font-mono">{insights.case_number}</dd></>}
            {insights.court_name    && <><dt className="text-parchment/40">בית משפט</dt><dd className="text-parchment">{insights.court_name}</dd></>}
            {insights.judge_name    && <><dt className="text-parchment/40">שופט/ת</dt><dd className="text-parchment">{insights.judge_name}</dd></>}
            {insights.offense_type  && <><dt className="text-parchment/40">עבירה</dt><dd className="text-parchment">{insights.offense_type}</dd></>}
            {insights.next_hearing  && <><dt className="text-parchment/40">דיון הבא</dt><dd className="text-parchment font-mono">{insights.next_hearing}</dd></>}
          </dl>
        ) : aiEnriched ? (
          <p className="text-parchment/40 text-sm text-center py-4">לא נמצאו תובנות למסמך זה</p>
        ) : (
          <div className="flex items-center gap-2 text-parchment/30 text-sm py-4 justify-center">
            <WarningCircleIcon size={14} className="text-amber-500/60" />
            <span>מסמך זה טרם הועשר על ידי מנוע ה-AI</span>
          </div>
        )}

        {/* Verify actions */}
        {insights?.id != null && insights.verification_state !== 'approved' && insights.verification_state !== 'rejected' && (
          <div className="flex gap-2 pt-2 border-t border-parchment/10">
            <button
              disabled={verifyInsight.isPending}
              onClick={() => verifyInsight.mutate({ insightId: insights.id!, state: 'approved' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-400 border border-green-400/20 rounded-lg hover:bg-green-400/10 transition-colors disabled:opacity-40"
            >
              <ThumbsUpIcon size={12} />
              אשר
            </button>
            <button
              disabled={verifyInsight.isPending}
              onClick={() => verifyInsight.mutate({ insightId: insights.id!, state: 'rejected' })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-40"
            >
              <ThumbsDownIcon size={12} />
              דחה
            </button>
          </div>
        )}
      </div>
      {/* Contract Review AI */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <RobotIcon size={12} className="text-blue-400" />
            סקירת חוזה AI
          </h2>
          <button
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            disabled={contractReviewAgent.isPending}
            onClick={() => { setContractOutput(null); contractReviewAgent.mutate(docId, { onSuccess: setContractOutput }); }}
          >
            <RobotIcon size={13} />
            {contractReviewAgent.isPending ? 'מנתח...' : 'נתח מסמך'}
          </button>
        </div>
        {(contractReviewAgent.isPending || contractOutput) && (
          <AgentOutputPanel output={contractOutput} loading={contractReviewAgent.isPending} agentLabel="סקירת חוזה" />
        )}
      </div>

      <DocumentSigningPanel documentId={docId} />
    </div>
  );
}

const VERIFICATION_STYLE: Record<string, { label: string; cls: string }> = {
  unverified:       { label: 'לא אומת',   cls: 'badge badge-neutral' },
  approved:         { label: '✓ מאושר',   cls: 'badge badge-blue' },
  rejected:         { label: '✗ נדחה',    cls: 'badge' },
  review_required:  { label: '⚠ לסקירה',  cls: 'badge badge-gold' },
};

function VerificationBadge({ state }: { state: string }) {
  const s = VERIFICATION_STYLE[state] ?? { label: state, cls: 'badge badge-neutral' };
  return (
    <span className={`${s.cls} text-[10px] flex items-center gap-1`}>
      <ShieldCheckIcon size={10} />
      {s.label}
    </span>
  );
}
