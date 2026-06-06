import { useState } from 'react';
import { ScalesIcon } from '@phosphor-icons/react';
import { useInsolvency, useInitInsolvency, useUpdateChecklistItem, useCases } from '@/api/hooks.js';

function StatusBadge({ status }: { status: 'missing' | 'partial' | 'complete' }) {
  const cls = status === 'complete' ? 'badge-success' : status === 'partial' ? 'badge-warning' : 'badge-error';
  const label = status === 'complete' ? 'מלא' : status === 'partial' ? 'חלקי' : 'חסר';
  return <span className={`badge ${cls} text-xs`}>{label}</span>;
}

function ProgressBar({ total, complete }: { total: number; complete: number }) {
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return (
    <div className="w-full bg-navy-900/60 rounded-full h-2">
      <div
        className="bg-gold h-2 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FilingView({ caseId }: { caseId: number }) {
  const { data, isLoading } = useInsolvency(caseId);
  const update = useUpdateChecklistItem();

  if (isLoading) return <p className="text-parchment/30 text-sm text-center py-8">טוען...</p>;
  if (!data) return <p className="text-parchment/30 text-sm text-center py-8">אין הליך חדלות פירעון לתיק זה</p>;

  const { filing, checklist, progress } = data;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-parchment text-sm font-medium">שלב: {filing.phase === 'Pre_Filing' ? 'טרום הגשה' : 'ניהול שיפוטי'}</p>
          {filing.trustee_name && <p className="text-parchment/50 text-xs mt-0.5">נאמן: {filing.trustee_name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-parchment/50 text-xs">{progress.complete} / {progress.total} שדות</p>
          <div className="w-32 mt-1">
            <ProgressBar total={progress.total} complete={progress.complete} />
          </div>
        </div>
      </div>

      {Object.entries(checklist).map(([section, items]) => (
        <div key={section} className="bg-navy-100 border border-parchment/10 rounded-xl p-4">
          <h3 className="text-parchment/60 text-xs font-semibold uppercase tracking-widest mb-3">{section}</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-parchment flex-1">{item.label_he}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={item.status} />
                  {item.status !== 'complete' && (
                    <button
                      onClick={() => update.mutate({ caseId, fieldKey: item.field_key, body: { status: 'complete' } })}
                      disabled={update.isPending}
                      className="text-xs text-gold hover:underline disabled:opacity-50"
                    >
                      סמן כמלא
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InsolvencyPage() {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const { data: casesData } = useCases(1, 100);
  const initInsolvency = useInitInsolvency();

  const cases = casesData?.items ?? [];

  return (
    <div className="space-y-5 p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2">
        <ScalesIcon size={20} className="text-gold" weight="duotone" />
        <h1 className="text-parchment font-semibold text-lg">הליכי חדלות פירעון</h1>
      </div>

      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3">
        <p className="text-parchment/60 text-xs font-semibold uppercase tracking-widest">בחר תיק</p>
        <select
          dir="rtl"
          value={selectedCaseId ?? ''}
          onChange={(e) => setSelectedCaseId(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-navy-900/60 border border-parchment/20 rounded-lg px-3 py-2 text-parchment text-sm outline-none focus:border-gold/40"
        >
          <option value="">-- בחר תיק --</option>
          {(cases as Record<string, unknown>[]).map((c) => (
            <option key={c['id'] as number} value={c['id'] as number}>
              {String(c['case_number'] ?? c['caseNumber'] ?? '')} — {String(c['title_he'] ?? c['titleHe'] ?? '')}
            </option>
          ))}
        </select>

        {selectedCaseId && (
          <button
            onClick={() => initInsolvency.mutate({ caseId: selectedCaseId, body: {} })}
            disabled={initInsolvency.isPending}
            className="text-xs text-gold hover:underline disabled:opacity-50"
          >
            אתחל הליך חדשות פירעון לתיק זה
          </button>
        )}
      </div>

      {selectedCaseId && <FilingView caseId={selectedCaseId} />}
    </div>
  );
}
