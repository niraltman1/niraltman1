import { useState } from 'react';
import {
  GavelIcon, ArrowRightIcon, BrainIcon, CheckCircleIcon,
  CalendarBlankIcon, XIcon, MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import {
  useCreateCase, useClients, useTemplateByCaseType,
  useApplyTemplate, type MilestoneDraft,
} from '@/api/hooks.js';
import { LearningModePanel } from './LearningModePanel.js';

const CASE_TYPE_OPTIONS = [
  { value: 'civil',          label: 'אזרחי'  },
  { value: 'criminal',       label: 'פלילי'  },
  { value: 'family',         label: 'משפחה'  },
  { value: 'labour',         label: 'עבודה'  },
  { value: 'administrative', label: 'מנהלי'  },
] as const;

type Step = 'details' | 'template' | 'done';

interface Props {
  defaultClientId?: number;
  onClose:          () => void;
  onCreated?:       (caseId: number) => void;
}

interface CasePayload {
  id:        number;
  caseType:  string;
  titleHe:   string;
}

export function NewCaseWizard({ defaultClientId, onClose, onCreated }: Props) {
  const createCase   = useCreateCase();
  const applyTpl     = useApplyTemplate();
  const { data: clientsData } = useClients(1, 200);
  const clients = (clientsData?.items ?? []) as Record<string, unknown>[];

  const [step,         setStep]         = useState<Step>('details');
  const [newCase,      setNewCase]      = useState<CasePayload | null>(null);
  const [anchorDate,   setAnchorDate]   = useState(new Date().toISOString().slice(0, 10));
  const [tasksCreated, setTasksCreated] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [skipTemplate, setSkipTemplate] = useState(false);

  const [form, setForm] = useState({
    caseNumber:  '',
    caseType:    'civil' as string,
    titleHe:     '',
    courtName:   '',
    status:      'open',
    openedDate:  new Date().toISOString().slice(0, 10),
    notes:       '',
    clientId:    defaultClientId ? String(defaultClientId) : '',
  });

  // Only fetch template data once we know the case type
  const { data: tplData, isLoading: tplLoading } = useTemplateByCaseType(
    step === 'template' && newCase ? newCase.caseType : null,
  );

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) =>
        String(c['nameHe'] ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
        String(c['idNumber'] ?? '').includes(clientSearch),
      )
    : clients;

  function setField<K extends keyof typeof form>(field: K, val: string) {
    setForm((prev) => ({ ...prev, [field]: val }));
  }

  const canProceed =
    form.caseNumber.trim().length > 0 &&
    form.titleHe.trim().length > 0 &&
    form.clientId !== '';

  async function handleCreateCase() {
    if (!canProceed) return;
    const result = await createCase.mutateAsync({
      caseNumber: form.caseNumber,
      caseType:   form.caseType,
      titleHe:    form.titleHe,
      courtName:  form.courtName   || null,
      status:     form.status,
      openedDate: form.openedDate  || null,
      notes:      form.notes       || null,
      clientId:   Number(form.clientId),
    });
    setNewCase({ id: result.id, caseType: form.caseType, titleHe: form.titleHe });
    setStep('template');
  }

  async function handleApplyTemplate(templateId: number) {
    if (!newCase) return;
    const res = await applyTpl.mutateAsync({ caseId: newCase.id, templateId, anchorDate });
    setTasksCreated((res as { tasksCreated: number }).tasksCreated);
    setStep('done');
    onCreated?.(newCase.id);
  }

  function handleSkipTemplate() {
    if (newCase) {
      setStep('done');
      onCreated?.(newCase.id);
    }
  }

  function handleLearningSaved() {
    // template saved — re-trigger template check by toggling skipTemplate
    setSkipTemplate(false);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-navy/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside
        className="w-full max-w-lg bg-navy-100 border-r border-parchment/10 h-full flex flex-col shadow-2xl overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-parchment/10 shrink-0">
          <div className="flex items-center gap-3">
            <GavelIcon size={20} weight="duotone" className="text-gold" />
            <h2 className="font-serif font-bold text-parchment text-lg">אשף תיק חדש</h2>
          </div>
          <button onClick={onClose} className="text-parchment/40 hover:text-parchment/70">
            <XIcon size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-parchment/10 bg-navy/30 shrink-0">
          {(['details', 'template', 'done'] as const).map((s, i) => {
            const labels = ['פרטי תיק', 'תבנית פרוצדורלית', 'סיום'];
            const done   = step === 'done' || (step === 'template' && i === 0);
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${active ? 'bg-gold text-navy' : done ? 'bg-green-500 text-white' : 'bg-parchment/10 text-parchment/30'}`}>
                  {done && !active ? '✓' : i + 1}
                </div>
                <span className={`text-xs ${active ? 'text-parchment' : 'text-parchment/40'}`}>{labels[i]}</span>
                {i < 2 && <ArrowRightIcon size={12} className="text-parchment/20 rotate-180" />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Case Details ─────────────────────────────────────── */}
        {step === 'details' && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {/* Client selector */}
            {!defaultClientId && (
              <div>
                <label className="block text-xs text-parchment/60 mb-1">
                  לקוח <span className="text-red-400">*</span>
                </label>
                <div className="relative mb-1">
                  <MagnifyingGlassIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-parchment/40 pointer-events-none" />
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="חיפוש לקוח…"
                    className="form-input pr-8 text-sm"
                  />
                </div>
                <select
                  value={form.clientId}
                  onChange={(e) => setField('clientId', e.target.value)}
                  required
                  size={4}
                  className="form-input text-sm"
                >
                  <option value="" disabled>בחר לקוח</option>
                  {filteredClients.map((c) => (
                    <option key={c['id'] as number} value={String(c['id'])}>
                      {c['nameHe'] as string}{c['idNumber'] ? ` — ${c['idNumber'] as string}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-parchment/60 mb-1">מספר תיק <span className="text-red-400">*</span></label>
              <input type="text" value={form.caseNumber} onChange={(e) => setField('caseNumber', e.target.value)}
                className="form-input" dir="ltr" placeholder="2024/1234" />
            </div>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">כותרת תיק <span className="text-red-400">*</span></label>
              <input type="text" value={form.titleHe} onChange={(e) => setField('titleHe', e.target.value)}
                className="form-input" dir="rtl" placeholder="תיאור קצר של התיק" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-parchment/60 mb-1">סוג תיק</label>
                <select value={form.caseType} onChange={(e) => setField('caseType', e.target.value)} className="form-input">
                  {CASE_TYPE_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-parchment/60 mb-1">סטטוס</label>
                <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="form-input">
                  <option value="open">פתוח</option>
                  <option value="closed">סגור</option>
                  <option value="suspended">מושהה</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-parchment/60 mb-1">בית משפט</label>
                <input type="text" value={form.courtName} onChange={(e) => setField('courtName', e.target.value)}
                  className="form-input" dir="rtl" placeholder="שלום תל אביב" />
              </div>
              <div>
                <label className="block text-xs text-parchment/60 mb-1">תאריך פתיחה</label>
                <input type="date" value={form.openedDate} onChange={(e) => setField('openedDate', e.target.value)}
                  className="form-input" dir="ltr" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-parchment/60 mb-1">הערות</label>
              <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                rows={2} className="form-input resize-none" dir="rtl" />
            </div>

            {createCase.isError && (
              <p className="text-red-400 text-sm bg-red-500/10 rounded px-3 py-2">שגיאה ביצירת התיק. אנא נסה שוב.</p>
            )}
          </div>
        )}

        {/* ── Step 2: Template ─────────────────────────────────────────── */}
        {step === 'template' && newCase && (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {tplLoading ? (
              <div className="flex items-center justify-center py-16 text-parchment/40 text-sm">בודק תבניות…</div>
            ) : tplData?.exists && tplData.template && !skipTemplate ? (
              /* Template exists — offer to apply */
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircleIcon size={18} weight="fill" className="text-green-400 shrink-0" />
                  <div>
                    <p className="text-green-300 text-sm font-semibold">נמצאה תבנית פרוצדורלית!</p>
                    <p className="text-parchment/50 text-xs mt-0.5">{tplData.template.nameHe}</p>
                  </div>
                </div>

                <div className="bg-navy/40 border border-parchment/10 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-parchment/50 font-medium">
                    {tplData.template.milestones.length} אבני דרך בתבנית:
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {tplData.template.milestones.map((m: MilestoneDraft & { id: number; sequenceOrder: number }) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-parchment/70">
                        <span className="text-parchment/30 font-mono w-4 text-center">{m.sequenceOrder}.</span>
                        <span>{m.titleHe}</span>
                        {m.dayOffset !== null && (
                          <span className="text-parchment/30">({m.dayOffset} ימים)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs text-parchment/60 mb-1">
                    <CalendarBlankIcon size={14} className="text-gold" />
                    תאריך עוגן (הגשה / פתיחת תיק)
                  </label>
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                  <p className="text-xs text-parchment/30 mt-1">מועדי המשימות יחושבו יחסית לתאריך זה</p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleApplyTemplate(tplData.template!.id)}
                    disabled={applyTpl.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded bg-gold text-navy
                               font-semibold text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors"
                  >
                    <CheckCircleIcon size={16} weight="bold" />
                    {applyTpl.isPending ? 'מחיל…' : 'החל תבנית וצור משימות'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipTemplate}
                    className="px-4 py-2.5 rounded border border-parchment/20 text-parchment/50 hover:text-parchment text-sm"
                  >
                    דלג
                  </button>
                </div>
              </div>
            ) : (
              /* No template — show LearningModePanel */
              <LearningModePanel
                caseType={newCase.caseType}
                onSaved={(templateId) => {
                  // template saved, now apply it
                  void applyTpl.mutateAsync({ caseId: newCase.id, templateId, anchorDate })
                    .then((res) => {
                      setTasksCreated((res as { tasksCreated: number }).tasksCreated);
                      setStep('done');
                      onCreated?.(newCase.id);
                    });
                }}
                onSkip={handleSkipTemplate}
              />
            )}
          </div>
        )}

        {/* ── Step 3: Done ─────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <CheckCircleIcon size={36} weight="fill" className="text-green-400" />
            </div>
            <div>
              <p className="font-serif font-bold text-parchment text-xl">התיק נפתח בהצלחה!</p>
              <p className="text-parchment/60 text-sm mt-2">
                {newCase?.titleHe}
                {tasksCreated !== null && (
                  <><br /><span className="text-gold font-semibold">{tasksCreated} משימות</span> נוצרו אוטומטית מהתבנית הפרוצדורלית.</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded bg-gold text-navy font-semibold text-sm hover:bg-gold/90"
            >
              סגור
            </button>
          </div>
        )}

        {/* Footer for step 1 */}
        {step === 'details' && (
          <div className="px-5 py-4 border-t border-parchment/10 flex gap-3 shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded border border-parchment/20 text-parchment/70 hover:text-parchment text-sm">
              ביטול
            </button>
            <button
              type="button"
              onClick={() => void handleCreateCase()}
              disabled={!canProceed || createCase.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-gold text-navy
                         font-semibold text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors"
            >
              {createCase.isPending ? 'שומר…' : 'המשך'}
              {!createCase.isPending && <ArrowRightIcon size={14} className="rotate-180" />}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
