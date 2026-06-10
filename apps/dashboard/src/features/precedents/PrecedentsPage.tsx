import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GavelIcon, CircleNotchIcon, CaretDownIcon, CaretUpIcon, PlusIcon, PlusCircleIcon,
} from '@phosphor-icons/react';
import {
  usePrecedents, useVerifyPrecedent, useCreatePrecedent, useAddToShelf, useCreateDraft,
  type PrecedentRecord, type PrecedentAnalysis,
} from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';
import { ConfidenceBadge } from '@/components/common/SharedComponents.js';

function AnalysisPanel({ analysis }: { analysis: PrecedentAnalysis }) {
  return (
    <div className="mt-3 border-t border-parchment/10 pt-3 space-y-3 text-sm" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="text-parchment/40 text-xs uppercase tracking-widest">ניתוח</span>
        <ConfidenceBadge value={analysis.confidence} />
      </div>
      {analysis.legal_analogy && (
        <div>
          <p className="text-parchment/50 text-xs mb-1">אנלוגיה משפטית</p>
          <p className="text-parchment/80 leading-relaxed">{analysis.legal_analogy}</p>
        </div>
      )}
      {analysis.distinguishing_risks && (
        <div>
          <p className="text-parchment/50 text-xs mb-1">סיכוני הבחנה</p>
          <p className="text-parchment/80 leading-relaxed">{analysis.distinguishing_risks}</p>
        </div>
      )}
      {analysis.drafted_arguments && (
        <div>
          <p className="text-parchment/50 text-xs mb-1">טיוטת טיעונים</p>
          <p className="text-parchment/80 leading-relaxed whitespace-pre-line">{analysis.drafted_arguments}</p>
        </div>
      )}
      <p className="text-parchment/25 text-[10px]">
        מודל: {analysis.model_version} · {new Date(analysis.created_at).toLocaleString('he-IL')}
      </p>
    </div>
  );
}

function PrecedentCard({ precedent }: { precedent: PrecedentRecord }) {
  const navigate    = useNavigate();
  const [expanded, setExpanded]   = useState(false);
  const [analysis, setAnalysis]   = useState<PrecedentAnalysis | null>(null);
  const verify      = useVerifyPrecedent();
  const addToShelf  = useAddToShelf();
  const createDraft = useCreateDraft();
  const { selectedDraftId, selectDraft } = useUIStore();

  const handleVerify = () => {
    verify.mutate(precedent.id, {
      onSuccess: (data) => { setAnalysis(data); setExpanded(true); },
    });
  };

  const handleSendToShelf = () => {
    const doSend = (draftId: number) => {
      addToShelf.mutate({
        draftId,
        shelfType:  'precedent',
        title:      precedent.citation,
        entityId:   precedent.id,
        entityType: 'precedent',
        ...(precedent.summary_he ? { contentHe: precedent.summary_he } : {}),
      });
    };
    if (selectedDraftId) {
      doSend(selectedDraftId);
    } else {
      createDraft.mutate({ title: 'טיוטה חדשה' }, {
        onSuccess: (d) => { selectDraft(d.id); doSend(d.id); navigate(`/drafting/${d.id}`); },
      });
    }
  };

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-parchment font-medium text-sm">{precedent.citation}</p>
          {precedent.case_title && (
            <p className="text-parchment/50 text-xs mt-0.5">{precedent.case_title}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {precedent.court_level && (
              <span className="badge badge-neutral text-xs">{precedent.court_level}</span>
            )}
            {precedent.decision_date && (
              <span className="text-parchment/40 text-xs">{precedent.decision_date}</span>
            )}
          </div>
          {precedent.summary_he && (
            <p className="text-parchment/50 text-xs mt-2 leading-relaxed line-clamp-2">
              {precedent.summary_he}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSendToShelf}
            className="flex items-center gap-1 text-[11px] px-2 py-1 text-gold bg-gold/10 border border-gold/20 rounded hover:bg-gold/20 transition-colors"
          >
            <PlusCircleIcon size={11} />
            שלח למדף
          </button>
          <button
            onClick={handleVerify}
            disabled={verify.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gold/10 text-gold border border-gold/30
                       rounded hover:bg-gold/20 transition-colors disabled:opacity-50"
          >
            {verify.isPending
              ? <CircleNotchIcon size={12} className="animate-spin" />
              : <GavelIcon size={12} />}
            {verify.isPending ? 'מאמת...' : 'אמת'}
          </button>
          {analysis && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="p-1.5 text-parchment/40 hover:text-parchment/70 transition-colors"
            >
              {expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
            </button>
          )}
        </div>
      </div>

      {expanded && analysis && <AnalysisPanel analysis={analysis} />}
    </div>
  );
}

function AddPrecedentForm({ onClose }: { onClose: () => void }) {
  const [citation, setCitation]   = useState('');
  const [caseTitle, setCaseTitle] = useState('');
  const [summaryHe, setSummaryHe] = useState('');
  const create                    = useCreatePrecedent();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!citation.trim()) return;
    create.mutate(
      { citation, case_title: caseTitle || null, court_level: null, decision_date: null, summary_he: summaryHe || null },
      { onSuccess: onClose },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="bg-navy-100 border border-parchment/10 rounded-lg p-4 space-y-3" dir="rtl">
      <p className="text-parchment/60 text-xs font-semibold uppercase tracking-widest">הוסף תקדים</p>
      <label className="flex flex-col gap-1">
        <span className="text-parchment/40 text-xs">ציטוט *</span>
        <input
          type="text" dir="rtl" value={citation}
          onChange={(e) => setCitation(e.target.value)}
          placeholder='ע"א 1234/21'
          className="bg-navy-900/60 border border-parchment/20 rounded px-2 py-1.5 text-sm text-parchment
                     outline-none focus:border-gold/60 transition-colors"
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-parchment/40 text-xs">כותרת תיק</span>
        <input
          type="text" dir="rtl" value={caseTitle}
          onChange={(e) => setCaseTitle(e.target.value)}
          placeholder="פלוני נ׳ אלמוני"
          className="bg-navy-900/60 border border-parchment/20 rounded px-2 py-1.5 text-sm text-parchment
                     outline-none focus:border-gold/60 transition-colors"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-parchment/40 text-xs">תמצית</span>
        <textarea
          dir="rtl" value={summaryHe}
          onChange={(e) => setSummaryHe(e.target.value)}
          rows={3}
          className="bg-navy-900/60 border border-parchment/20 rounded px-2 py-1.5 text-sm text-parchment
                     outline-none focus:border-gold/60 transition-colors resize-none"
        />
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose}
          className="px-3 py-1.5 text-xs text-parchment/50 hover:text-parchment transition-colors">
          ביטול
        </button>
        <button type="submit" disabled={create.isPending}
          className="px-4 py-1.5 text-xs bg-gold/20 text-gold border border-gold/30 rounded
                     hover:bg-gold/30 transition-colors disabled:opacity-50">
          {create.isPending ? 'שומר...' : 'שמור'}
        </button>
      </div>
    </form>
  );
}

export function PrecedentsPage() {
  const { data: precedents = [], isLoading } = usePrecedents();
  const [showForm, setShowForm]              = useState(false);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold text-parchment">תקדימים משפטיים</h1>
          <p className="text-parchment/50 text-sm mt-1">
            אמת התאמה ועובדות באמצעות מנוע law-il-E2B המקומי
          </p>
        </div>
        <button
          onClick={() => setShowForm((x) => !x)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gold/10 text-gold border border-gold/30
                     rounded hover:bg-gold/20 transition-colors"
        >
          <PlusIcon size={12} />
          הוסף תקדים
        </button>
      </div>

      {showForm && <AddPrecedentForm onClose={() => setShowForm(false)} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-parchment/30 text-sm">טוען...</div>
      ) : precedents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-parchment/30 gap-3">
          <GavelIcon size={40} weight="thin" />
          <span className="text-sm">אין תקדימים — הוסף את הראשון</span>
        </div>
      ) : (
        <div className="space-y-3">
          {precedents.map((p) => <PrecedentCard key={p.id} precedent={p} />)}
        </div>
      )}
    </div>
  );
}
