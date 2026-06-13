import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileTextIcon, ArrowRightIcon, CheckCircleIcon,
  WarningCircleIcon, RobotIcon, CalendarIcon, SquaresFourIcon,
  ShieldCheckIcon, GavelIcon,
} from '@phosphor-icons/react';
import { useDocument, useDocumentInsights, useVerifyInsight, useEditInsight, useAgentContractReview, useHarvestCitations } from '@/api/hooks.js';
import type { AgentOutput, InsightEditFields } from '@/api/hooks.js';
import { DocumentSigningPanel } from './DocumentSigningPanel.js';
import { AgentOutputPanel } from '@/components/common/AgentOutputPanel.js';
import { AiApprovalBar } from '@/components/common/AiApprovalBar.js';

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
  const editInsight      = useEditInsight();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<InsightEditFields>({});
  const contractReviewAgent = useAgentContractReview();
  const [contractOutput, setContractOutput] = useState<AgentOutput | null>(null);
  const harvestCitations = useHarvestCitations();
  const [harvestedCount, setHarvestedCount] = useState<number | null>(null);

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
        <div className="flex items-center gap-2">
          <Link
            to={`/documents/${docId}/read`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/30 rounded-lg hover:bg-gold/10 transition-colors"
          >
            <FileTextIcon size={12} />
            קרא מסמך
          </Link>
          <Link
            to={`/canvas/${docId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/10 transition-colors"
          >
            <SquaresFourIcon size={12} />
            פתח בקנבס
          </Link>
        </div>
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

        {editing ? (
          <div className="space-y-2" dir="rtl">
            {([
              ['caseNumber',  'מספר תיק'],
              ['courtName',   'בית משפט'],
              ['judgeName',   'שופט/ת'],
              ['offenseType', 'עבירה'],
              ['nextHearing', 'דיון הבא'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <span className="text-parchment/40 w-20 shrink-0">{label}</span>
                <input
                  className="flex-1 bg-navy border border-parchment/15 rounded px-2 py-1 text-parchment text-sm focus:border-gold/40 outline-none"
                  value={(editForm[key] ?? '') as string}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                disabled={editInsight.isPending}
                onClick={() => {
                  if (insights?.id == null) return;
                  editInsight.mutate(
                    { insightId: insights.id, fields: editForm },
                    { onSuccess: () => setEditing(false) },
                  );
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/30 rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-40"
              >
                {editInsight.isPending ? 'שומר…' : 'שמור'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-parchment/50 border border-parchment/15 rounded-lg hover:bg-parchment/5 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : insights && (insights.case_number || insights.court_name || insights.judge_name || insights.offense_type || insights.next_hearing) ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" dir="rtl">
            {insights.case_number  && <><dt className="text-parchment/40">מספר תיק</dt><dd><InsightValue docId={docId} sourcePage={insights.source_page} value={String(insights.case_number)} mono /></dd></>}
            {insights.court_name   && <><dt className="text-parchment/40">בית משפט</dt><dd><InsightValue docId={docId} sourcePage={insights.source_page} value={String(insights.court_name)} /></dd></>}
            {insights.judge_name   && <><dt className="text-parchment/40">שופט/ת</dt><dd><InsightValue docId={docId} sourcePage={insights.source_page} value={String(insights.judge_name)} /></dd></>}
            {insights.offense_type && <><dt className="text-parchment/40">עבירה</dt><dd><InsightValue docId={docId} sourcePage={insights.source_page} value={String(insights.offense_type)} /></dd></>}
            {insights.next_hearing && <><dt className="text-parchment/40">דיון הבא</dt><dd><InsightValue docId={docId} sourcePage={insights.source_page} value={String(insights.next_hearing)} mono /></dd></>}
          </dl>
        ) : aiEnriched ? (
          <p className="text-parchment/40 text-sm text-center py-4">לא נמצאו תובנות למסמך זה</p>
        ) : (
          <div className="flex items-center gap-2 text-parchment/30 text-sm py-4 justify-center">
            <WarningCircleIcon size={14} className="text-amber-500/60" />
            <span>מסמך זה טרם הועשר על ידי מנוע ה-AI</span>
          </div>
        )}

        {/* Verify + edit actions */}
        {!editing && insights?.id != null && (
          <div className="pt-2 border-t border-parchment/10">
            <AiApprovalBar
              state={insights.verification_state as string | undefined}
              isPending={verifyInsight.isPending}
              onApprove={() => verifyInsight.mutate({ insightId: insights.id!, state: 'approved' })}
              onReject={() => verifyInsight.mutate({ insightId: insights.id!, state: 'rejected' })}
              onEdit={() => {
                setEditForm({
                  caseNumber:  (insights.case_number  as string | null) ?? '',
                  courtName:   (insights.court_name   as string | null) ?? '',
                  judgeName:   (insights.judge_name   as string | null) ?? '',
                  offenseType: (insights.offense_type as string | null) ?? '',
                  nextHearing: (insights.next_hearing as string | null) ?? '',
                });
                setEditing(true);
              }}
            />
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

      {/* Citation Harvesting */}
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
            <GavelIcon size={12} className="text-gold" />
            אסמכתאות משפטיות
          </h2>
          <button
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            disabled={harvestCitations.isPending}
            onClick={() => {
              setHarvestedCount(null);
              harvestCitations.mutate(docId, {
                onSuccess: (r) => setHarvestedCount(r.harvested),
              });
            }}
          >
            <GavelIcon size={13} />
            {harvestCitations.isPending ? 'מחלץ...' : 'חלץ אסמכתאות'}
          </button>
        </div>
        {harvestedCount != null && (
          <p className="text-parchment/60 text-xs">
            {harvestedCount > 0
              ? `נמצאו ${harvestedCount} אסמכתאות ועודכנו בתיק`
              : 'לא נמצאו אסמכתאות חדשות'}
          </p>
        )}
      </div>

      <DocumentSigningPanel documentId={docId} />
    </div>
  );
}

/** An extracted insight value with a "Show Source" link (directive Principle 2). */
function InsightValue({ docId, sourcePage, value, mono }: {
  docId: number; sourcePage: unknown; value: string; mono?: boolean;
}) {
  const params = new URLSearchParams();
  if (sourcePage != null) params.set('page', String(sourcePage));
  params.set('highlight', value);
  return (
    <span className="flex items-center gap-2">
      <span className={`text-parchment ${mono ? 'font-mono' : ''}`}>{value}</span>
      <Link
        to={`/documents/${docId}/read?${params.toString()}`}
        className="text-gold/70 text-[10px] hover:underline shrink-0"
        title="הצג מקור במסמך"
      >
        מקור
      </Link>
    </span>
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
