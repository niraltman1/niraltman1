import { Link } from 'react-router-dom';
import { RobotIcon, ThumbsUpIcon, ThumbsDownIcon } from '@phosphor-icons/react';
import { useDocumentInsights, useVerifyInsight } from '@/api/hooks.js';

const FIELDS: { key: string; label: string }[] = [
  { key: 'case_number',  label: 'מספר תיק' },
  { key: 'court_name',   label: 'בית משפט' },
  { key: 'judge_name',   label: 'שופט/ת' },
  { key: 'offense_type', label: 'עבירה' },
  { key: 'next_hearing', label: 'דיון הבא' },
];

/** Right-pane AI insights for the selected document — verify + Show-Source (M E). */
export function WorkbenchInsights({ docId }: { docId: number | null }) {
  const { data: insights } = useDocumentInsights(docId);
  const verify = useVerifyInsight();

  const ins = (insights ?? {}) as Record<string, unknown>;
  const insightId = ins['id'] as number | undefined;
  const state = ins['verification_state'] as string | undefined;
  const sourcePage = ins['source_page'];
  const confidence = ins['confidence'] as number | null | undefined;
  const hasAny = FIELDS.some((f) => ins[f.key]);

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
          <RobotIcon size={12} className="text-blue-400" />
          תובנות AI
        </h2>
        {confidence != null && <span className="text-parchment/40 text-[10px]">ביטחון {Math.round(confidence * 100)}%</span>}
      </div>

      {docId == null ? (
        <p className="text-parchment/35 text-sm py-2 text-center">בחר מסמך</p>
      ) : !hasAny ? (
        <p className="text-parchment/35 text-sm py-2 text-center">אין תובנות למסמך זה</p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            {FIELDS.map((f) => ins[f.key] ? (
              <div key={f.key} className="contents">
                <dt className="text-parchment/40">{f.label}</dt>
                <dd className="flex items-center gap-2 min-w-0">
                  <span className="text-parchment truncate">{String(ins[f.key])}</span>
                  <Link
                    to={`/documents/${docId}/read?${sourcePage != null ? `page=${sourcePage}&` : ''}highlight=${encodeURIComponent(String(ins[f.key]))}`}
                    className="text-gold/70 text-[10px] hover:underline shrink-0"
                  >
                    מקור
                  </Link>
                </dd>
              </div>
            ) : null)}
          </dl>

          {insightId != null && state !== 'approved' && state !== 'rejected' && (
            <div className="flex gap-2 pt-1">
              <button
                disabled={verify.isPending}
                onClick={() => verify.mutate({ insightId, state: 'approved' })}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-green-400 border border-green-400/20 rounded-lg hover:bg-green-400/10 disabled:opacity-40"
              >
                <ThumbsUpIcon size={12} /> אשר
              </button>
              <button
                disabled={verify.isPending}
                onClick={() => verify.mutate({ insightId, state: 'rejected' })}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 disabled:opacity-40"
              >
                <ThumbsDownIcon size={12} /> דחה
              </button>
            </div>
          )}
          {(state === 'approved' || state === 'rejected') && (
            <span className="text-[10px] text-parchment/40">{state === 'approved' ? '✓ אומת' : '✗ נדחה'}</span>
          )}
        </>
      )}
    </div>
  );
}
