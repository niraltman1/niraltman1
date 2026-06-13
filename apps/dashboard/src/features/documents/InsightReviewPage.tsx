import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircleIcon, XCircleIcon, RobotIcon, FileTextIcon } from '@phosphor-icons/react';
import { useAllInsights, useVerifyInsight, type InsightListItem } from '@/api/hooks.js';
import { useQueryClient } from '@tanstack/react-query';

type FilterState = 'unverified' | 'approved' | 'rejected';

const FILTER_LABELS: Record<FilterState, string> = {
  unverified: 'ממתין לבדיקה',
  approved:   'אושר',
  rejected:   'נדחה',
};

export function InsightReviewPage() {
  const [filter, setFilter] = useState<FilterState>('unverified');
  const { data, isLoading } = useAllInsights(filter);
  const verify = useVerifyInsight();
  const queryClient = useQueryClient();

  const insights = data?.insights ?? [];

  function handleVerify(insight: InsightListItem, state: 'approved' | 'rejected') {
    verify.mutate(
      { insightId: insight.id, state },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['insights', 'all'] });
        },
      },
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <RobotIcon size={24} className="text-gold" />
        <div>
          <h1 className="text-xl font-bold text-parchment">בדיקת תובנות AI</h1>
          <p className="text-parchment/50 text-sm">סקור ואשר תובנות שחולצו מהמסמכים</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(Object.keys(FILTER_LABELS) as FilterState[]).map((s) => (
          <button
            key={s}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-gold text-navy-900'
                : 'bg-parchment/10 text-parchment/60 hover:bg-parchment/20'
            }`}
            onClick={() => setFilter(s)}
          >
            {FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-parchment/40 text-sm">טוען...</p>
      )}

      {!isLoading && insights.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-parchment/40 gap-3">
          <CheckCircleIcon size={40} />
          <p className="text-sm">
            {filter === 'unverified' ? 'אין תובנות הממתינות לבדיקה' : 'אין פריטים'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <Link
                to={`/documents/${insight.document_id}`}
                className="flex items-center gap-2 text-parchment/80 hover:text-parchment text-sm font-medium"
              >
                <FileTextIcon size={14} className="shrink-0 text-gold" />
                {insight.filename}
              </Link>
              {insight.confidence != null && (
                <span className="text-xs text-parchment/40 shrink-0">
                  ביטחון: {Math.round(insight.confidence * 100)}%
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-parchment/60">
              {insight.case_number  && <span>מס׳ תיק: <strong className="text-parchment/80">{insight.case_number}</strong></span>}
              {insight.court_name  && <span>בית משפט: <strong className="text-parchment/80">{insight.court_name}</strong></span>}
              {insight.judge_name  && <span>שופט/ת: <strong className="text-parchment/80">{insight.judge_name}</strong></span>}
              {insight.offense_type && <span>עבירה: <strong className="text-parchment/80">{insight.offense_type}</strong></span>}
              {insight.next_hearing && <span>דיון הבא: <strong className="text-parchment/80">{new Date(insight.next_hearing).toLocaleDateString('he-IL')}</strong></span>}
            </div>

            {filter === 'unverified' && (
              <div className="flex gap-2 justify-end pt-1">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/40 hover:bg-green-800/60 text-green-400 text-xs font-medium disabled:opacity-50"
                  disabled={verify.isPending}
                  onClick={() => handleVerify(insight, 'approved')}
                >
                  <CheckCircleIcon size={13} />
                  אשר
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-400 text-xs font-medium disabled:opacity-50"
                  disabled={verify.isPending}
                  onClick={() => handleVerify(insight, 'rejected')}
                >
                  <XCircleIcon size={13} />
                  דחה
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
