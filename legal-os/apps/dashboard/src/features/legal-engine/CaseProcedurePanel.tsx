import { useState } from 'react';
import {
  GavelIcon, CalendarBlankIcon, CheckCircleIcon,
  ClockIcon, WarningCircleIcon, CircleNotchIcon,
} from '@phosphor-icons/react';
import { useCaseProcedure, useTemplateByCaseType, useApplyTemplate, type MilestoneDraft } from '@/api/hooks.js';

interface Props {
  caseId:   number;
  caseType: string;
}

const ANCHOR_LABELS: Record<string, string> = {
  filing:      'מיום הגשה',
  previous:    'מהשלב הקודם',
  court_order: 'לפי צו בית משפט',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:      'text-parchment/40',
  normal:   'text-parchment/70',
  high:     'text-orange-400',
  critical: 'text-red-400',
};

export function CaseProcedurePanel({ caseId, caseType }: Props) {
  const { data: procedure, isLoading: procLoading } = useCaseProcedure(caseId);
  const { data: tplData } = useTemplateByCaseType(procedure ? null : caseType);
  const applyTpl = useApplyTemplate();

  const [showApply, setShowApply]   = useState(false);
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));

  if (procLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-parchment/40 text-sm">
        <CircleNotchIcon size={16} className="animate-spin" />
        <span>טוען מצב פרוצדורלי…</span>
      </div>
    );
  }

  /* ── Active procedure exists ───────────────────────────────────── */
  if (procedure) {
    const milestones = (procedure as { milestones?: (MilestoneDraft & { id: number; sequenceOrder: number })[] }).milestones ?? [];

    return (
      <div className="space-y-3" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 bg-gold/8 border border-gold/20 rounded-lg">
          <GavelIcon size={18} weight="duotone" className="text-gold shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-parchment text-sm font-semibold truncate">
              {(procedure as { templateName?: string | null }).templateName ?? 'תבנית פרוצדורלית'}
            </p>
            <p className="text-parchment/50 text-xs mt-0.5 flex items-center gap-1">
              <CalendarBlankIcon size={11} />
              עוגן: {new Date((procedure as { anchorDate: string }).anchorDate).toLocaleDateString('he-IL')}
              <span className="mx-1">·</span>
              <span className={`capitalize ${
                (procedure as { status: string }).status === 'active' ? 'text-green-400' :
                (procedure as { status: string }).status === 'completed' ? 'text-parchment/50' : 'text-orange-400'
              }`}>
                {(procedure as { status: string }).status === 'active' ? 'פעיל' :
                 (procedure as { status: string }).status === 'completed' ? 'הושלם' : 'מושהה'}
              </span>
            </p>
          </div>
        </div>

        {/* Milestone list */}
        {milestones.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-parchment/40 mb-2">שלבים פרוצדורליים:</p>
            {milestones.map((m) => (
              <div key={m.id} className="flex items-start gap-2.5 py-1.5">
                <span className="text-parchment/20 text-xs font-mono w-4 shrink-0 text-center mt-0.5">
                  {m.sequenceOrder}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs ${PRIORITY_COLORS[m.taskPriority ?? 'normal']}`}>
                    {m.titleHe}
                  </p>
                  <p className="text-parchment/30 text-xs">
                    {m.dayOffset !== null ? `${m.dayOffset} ימים ${ANCHOR_LABELS[m.anchor ?? 'filing'] ?? ''}` : 'תאריך גמיש'}
                    {!m.isMandatory && ' · אופציונלי'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── No procedure yet ──────────────────────────────────────────── */
  if (tplData?.exists && tplData.template) {
    return (
      <div className="space-y-3" dir="rtl">
        <div className="flex items-start gap-2 p-3 bg-gold/8 border border-gold/20 rounded-lg text-sm">
          <ClockIcon size={16} className="text-gold shrink-0 mt-0.5" />
          <div>
            <p className="text-parchment font-medium">קיימת תבנית: {tplData.template.nameHe}</p>
            <p className="text-parchment/50 text-xs mt-0.5">
              {tplData.template.milestones.length} שלבים — לא הוחלה עדיין
            </p>
          </div>
        </div>

        {!showApply ? (
          <button
            type="button"
            onClick={() => setShowApply(true)}
            className="w-full py-2 rounded border border-gold/30 text-gold hover:bg-gold/10 text-sm transition-colors"
          >
            החל תבנית על תיק זה
          </button>
        ) : (
          <div className="space-y-3 p-3 bg-navy/40 border border-parchment/10 rounded-lg">
            <div>
              <label className="block text-xs text-parchment/60 mb-1">תאריך עוגן</label>
              <input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className="form-input text-sm"
                dir="ltr"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void applyTpl.mutateAsync({
                  caseId, templateId: tplData.template!.id, anchorDate,
                })}
                disabled={applyTpl.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-gold text-navy
                           font-semibold text-sm disabled:opacity-40 transition-colors"
              >
                <CheckCircleIcon size={14} weight="bold" />
                {applyTpl.isPending ? 'מחיל…' : 'אשר'}
              </button>
              <button
                type="button"
                onClick={() => setShowApply(false)}
                className="px-3 py-2 rounded border border-parchment/20 text-parchment/50 text-sm"
              >
                ביטול
              </button>
            </div>
            {applyTpl.isSuccess && (
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <CheckCircleIcon size={14} weight="fill" />
                התבנית הוחלה בהצלחה
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ── No template at all ────────────────────────────────────────── */
  return (
    <div className="flex items-start gap-2 p-3 bg-parchment/5 border border-parchment/10 rounded-lg text-sm" dir="rtl">
      <WarningCircleIcon size={16} className="text-parchment/30 shrink-0 mt-0.5" />
      <p className="text-parchment/40">אין תבנית פרוצדורלית לסוג תיק זה. הפעל אשף יצירת תיק כדי ללמד את המערכת.</p>
    </div>
  );
}
