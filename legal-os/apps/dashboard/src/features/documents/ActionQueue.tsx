import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon, EyeIcon, GavelIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import {
  useReviewPendingItems, useApproveItem, useCorrectItem,
  type ReviewPendingItem,
} from '@/api/hooks.js';

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls = pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-error';
  return <span className={`badge ${cls}`}>{pct}%</span>;
}

type Edits = Record<string, string>;

function ReviewCard({
  item,
  onApprove,
  onDismiss,
}: {
  item:      ReviewPendingItem;
  onApprove: (id: number, edits: Edits) => void;
  onDismiss: (id: number) => void;
}) {
  const [showOcr, setShowOcr] = useState(false);
  const [edits,   setEdits]   = useState<Edits>({
    ai_case_number:  item.ai_case_number  ?? '',
    ai_court_name:   item.ai_court_name   ?? '',
    ai_judge_name:   item.ai_judge_name   ?? '',
    ai_offense_type: item.ai_offense_type ?? '',
    ai_next_hearing: item.ai_next_hearing ?? '',
  });

  const changed = (key: string) =>
    edits[key] !== (item[key as keyof ReviewPendingItem] ?? '');
  const anyChanged = Object.keys(edits).some(changed);

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden" dir="rtl">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-parchment truncate">{item.filename}</span>
            {item.ai_confidence != null && (
              <ConfidenceBadge value={item.ai_confidence} />
            )}
            {item.document_type && (
              <span className="badge badge-gold">{item.document_type}</span>
            )}
          </div>
          <div className="text-parchment/40 text-xs mt-1 font-mono">{item.created_at.slice(0, 10)}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowOcr((x) => !x)}
            className="p-1.5 text-parchment/40 hover:text-parchment/70 transition-colors"
            title="הצג OCR"
          >
            <EyeIcon size={16} />
          </button>
          <button
            onClick={() => onDismiss(item.id)}
            className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
            title="דחה"
          >
            <XCircleIcon size={18} weight="fill" />
          </button>
          <button
            onClick={() => onApprove(item.id, edits)}
            className="p-1.5 text-green-400 hover:text-green-300 transition-colors"
            title={anyChanged ? 'תקן ואשר' : 'אשר'}
          >
            {anyChanged
              ? <PencilSimpleIcon size={18} weight="fill" className="text-gold" />
              : <CheckCircleIcon  size={18} weight="fill" />}
          </button>
        </div>
      </div>

      {/* Split-screen: OCR + editable fields */}
      <div className="border-t border-parchment/10 grid grid-cols-2 gap-0 divide-x divide-x-reverse divide-parchment/10">
        {/* Left: OCR preview (always shown, collapsible on small) */}
        <div className={`p-3 ${showOcr ? '' : 'hidden sm:block'}`}>
          <div className="text-parchment/30 text-[10px] uppercase tracking-widest mb-1">טקסט OCR</div>
          <pre className="text-parchment/50 text-[10px] font-mono leading-relaxed whitespace-pre-wrap
                          max-h-40 overflow-y-auto" dir="rtl">
            {item.ocr_text ? item.ocr_text.slice(0, 800) : '—'}
          </pre>
        </div>

        {/* Right: editable AI extraction fields */}
        <div className="p-3 space-y-2">
          <div className="text-parchment/30 text-[10px] uppercase tracking-widest mb-1">שדות AI</div>
          {([
            { key: 'ai_case_number',  label: 'מספר תיק' },
            { key: 'ai_court_name',   label: 'בית משפט' },
            { key: 'ai_judge_name',   label: 'שופט/ת' },
            { key: 'ai_offense_type', label: 'עבירה' },
            { key: 'ai_next_hearing', label: 'דיון הבא' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-parchment/40 text-[10px]">{label}</span>
              <input
                type="text"
                dir="rtl"
                value={edits[key] ?? ''}
                onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                className={`w-full bg-navy-900/60 border rounded px-2 py-1 text-xs text-parchment
                            outline-none focus:border-gold/60 transition-colors
                            ${changed(key) ? 'border-gold/40' : 'border-parchment/10'}`}
                placeholder="—"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ActionQueue() {
  const { data: items = [], isLoading } = useReviewPendingItems();
  const approve  = useApproveItem();
  const correct  = useCorrectItem();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const visible = items.filter((i) => !dismissed.has(i.id));

  const handleApprove = (id: number, edits: Edits) => {
    const original = items.find((i) => i.id === id);
    if (!original) return;

    const FIELD_MAP: Record<string, keyof ReviewPendingItem> = {
      ai_case_number:  'ai_case_number',
      ai_court_name:   'ai_court_name',
      ai_judge_name:   'ai_judge_name',
      ai_offense_type: 'ai_offense_type',
      ai_next_hearing: 'ai_next_hearing',
    };

    // Fire corrections for each changed field before approving
    for (const [key, val] of Object.entries(edits)) {
      const origVal = String(original[FIELD_MAP[key]!] ?? '');
      if (val !== origVal && val.trim()) {
        correct.mutate({
          id,
          field_name:      key,
          corrected_value: val,
          ...(origVal ? { original_value: origVal } : {}),
        });
      }
    }

    approve.mutate(id, {
      onSettled: () => setDismissed((prev) => new Set([...prev, id])),
    });
  };

  const handleDismiss = (id: number) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">תור אישורים</h1>
        <p className="text-parchment/50 text-sm mt-1">
          מסמכים הממתינים לאישור אנושי לפני הקצאה סופית
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-parchment/30 text-sm">
          טוען...
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-parchment/30 gap-3">
          <GavelIcon size={40} weight="thin" />
          <span className="text-sm">אין מסמכים הממתינים לאישור</span>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
