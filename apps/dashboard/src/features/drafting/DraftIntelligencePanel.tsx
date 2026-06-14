import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenIcon, ScalesIcon, RobotIcon, LightbulbIcon,
  PlusCircleIcon, ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import {
  useDraftShelf, useLegalCorpusSearch, useCaseCitations, usePrecedents,
  useVerdictSearch, useAddToShelf,
  type DraftRecord, type LegalSectionSearchHit, type PrecedentRecord, type VerdictSearchHit,
} from '@/api/hooks.js';
import { EvidenceShelf } from './EvidenceShelf.js';
import type { Editor } from '@tiptap/react';

interface Props {
  draft:  DraftRecord;
  editor: Editor | null;
}

function IntelligenceItem({
  title,
  snippet,
  sourceLabel,
  onSendToShelf,
  onOpen,
  icon,
}: {
  title:        string;
  snippet?:     string;
  sourceLabel?: string;
  onSendToShelf: () => void;
  onOpen?:       () => void;
  icon:          React.ReactNode;
}) {
  return (
    <div className="bg-navy-900/40 border border-parchment/10 rounded-lg p-3 space-y-1.5" dir="rtl">
      <div className="flex items-start gap-2">
        <span className="text-parchment/30 shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-parchment/80 text-xs leading-relaxed">{title}</p>
          {sourceLabel && (
            <p className="text-parchment/30 text-[10px] font-mono mt-0.5 truncate">{sourceLabel}</p>
          )}
          {snippet && (
            <p className="text-parchment/50 text-[11px] leading-relaxed mt-1 line-clamp-2">{snippet}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onSendToShelf}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 text-gold bg-gold/10 border border-gold/20 rounded hover:bg-gold/20 transition-colors"
        >
          <PlusCircleIcon size={10} />
          שלח למדף
        </button>
        {onOpen && (
          <button
            onClick={onOpen}
            className="p-1 text-parchment/30 hover:text-parchment transition-colors"
            title="פתח"
          >
            <ArrowSquareOutIcon size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

export function DraftIntelligencePanel({ draft, editor }: Props) {
  const navigate    = useNavigate();
  const addToShelf  = useAddToShelf();
  const [tab, setTab] = useState<'shelf' | 'intel'>('shelf');

  // Seed search from draft title words (simple keyword extraction)
  const seedQuery = draft.title
    .replace(/[^֐-׿a-zA-Z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');

  const { data: legislationHits } = useLegalCorpusSearch(seedQuery);
  const { data: caseCitations }   = useCaseCitations(draft.matter_id);
  const { data: precedents }      = usePrecedents();
  const { data: shelfItems }      = useDraftShelf(draft.id);
  const { data: verdictHits }     = useVerdictSearch(seedQuery);

  const pendingShelf = (shelfItems ?? []).filter((i) => i.is_inserted === 0).length;

  const handleSendLegislation = useCallback((hit: LegalSectionSearchHit) => {
    addToShelf.mutate({
      draftId:   draft.id,
      shelfType: 'legislation',
      title:     `${hit.source_title_he} · ${hit.heading_he ?? hit.section_label}`,
      sourceRef: `${hit.source_key}::${hit.section_label}`,
      ...(hit.verbatim_text_he ? { contentHe: hit.verbatim_text_he } : {}),
    });
  }, [addToShelf, draft.id]);

  const handleSendCitation = useCallback((citation: string) => {
    addToShelf.mutate({
      draftId:   draft.id,
      shelfType: 'case',
      title:     citation,
      sourceRef: citation,
    });
  }, [addToShelf, draft.id]);

  const handleSendPrecedent = useCallback((p: PrecedentRecord) => {
    addToShelf.mutate({
      draftId:    draft.id,
      shelfType:  'precedent',
      title:      p.citation,
      entityId:   p.id,
      entityType: 'precedent',
      ...(p.summary_he ? { contentHe: p.summary_he } : {}),
    });
  }, [addToShelf, draft.id]);

  const handleSendVerdict = useCallback((v: VerdictSearchHit) => {
    addToShelf.mutate({
      draftId:   draft.id,
      shelfType: 'precedent',
      title:     v.caseName ?? v.caseNumber ?? 'פסק דין',
      sourceRef: v.docKey,
      ...(v.snippet ? { contentHe: v.snippet.replace(/\[|\]/g, '') } : {}),
    });
  }, [addToShelf, draft.id]);

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Tab switcher */}
      <div className="flex border-b border-parchment/10 shrink-0">
        <button
          onClick={() => setTab('shelf')}
          className={`flex-1 py-2 text-xs font-medium transition-colors relative ${
            tab === 'shelf' ? 'text-gold' : 'text-parchment/40 hover:text-parchment'
          }`}
        >
          מדף
          {pendingShelf > 0 && (
            <span className="absolute top-1.5 right-4 w-4 h-4 flex items-center justify-center bg-gold text-navy-900 rounded-full text-[9px] font-bold">
              {pendingShelf}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('intel')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            tab === 'intel' ? 'text-gold' : 'text-parchment/40 hover:text-parchment'
          }`}
        >
          הצעות
        </button>
      </div>

      {tab === 'shelf' ? (
        <div className="flex-1 overflow-y-auto p-3">
          <EvidenceShelf draftId={draft.id} editor={editor} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">

          {/* Legislation */}
          {(legislationHits?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="text-parchment/30 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                <BookOpenIcon size={10} />
                חקיקה רלוונטית
              </p>
              {legislationHits!.slice(0, 3).map((hit) => (
                <IntelligenceItem
                  key={hit.id}
                  title={hit.heading_he ?? hit.section_label}
                  {...(hit.verbatim_text_he ? { snippet: hit.verbatim_text_he.slice(0, 120) } : {})}
                  sourceLabel={`${hit.source_title_he} · ${hit.section_label}`}
                  onSendToShelf={() => handleSendLegislation(hit)}
                  onOpen={() => navigate('/legal-corpus')}
                  icon={<BookOpenIcon size={12} />}
                />
              ))}
            </section>
          )}

          {/* Case citations from linked matter */}
          {(caseCitations?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="text-parchment/30 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                <ScalesIcon size={10} />
                אסמכתאות בתיק
              </p>
              {caseCitations!.slice(0, 3).map((g) => {
                const snip = g.locations.find((l) => l.snippet)?.snippet;
                return (
                  <IntelligenceItem
                    key={g.key}
                    title={g.citation}
                    {...(snip ? { snippet: snip } : {})}
                    onSendToShelf={() => handleSendCitation(g.citation)}
                    icon={<ScalesIcon size={12} />}
                  />
                );
              })}
            </section>
          )}

          {/* Precedents */}
          {(precedents?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="text-parchment/30 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                <RobotIcon size={10} />
                תקדימים
              </p>
              {(precedents ?? []).slice(0, 3).map((p) => (
                <IntelligenceItem
                  key={p.id}
                  title={p.citation}
                  {...(p.summary_he ? { snippet: p.summary_he.slice(0, 120) } : {})}
                  onSendToShelf={() => handleSendPrecedent(p)}
                  onOpen={() => navigate('/precedents')}
                  icon={<ScalesIcon size={12} />}
                />
              ))}
            </section>
          )}

          {/* Verdict corpus suggestions */}
          {(verdictHits?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="text-parchment/30 text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                <ScalesIcon size={10} />
                פסיקה ישראלית
              </p>
              {verdictHits!.slice(0, 3).map((v) => (
                <IntelligenceItem
                  key={v.docKey}
                  title={v.caseName ?? v.caseNumber ?? 'פסק דין'}
                  {...(v.snippet ? { snippet: v.snippet.replace(/\[|\]/g, '').slice(0, 120) } : {})}
                  sourceLabel={[v.court, v.year?.toString(), v.caseNumber].filter(Boolean).join(' · ')}
                  onSendToShelf={() => handleSendVerdict(v)}
                  onOpen={() => navigate('/supreme-court')}
                  icon={<ScalesIcon size={12} />}
                />
              ))}
            </section>
          )}

          {(legislationHits?.length ?? 0) === 0 && (caseCitations?.length ?? 0) === 0 && (verdictHits?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <LightbulbIcon size={32} className="text-parchment/15" />
              <div>
                <p className="text-parchment/40 text-xs">אין הצעות כרגע</p>
                <p className="text-parchment/25 text-[10px] mt-1">שמור את הטיוטה כדי לרענן</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
