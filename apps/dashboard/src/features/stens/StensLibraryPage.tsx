import { useState } from 'react';
import { FileDashedIcon, PlusIcon, RobotIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { useStensTemplates, useStensTemplate, useStensAiFill } from '@/api/hooks.js';
import type { StensTemplateRecord, StensSubmissionRecord } from '@/api/hooks.js';

const CATEGORY_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
  traffic:        'תעבורה',
  general:        'כללי',
};

interface FieldDef {
  name:     string;
  labelHe:  string;
  type:     'text' | 'date' | 'select';
  required?: boolean;
  options?:  string[];
  aiHint?:  string;
}

function StensFormModal({
  template,
  onClose,
}: {
  template:  StensTemplateRecord;
  onClose:   () => void;
}) {
  const fields: FieldDef[] = (() => {
    try { return JSON.parse(template.formSchema) as FieldDef[]; }
    catch { return []; }
  })();

  const [values,     setValues]     = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<StensSubmissionRecord | null>(null);
  const { mutate, isPending } = useStensAiFill();

  const setValue = (name: string, val: string) =>
    setValues((prev) => ({ ...prev, [name]: val }));

  const handleAiFill = () => {
    mutate({ templateId: template.id }, {
      onSuccess: (data) => {
        setValues(data.fieldValues);
        setSubmission(data.submission);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <div className="bg-navy-100 border border-parchment/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-parchment font-semibold">{template.nameHe}</h2>
            {template.legalBasis && (
              <p className="text-parchment/40 text-xs mt-0.5">{template.legalBasis}</p>
            )}
          </div>
          <button onClick={onClose} className="text-parchment/30 hover:text-parchment text-xs">✕</button>
        </div>

        {submission && (
          <div className="flex items-center gap-2 text-green-400 text-xs bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
            <CheckCircleIcon size={14} />
            <span>מולא על ידי AI</span>
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label className="text-parchment/60 text-xs">
                {field.labelHe}
                {field.required && <span className="text-red-400 mr-1">*</span>}
              </label>
              {field.type === 'select' && field.options ? (
                <select
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  className="w-full bg-navy-200 border border-parchment/10 rounded-lg px-3 py-2 text-parchment text-sm outline-none"
                >
                  <option value="">בחר...</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={values[field.name] ?? ''}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  className="w-full bg-navy-200 border border-parchment/10 rounded-lg px-3 py-2 text-parchment text-sm placeholder:text-parchment/30 outline-none focus:border-gold/40"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleAiFill}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-lg text-sm hover:bg-blue-400/20 transition-colors disabled:opacity-40"
          >
            <RobotIcon size={14} />
            {isPending ? 'ממלא...' : 'מלא באמצעות AI'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-parchment/40 text-sm hover:text-parchment transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

export function StensLibraryPage() {
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [selectedId,     setSelectedId]     = useState<number | null>(null);
  const { data: templates = [], isLoading } = useStensTemplates(activeCategory);
  const { data: selected } = useStensTemplate(selectedId);

  const categories = Array.from(new Set(templates.map((t: StensTemplateRecord) => t.category)));

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-6" dir="rtl">
      <div className="flex items-center gap-2">
        <FileDashedIcon size={20} className="text-gold" weight="duotone" />
        <h1 className="text-parchment font-semibold text-lg">ספריית טפסים (Stens)</h1>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setActiveCategory(undefined)}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            activeCategory === undefined ? 'bg-gold/20 text-gold border border-gold/30' : 'text-parchment/40 hover:text-parchment'
          }`}
        >
          הכל
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              activeCategory === cat ? 'bg-gold/20 text-gold border border-gold/30' : 'text-parchment/40 hover:text-parchment'
            }`}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-parchment/30 text-sm text-center py-12">טוען טפסים...</p>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <FileDashedIcon size={40} className="text-parchment/15" />
          <p className="text-parchment/30 text-sm">אין טפסים בספרייה</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((tmpl: StensTemplateRecord) => (
            <div
              key={tmpl.id}
              className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-2 hover:border-gold/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-parchment text-sm font-medium">{tmpl.nameHe}</p>
                  {tmpl.legalBasis && (
                    <p className="text-parchment/40 text-[11px] mt-0.5">{tmpl.legalBasis}</p>
                  )}
                </div>
                <span className="badge badge-neutral text-[10px] shrink-0">
                  {CATEGORY_LABELS[tmpl.category] ?? tmpl.category}
                </span>
              </div>
              <button
                onClick={() => setSelectedId(tmpl.id)}
                className="flex items-center gap-1.5 text-gold text-xs hover:underline"
              >
                <PlusIcon size={12} />
                מלא טופס
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <StensFormModal
          template={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
