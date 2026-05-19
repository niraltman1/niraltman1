import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpenIcon, RobotIcon, ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { useDocuments } from '@/api/hooks.js';

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

const STATE_BADGE: Record<string, string> = {
  DISCOVERED:     'badge badge-neutral',
  HASHED:         'badge badge-neutral',
  OCR_PENDING:    'badge',
  OCR_COMPLETE:   'badge badge-gold',
  CLASSIFIED:     'badge badge-gold',
  ENRICHED:       'badge badge-blue',
  REVIEW_PENDING: 'badge badge-gold',
  APPLIED:        'badge badge-neutral',
  VERIFIED:       'badge badge-blue',
  FAILED:         'badge',
  complete:       'badge badge-blue',
};

const STATE_LABEL: Record<string, string> = {
  DISCOVERED:     'התגלה',
  HASHED:         'גיבוב',
  OCR_PENDING:    'ממתין OCR',
  OCR_COMPLETE:   'OCR הושלם',
  CLASSIFIED:     'סווג',
  ENRICHED:       'הועשר AI',
  REVIEW_PENDING: 'ממתין סקירה',
  APPLIED:        'יושם',
  VERIFIED:       'אומת ✓',
  FAILED:         'נכשל',
  complete:       'הושלם',
};

export function DocumentsPage() {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { data, isLoading } = useDocuments(page, PAGE_SIZE);

  const docs    = (data?.items ?? []) as Record<string, unknown>[];
  const total   = data?.total ?? 0;
  const hasNext = total > page * PAGE_SIZE;
  const hasPrev = page > 1;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">מסמכים</h1>
          <p className="text-parchment/50 text-sm mt-1">
            {isLoading ? 'טוען...' : `${total} מסמכים במאגר`}
          </p>
        </div>
      </div>

      <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 px-4 py-2.5
                        border-b border-parchment/10 text-parchment/40 text-xs font-medium">
          <span>שם קובץ</span>
          <span>סוג מסמך</span>
          <span>סטטוס עיבוד</span>
          <span>AI</span>
          <span>תאריך</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-parchment/30 text-sm gap-2">
            <FolderOpenIcon size={20} className="animate-pulse" />
            טוען מסמכים...
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
            <FolderOpenIcon size={40} weight="thin" />
            <span className="text-sm">אין מסמכים לתצוגה</span>
          </div>
        ) : (
          docs.map((doc) => {
            const id        = Number(doc['id']);
            const filename  = String(doc['filename'] ?? '—');
            const docType   = String(doc['document_type'] ?? doc['documentType'] ?? '');
            const state     = String(doc['processing_state'] ?? doc['processingState'] ?? '');
            const aiEnrich  = Boolean(doc['ai_enriched'] ?? doc['aiEnriched']);
            const date      = String(doc['document_date'] ?? doc['documentDate'] ?? doc['created_at'] ?? '');
            const dateLabel = date ? new Date(date).toLocaleDateString('he-IL') : '—';

            return (
              <Link
                key={id}
                to={`/documents/${id}`}
                className="grid grid-cols-[2fr_1fr_1fr_auto_1fr] gap-4 px-4 py-2.5 items-center
                           border-b border-parchment/5 last:border-0 hover:bg-parchment/5 transition-colors"
              >
                <span className="text-parchment/80 text-sm font-mono truncate" title={filename}>
                  {filename}
                </span>
                <span>
                  {docType ? (
                    <span className="badge badge-gold text-[10px]">
                      {DOC_TYPE_LABELS[docType] ?? docType}
                    </span>
                  ) : (
                    <span className="text-parchment/30 text-xs">—</span>
                  )}
                </span>
                <span>
                  {state ? (
                    <span className={`${STATE_BADGE[state] ?? 'badge badge-neutral'} text-[10px]`}>
                      {STATE_LABEL[state] ?? state}
                    </span>
                  ) : (
                    <span className="text-parchment/30 text-xs">—</span>
                  )}
                </span>
                <span>
                  {aiEnrich && <RobotIcon size={14} className="text-blue-400" weight="duotone" />}
                </span>
                <span className="text-parchment/40 text-xs">{dateLabel}</span>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1">
          <span className="text-parchment/40 text-xs">
            עמוד {page} מתוך {Math.ceil(total / PAGE_SIZE)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-parchment/50
                         hover:text-parchment disabled:opacity-30 transition-colors"
            >
              <ArrowRightIcon size={12} />
              הקודם
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-parchment/50
                         hover:text-parchment disabled:opacity-30 transition-colors"
            >
              הבא
              <ArrowLeftIcon size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
