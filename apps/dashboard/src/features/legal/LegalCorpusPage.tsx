import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenIcon, MagnifyingGlassIcon, SpinnerIcon, ArrowRightIcon,
} from '@phosphor-icons/react';
import {
  useLegalSources, useLegalSource, useLegalCorpusSearch,
  useCreateDraft, useAddToShelf, useDraftsUsingSection,
} from '@/api/hooks.js';
import type { LegalSourceRecord, LegalSectionRecord } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

const DOMAIN_LABELS: Record<string, string> = {
  civil:          'אזרחי',
  criminal:       'פלילי',
  family:         'משפחה',
  labour:         'עבודה',
  administrative: 'מנהלי',
  traffic:        'תעבורה',
  commercial:     'מסחרי',
  general:        'כללי',
};

function SectionDetail({
  section,
  sourceKey,
  onSendToShelf,
  onSendToDraft,
}: {
  section: LegalSectionRecord;
  sourceKey: string;
  onSendToShelf: () => void;
  onSendToDraft: () => void;
}) {
  const { data: draftsUsing } = useDraftsUsingSection(`${sourceKey}::${section.section_label}`);
  const count = draftsUsing?.length ?? 0;

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-parchment/40 text-xs font-mono">{section.section_label}</p>
          {section.heading_he && (
            <h3 className="text-parchment font-medium text-sm mt-0.5">{section.heading_he}</h3>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onSendToShelf}
            className="px-2.5 py-1 text-xs bg-gold/10 text-gold border border-gold/30 rounded hover:bg-gold/20 transition-colors"
          >
            שלח למדף
          </button>
          <button
            onClick={onSendToDraft}
            className="px-2.5 py-1 text-xs bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded hover:bg-blue-400/20 transition-colors"
          >
            טיוטה חדשה
          </button>
        </div>
      </div>

      {section.verbatim_text_he && (
        <div className="bg-navy-900/40 border border-parchment/10 rounded-lg p-3 max-h-64 overflow-y-auto">
          <pre className="font-mono text-xs text-parchment/80 whitespace-pre-wrap leading-relaxed" dir="rtl">
            {section.verbatim_text_he}
          </pre>
        </div>
      )}

      {count > 0 && (
        <p className="text-parchment/40 text-xs">
          הסמכות הזו שימשה ב-{count} טיוטות קודמות
        </p>
      )}
    </div>
  );
}

function SourcePanel({ sourceKey }: { sourceKey: string }) {
  const { data, isLoading } = useLegalSource(sourceKey);
  const [selectedSection, setSelectedSection] = useState<LegalSectionRecord | null>(null);
  const createDraft = useCreateDraft();
  const addToShelf  = useAddToShelf();
  const navigate    = useNavigate();
  const { selectedDraftId } = useUIStore();

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <SpinnerIcon size={20} className="animate-spin text-gold" />
    </div>
  );
  if (!data) return <p className="text-parchment/30 text-sm text-center py-8">לא נמצא</p>;

  const { source, sections } = data;

  const handleSendToDraft = (section: LegalSectionRecord) => {
    createDraft.mutate({
      title: `${source.short_name ?? source.title_he} · ${section.heading_he ?? section.section_label}`,
      contentJson: JSON.stringify({
        type: 'doc',
        content: [{
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: section.heading_he ?? section.section_label }],
        }, {
          type: 'paragraph',
          content: [{ type: 'text', text: section.verbatim_text_he ?? '' }],
        }],
      }),
    }, {
      onSuccess: (draft) => navigate(`/drafting/${draft.id}`),
    });
  };

  const handleSendToShelf = (section: LegalSectionRecord) => {
    const shelfPayload = (draftId: number) => ({
      draftId,
      shelfType:  'legislation' as const,
      title:      `${source.short_name ?? ''} · ${section.heading_he ?? section.section_label}`,
      sourceRef:  `${sourceKey}::${section.section_label}`,
      ...(section.verbatim_text_he ? { contentHe: section.verbatim_text_he } : {}),
    });
    if (!selectedDraftId) {
      createDraft.mutate({ title: 'טיוטה חדשה' }, {
        onSuccess: (draft) => {
          addToShelf.mutate(shelfPayload(draft.id));
          navigate(`/drafting/${draft.id}`);
        },
      });
    } else {
      addToShelf.mutate(shelfPayload(selectedDraftId));
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4">
        <h2 className="text-parchment font-semibold">{source.title_he}</h2>
        {source.citation && <p className="text-parchment/40 text-xs mt-0.5">{source.citation}</p>}
        <p className="text-parchment/30 text-xs mt-1">{source.section_count} סעיפים</p>
      </div>

      {sections.map((s) => (
        <div
          key={s.id}
          className={`bg-navy-100 border rounded-lg p-3 cursor-pointer transition-colors ${
            selectedSection?.id === s.id ? 'border-gold/40' : 'border-parchment/10 hover:border-parchment/20'
          }`}
          onClick={() => setSelectedSection(selectedSection?.id === s.id ? null : s)}
        >
          <div className="flex items-center gap-2">
            <span className="text-parchment/40 text-xs font-mono shrink-0">{s.section_label}</span>
            <span className="text-parchment text-sm truncate">{s.heading_he ?? '—'}</span>
          </div>
          {selectedSection?.id === s.id && (
            <div className="mt-3 pt-3 border-t border-parchment/10">
              <SectionDetail
                section={s}
                sourceKey={sourceKey}
                onSendToShelf={() => handleSendToShelf(s)}
                onSendToDraft={() => handleSendToDraft(s)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function LegalCorpusPage() {
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey]       = useState<string | null>(null);
  const [searchQuery, setSearchQuery]       = useState('');
  const { data: sourcesData, isLoading }    = useLegalSources();
  const { data: searchResults }             = useLegalCorpusSearch(searchQuery);

  const sources = (sourcesData?.sources ?? []) as LegalSourceRecord[];
  const domains = Array.from(new Set(sources.map((s) => s.procedure_domain).filter(Boolean))) as string[];

  const filteredSources = selectedDomain
    ? sources.filter((s) => s.procedure_domain === selectedDomain)
    : sources;

  return (
    <div className="flex h-full gap-0" dir="rtl">
      {/* Left sidebar — source list */}
      <div className="w-72 shrink-0 border-l border-parchment/10 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-parchment/10 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpenIcon size={18} className="text-gold" weight="duotone" />
            <h1 className="text-parchment font-semibold text-sm">מאגר חקיקה</h1>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon size={14} className="absolute right-2.5 top-2.5 text-parchment/30" />
            <input
              type="text"
              dir="rtl"
              placeholder="חיפוש בחקיקה..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-navy-900/60 border border-parchment/20 rounded-lg pr-8 pl-3 py-1.5 text-sm text-parchment placeholder:text-parchment/30 outline-none focus:border-gold/40"
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setSelectedDomain(undefined)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${selectedDomain === undefined ? 'bg-gold/20 text-gold border border-gold/30' : 'text-parchment/40 hover:text-parchment'}`}
            >
              הכל
            </button>
            {domains.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDomain(d)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${selectedDomain === d ? 'bg-gold/20 text-gold border border-gold/30' : 'text-parchment/40 hover:text-parchment'}`}
              >
                {DOMAIN_LABELS[d] ?? d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <SpinnerIcon size={20} className="animate-spin text-gold" />
            </div>
          ) : filteredSources.map((src) => (
            <button
              key={src.source_key}
              onClick={() => { setSelectedKey(src.source_key); setSearchQuery(''); }}
              className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedKey === src.source_key
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-parchment/70 hover:bg-navy-100/50 hover:text-parchment'
              }`}
            >
              <p className="truncate">{src.short_name ?? src.title_he}</p>
              <p className="text-parchment/30 text-xs mt-0.5">{src.section_count} סעיפים</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right content panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {searchQuery.trim().length >= 2 ? (
          <div className="space-y-3" dir="rtl">
            <p className="text-parchment/50 text-xs">
              {searchResults?.length ?? 0} תוצאות עבור "{searchQuery}"
            </p>
            {(searchResults ?? []).map((hit) => (
              <div key={hit.id} className="bg-navy-100 border border-parchment/10 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-parchment/40 text-xs">{hit.source_title_he} · {hit.section_label}</p>
                    {hit.heading_he && <p className="text-parchment text-sm font-medium mt-0.5">{hit.heading_he}</p>}
                  </div>
                  <button
                    onClick={() => { setSelectedKey(hit.source_key); setSearchQuery(''); }}
                    className="flex items-center gap-1 text-xs text-gold hover:underline shrink-0"
                  >
                    <ArrowRightIcon size={12} />
                    עיין
                  </button>
                </div>
                {hit.verbatim_text_he && (
                  <p className="text-parchment/60 text-xs leading-relaxed line-clamp-3" dir="rtl">
                    {hit.verbatim_text_he.slice(0, 300)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : selectedKey ? (
          <SourcePanel key={selectedKey} sourceKey={selectedKey} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <BookOpenIcon size={48} className="text-parchment/15" />
            <div>
              <p className="text-parchment/50 text-sm">בחר חיקוק מהרשימה</p>
              <p className="text-parchment/30 text-xs mt-1">או חפש בתוכן החקיקה</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
