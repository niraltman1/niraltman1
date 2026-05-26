import { useState } from 'react';
import {
  BrainIcon, GavelIcon, CheckCircleIcon, WarningCircleIcon,
  CaretDownIcon, CaretUpIcon, TrashIcon, SealCheckIcon,
} from '@phosphor-icons/react';
import {
  useTemplates, useApproveTemplate, useDeprecateTemplate,
  type TemplateFull, type MilestoneDraft,
} from '@/api/hooks.js';

const CASE_TYPE_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
};

const STATUS_BADGE: Record<string, string> = {
  active:     'badge bg-green-500/15 text-green-400 border border-green-500/30',
  draft:      'badge bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  deprecated: 'badge bg-parchment/10 text-parchment/30 border border-parchment/10',
};

const STATUS_LABEL: Record<string, string> = {
  active:     'פעיל',
  draft:      'טיוטה',
  deprecated: 'מיושן',
};

type StatusFilter = 'all' | 'active' | 'draft' | 'deprecated';

export function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();
  const approveMutation    = useApproveTemplate();
  const deprecateMutation  = useDeprecateTemplate();

  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');

  const all = (templates ?? []) as TemplateFull[];
  const filtered = statusFilter === 'all' ? all : all.filter((t) => t.status === statusFilter);

  const tabCounts = {
    all:        all.length,
    active:     all.filter((t) => t.status === 'active').length,
    draft:      all.filter((t) => t.status === 'draft').length,
    deprecated: all.filter((t) => t.status === 'deprecated').length,
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-parchment/10 bg-navy/20">
        <div className="flex items-center gap-3">
          <BrainIcon size={24} weight="duotone" className="text-gold" />
          <div>
            <h1 className="font-serif font-bold text-parchment text-xl">תבניות פרוצדורליות</h1>
            <p className="text-parchment/50 text-sm mt-0.5">
              תבניות שנלמדו על ידי המערכת — מסדירות ציר משימות אוטומטי לכל סוג תיק
            </p>
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="px-6 py-3 border-b border-parchment/10 flex items-center gap-2">
        {(['all', 'active', 'draft', 'deprecated'] as const).map((s) => {
          const labels: Record<StatusFilter, string> = {
            all: 'הכל', active: 'פעיל', draft: 'טיוטה', deprecated: 'מיושן',
          };
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors
                ${statusFilter === s
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : 'text-parchment/50 hover:text-parchment border border-transparent'}`}
            >
              {labels[s]}
              <span className="mr-1.5 text-parchment/30">{tabCounts[s]}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-parchment/40 text-sm">טוען תבניות…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <BrainIcon size={40} className="text-parchment/20" />
            <p className="text-parchment/40 text-sm">
              {statusFilter === 'all'
                ? 'לא נוצרו תבניות עדיין. פתח תיק חדש עם סוג תיק שאינו מוכר כדי ללמד את המערכת.'
                : `אין תבניות בסטטוס "${STATUS_LABEL[statusFilter] ?? statusFilter}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((tpl) => {
              const expanded   = expandedId === tpl.id;
              const milestones = (tpl.milestones ?? []) as (MilestoneDraft & { id: number; sequenceOrder: number })[];
              const isBusy     = approveMutation.isPending || deprecateMutation.isPending;

              return (
                <div key={tpl.id} className="bg-navy/40 border border-parchment/10 rounded-xl overflow-hidden">
                  {/* Template header row */}
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex flex-col items-center shrink-0 w-16">
                      <GavelIcon size={20} weight="duotone" className="text-gold mb-1" />
                      <span className="text-parchment/50 text-xs">
                        {CASE_TYPE_LABELS[tpl.caseType] ?? tpl.caseType}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-parchment text-sm">{tpl.nameHe}</p>
                        <span className={STATUS_BADGE[tpl.status] ?? ''}>{STATUS_LABEL[tpl.status] ?? tpl.status}</span>
                        {tpl.aiGenerated && (
                          <span className="flex items-center gap-1 text-xs text-gold bg-gold/10 border border-gold/20 rounded px-1.5 py-0.5">
                            <BrainIcon size={10} />AI
                          </span>
                        )}
                      </div>
                      {tpl.legalBasis && (
                        <p className="text-parchment/40 text-xs mt-0.5 truncate">{tpl.legalBasis}</p>
                      )}
                      <p className="text-parchment/30 text-xs mt-0.5">
                        {milestones.length} שלבים · נוצר {new Date(tpl.createdAt).toLocaleDateString('he-IL')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {tpl.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => void approveMutation.mutateAsync(tpl.id)}
                          disabled={isBusy}
                          className="p-1.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                          title="אשר תבנית"
                        >
                          <SealCheckIcon size={14} />
                        </button>
                      )}
                      {tpl.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => void deprecateMutation.mutateAsync(tpl.id)}
                          disabled={isBusy}
                          className="p-1.5 rounded bg-parchment/10 text-parchment/40 hover:text-orange-400 transition-colors"
                          title="הצא לגמלאות"
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : tpl.id)}
                        className="p-1.5 rounded text-parchment/40 hover:text-parchment/70 transition-colors"
                        title={expanded ? 'כווץ' : 'הצג שלבים'}
                      >
                        {expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded milestones */}
                  {expanded && (
                    <div className="border-t border-parchment/10 px-4 py-3 space-y-1 bg-navy/20">
                      {milestones.length === 0 ? (
                        <p className="text-parchment/30 text-xs">אין שלבים מוגדרים</p>
                      ) : milestones.map((m) => (
                        <div key={m.id} className="flex items-start gap-2.5 py-1">
                          <span className="text-parchment/20 text-xs font-mono w-5 shrink-0 text-center mt-0.5">
                            {m.sequenceOrder}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-parchment/80 text-xs font-medium">{m.titleHe}</p>
                            <p className="text-parchment/30 text-xs">
                              {m.dayOffset !== null ? `${m.dayOffset} ימים · ` : ''}
                              {m.anchor ?? 'filing'}
                              {!m.isMandatory ? ' · אופציונלי' : ''}
                              {m.taskPriority && m.taskPriority !== 'normal' ? ` · ${m.taskPriority}` : ''}
                            </p>
                          </div>
                          {m.isMandatory
                            ? <CheckCircleIcon  size={13} className="text-green-400/50 shrink-0 mt-0.5" />
                            : <WarningCircleIcon size={13} className="text-parchment/20 shrink-0 mt-0.5"  />
                          }
                        </div>
                      ))}

                      {tpl.sourceUrl && (
                        <p className="text-parchment/20 text-xs pt-2 border-t border-parchment/10 truncate">
                          מקור: {tpl.sourceUrl}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
