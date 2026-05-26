import { useState } from 'react';
import {
  BrainIcon, ArrowRightIcon, CheckCircleIcon, WarningCircleIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react';
import { useLearnTemplate, useSaveTemplate, type MilestoneDraft, type GeneratedSkeleton } from '@/api/hooks.js';
import { MilestoneEditor } from './MilestoneEditor.js';

const CASE_TYPE_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
};

const SUGGESTED_BASES: Record<string, string[]> = {
  criminal:       ['חוק סדר הדין הפלילי [נוסח משולב] תשמ"ב-1982', 'חוק העונשין תשל"ז-1977'],
  civil:          ['תקנות סדר הדין האזרחי תשע"ט-2018', 'חוק בית המשפט תשמ"ד-1984'],
  family:         ['חוק בית המשפט לענייני משפחה תשנ"ה-1995', 'חוק הכשרות המשפטית והאפוטרופסות תשכ"ב-1962'],
  labour:         ['חוק בית הדין לעבודה תשכ"ט-1969', 'חוק הסכמים קיבוציים תשי"ז-1957'],
  administrative: ['חוק בתי משפט לעניינים מנהליים תש"ס-2000', 'חוק הגישה לעניינים מנהליים תש"ן-1990'],
};

type Step = 'input' | 'processing' | 'review' | 'saved';

interface Props {
  caseType:  string;
  onSaved:   (templateId: number) => void;
  onSkip:    () => void;
}

export function LearningModePanel({ caseType, onSaved, onSkip }: Props) {
  const [step, setStep]           = useState<Step>('input');
  const [legalBasis, setLegalBasis] = useState(SUGGESTED_BASES[caseType]?.[0] ?? '');
  const [sourceText, setSourceText] = useState('');
  const [sourceUrl,  setSourceUrl]  = useState('');
  const [skeleton,   setSkeleton]   = useState<GeneratedSkeleton | null>(null);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [nameHe,     setNameHe]     = useState('');
  const [error,      setError]      = useState<string | null>(null);

  const learn = useLearnTemplate();
  const save  = useSaveTemplate();

  const caseLabel = CASE_TYPE_LABELS[caseType] ?? caseType;

  async function handleLearn() {
    if (!legalBasis.trim() || !sourceText.trim()) return;
    setError(null);
    setStep('processing');
    try {
      const result = await learn.mutateAsync({ caseType, legalBasis, sourceText, sourceUrl: sourceUrl || null });
      setSkeleton(result);
      setMilestones(result.milestones);
      setNameHe(legalBasis);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בעיבוד Ollama');
      setStep('input');
    }
  }

  async function handleSave() {
    if (!milestones.some((m) => m.titleHe.trim())) return;
    setError(null);
    try {
      const tpl = await save.mutateAsync({
        caseType,
        nameHe:      nameHe.trim() || legalBasis,
        legalBasis,
        sourceUrl:   sourceUrl || null,
        sourceText,
        aiGenerated: skeleton !== null,
        milestones,
      });
      setStep('saved');
      onSaved(tpl.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת התבנית');
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-gold/10 border border-gold/30 rounded-lg">
        <BrainIcon size={28} weight="duotone" className="text-gold shrink-0" />
        <div>
          <h3 className="font-serif font-bold text-parchment text-base">
            מצב למידה — סוג תיק חדש
          </h3>
          <p className="text-parchment/60 text-sm mt-0.5">
            סוג תיק <span className="text-gold font-semibold">"{caseLabel}"</span> אינו מוכר עדיין.
            הגדר את המסגרת החוקית כדי שהמערכת תלמד לבנות ציר זמן אוטומטי לתיקים עתידיים.
          </p>
        </div>
      </div>

      {/* ── Step 1: Input ─────────────────────────────────────────────────── */}
      {step === 'input' && (
        <div className="space-y-4">
          {/* Suggested legal bases */}
          {SUGGESTED_BASES[caseType] && (
            <div>
              <p className="text-xs text-parchment/50 mb-2">הצעות מקורות חוקיים:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_BASES[caseType]!.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setLegalBasis(s)}
                    className={`px-2.5 py-1 rounded border text-xs transition-colors
                      ${legalBasis === s
                        ? 'border-gold bg-gold/15 text-gold'
                        : 'border-parchment/20 text-parchment/60 hover:border-parchment/40'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              בסיס חוקי <span className="text-red-400">*</span>
            </label>
            <input
              className="form-input"
              value={legalBasis}
              onChange={(e) => setLegalBasis(e.target.value)}
              placeholder="שם החוק או הפקודה הרלוונטית"
              dir="rtl"
            />
          </div>

          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              טקסט הרגולציה <span className="text-red-400">*</span>
              <span className="text-parchment/30 mr-2">(הדבק סעיפים רלוונטיים)</span>
            </label>
            <textarea
              className="form-input resize-y font-mono text-xs"
              rows={8}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="הדבק כאן את נוסח הסעיפים הרלוונטיים מהחוק / תקנות / נוהל…"
              dir="rtl"
            />
          </div>

          <div>
            <label className="block text-xs text-parchment/60 mb-1">
              קישור למקור (אופציונלי)
            </label>
            <input
              className="form-input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.nevo.co.il/..."
              dir="ltr"
              type="url"
            />
          </div>

          {!!error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              <WarningCircleIcon size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleLearn()}
              disabled={!legalBasis.trim() || !sourceText.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded bg-gold text-navy
                         font-semibold text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors"
            >
              <BrainIcon size={16} weight="bold" />
              נתח עם Ollama
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-2.5 rounded border border-parchment/20 text-parchment/60
                         hover:text-parchment text-sm transition-colors"
            >
              דלג
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Processing ────────────────────────────────────────────── */}
      {step === 'processing' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-parchment/60">
          <CircleNotchIcon size={40} className="text-gold animate-spin" />
          <div className="text-center">
            <p className="font-semibold text-parchment">Ollama מנתח את הרגולציה…</p>
            <p className="text-sm mt-1">מחלץ אבני דרך פרוצדורליות. עשוי לקחת 15-60 שניות.</p>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Edit ─────────────────────────────────────────── */}
      {step === 'review' && skeleton && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircleIcon size={18} weight="fill" />
            <span>Ollama חילץ {milestones.length} שלבים — סקור, ערוך ואשר</span>
          </div>

          <div>
            <label className="block text-xs text-parchment/60 mb-1">שם התבנית</label>
            <input
              className="form-input"
              value={nameHe}
              onChange={(e) => setNameHe(e.target.value)}
              placeholder="שם לתבנית הפרוצדורלית"
              dir="rtl"
            />
          </div>

          <div>
            <p className="text-xs text-parchment/50 mb-2">
              אבני הדרך המוצעות — ניתן לגרור, לערוך ולהוסיף:
            </p>
            <MilestoneEditor milestones={milestones} onChange={setMilestones} />
          </div>

          {!!error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              <WarningCircleIcon size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={save.isPending || milestones.every((m) => !m.titleHe.trim())}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded bg-gold text-navy
                         font-semibold text-sm hover:bg-gold/90 disabled:opacity-40 transition-colors"
            >
              <CheckCircleIcon size={16} weight="bold" />
              {save.isPending ? 'שומר…' : 'אשר ושמור תבנית'}
            </button>
            <button
              type="button"
              onClick={() => setStep('input')}
              className="px-4 py-2.5 rounded border border-parchment/20 text-parchment/60
                         hover:text-parchment text-sm transition-colors"
            >
              חזור לעריכה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
