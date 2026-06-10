import { Link, useNavigate } from 'react-router-dom';
import { ScalesIcon, LinkSimpleIcon, PlusCircleIcon } from '@phosphor-icons/react';
import { useCaseCitations, useAddToShelf, useCreateDraft, type CitationGroup } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  linked:     { label: 'מקושר',   color: '#7dd3fc' },
  unresolved: { label: 'לא פתור', color: '#e7c66b' },
  archived:   { label: 'בארכיון', color: '#a3a3a3' },
};

function CitationCard({ g }: { g: CitationGroup }) {
  const navigate    = useNavigate();
  const addToShelf  = useAddToShelf();
  const createDraft = useCreateDraft();
  const { selectedDraftId, selectDraft } = useUIStore();

  const st = STATUS_LABEL[g.status] ?? STATUS_LABEL['unresolved']!;
  const firstSnippet = g.locations.find((l) => l.snippet)?.snippet ?? null;
  const firstDoc = g.locations.find((l) => l.documentId != null)?.documentId ?? null;

  const handleSendToShelf = () => {
    const doSend = (draftId: number) => {
      addToShelf.mutate({
        draftId,
        shelfType: 'case',
        title:     g.citation,
        sourceRef: g.citation,
        ...(firstSnippet ? { contentHe: firstSnippet } : {}),
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
    <li className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ScalesIcon size={15} className="text-gold shrink-0" />
        <span className="text-parchment font-mono text-sm">{g.citation}</span>
        <span className="badge badge-neutral text-[10px]" style={{ color: st.color }}>{st.label}</span>
        {g.frequency > 1 && <span className="text-parchment/40 text-[11px]">×{g.frequency} במסמך</span>}
        {g.firmUsage > 0 && (
          <span className="text-[11px] mr-auto" style={{ color: 'var(--brand-gold-2)' }}>
            בשימוש ב-{g.firmUsage} תיקים נוספים
          </span>
        )}
        <button
          onClick={handleSendToShelf}
          className="mr-auto flex items-center gap-1 text-[11px] px-2 py-0.5 text-gold bg-gold/10 border border-gold/20 rounded hover:bg-gold/20 transition-colors"
        >
          <PlusCircleIcon size={10} />
          שלח למדף
        </button>
      </div>
      {firstSnippet && (
        <p className="text-parchment/50 text-xs leading-relaxed truncate" dir="rtl">…{firstSnippet}…</p>
      )}
      {firstDoc != null && (
        <Link to={`/documents/${firstDoc}/read?highlight=${encodeURIComponent(g.citation)}`}
          className="inline-flex items-center gap-1 text-gold/70 text-[11px] hover:underline">
          <LinkSimpleIcon size={11} />
          מקור במסמך
        </Link>
      )}
    </li>
  );
}

export function CaseCitations({ caseId }: { caseId: number }) {
  const { data: groups, isLoading } = useCaseCitations(caseId);

  if (isLoading) {
    return <div className="text-parchment/30 text-sm py-8 text-center">טוען אסמכתאות…</div>;
  }
  if ((groups?.length ?? 0) === 0) {
    return (
      <div className="bg-navy-100 border border-parchment/10 rounded-xl py-12 text-center">
        <ScalesIcon size={32} className="text-parchment/20 mx-auto mb-2" />
        <p className="text-parchment/50 text-sm">לא נמצאו אסמכתאות לתיק זה.</p>
        <p className="text-parchment/30 text-xs mt-1">אסמכתאות נאספות מהמסמכים (harvest) ומופיעות כאן עם תדירות ושימוש-חוזר.</p>
      </div>
    );
  }

  return <ul className="space-y-2" dir="rtl">{groups!.map((g) => <CitationCard key={g.key} g={g} />)}</ul>;
}
