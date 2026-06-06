import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileTextIcon, PlusIcon, GitForkIcon, ArchiveIcon,
  ClockIcon, CircleNotchIcon,
} from '@phosphor-icons/react';
import {
  useDrafts, useCreateDraft, useForkDraft, useArchiveDraft,
  useCases, useContacts,
  type DraftRecord,
} from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'טיוטה',   cls: 'badge-neutral' },
  review:   { label: 'בבדיקה', cls: 'badge-warning' },
  final:    { label: 'סופי',    cls: 'badge-success' },
  archived: { label: 'בארכיון', cls: 'badge-neutral' },
};

const DOC_TYPE_LABEL: Record<string, string> = {
  motion:   'בקשה',
  brief:    'סיכומים',
  letter:   'מכתב',
  contract: 'חוזה',
  opinion:  'חוות דעת',
  general:  'כללי',
};

function DraftCard({
  draft,
  onFork,
  onArchive,
}: {
  draft: DraftRecord;
  onFork: () => void;
  onArchive: () => void;
}) {
  const navigate = useNavigate();
  const { selectDraft, selectedDraftId } = useUIStore();
  const st = STATUS_LABEL[draft.status] ?? STATUS_LABEL['draft']!;
  const isSelected = selectedDraftId === draft.id;

  return (
    <div
      className={`bg-navy-100 border rounded-xl p-4 space-y-3 transition-colors ${
        isSelected ? 'border-gold/40' : 'border-parchment/10 hover:border-parchment/20'
      }`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge ${st.cls} text-[10px]`}>{st.label}</span>
            {draft.parent_draft_id && (
              <span className="flex items-center gap-1 text-parchment/30 text-[10px]">
                <GitForkIcon size={10} />
                מפוצל
              </span>
            )}
            <span className="text-parchment/30 text-[10px]">
              {DOC_TYPE_LABEL[draft.document_type] ?? draft.document_type}
            </span>
          </div>
          <h3 className="text-parchment text-sm font-medium mt-1 truncate">
            {draft.title}
          </h3>
        </div>
      </div>

      <div className="flex items-center gap-3 text-parchment/30 text-[10px]">
        <span>{draft.word_count} מילים</span>
        <span className="flex items-center gap-1">
          <ClockIcon size={10} />
          {new Date(draft.updated_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
        </span>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-parchment/10">
        <button
          onClick={() => { selectDraft(draft.id); navigate(`/drafting/${draft.id}`); }}
          className="flex-1 px-2 py-1 text-xs text-gold border border-gold/30 rounded hover:bg-gold/10 transition-colors text-center"
        >
          פתח
        </button>
        <button
          onClick={onFork}
          className="px-2 py-1 text-xs text-parchment/50 border border-parchment/20 rounded hover:bg-parchment/5 transition-colors"
          title="פצל"
        >
          <GitForkIcon size={12} />
        </button>
        <button
          onClick={onArchive}
          className="px-2 py-1 text-xs text-parchment/50 border border-parchment/20 rounded hover:bg-parchment/5 transition-colors"
          title="העבר לארכיון"
        >
          <ArchiveIcon size={12} />
        </button>
      </div>
    </div>
  );
}

function NewDraftModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, matterId: number | null, docType: string) => void;
}) {
  const [title, setTitle]       = useState('');
  const [matterId, setMatterId] = useState<number | null>(null);
  const [docType, setDocType]   = useState('general');
  const { data: casesData }     = useCases(1, 100);
  const cases = (casesData?.items ?? []) as Record<string, unknown>[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-navy-100 border border-parchment/20 rounded-2xl p-6 w-full max-w-md space-y-4" dir="rtl">
        <h2 className="text-parchment font-semibold text-base">טיוטה חדשה</h2>

        <div className="space-y-3">
          <div>
            <label className="text-parchment/50 text-xs block mb-1">כותרת</label>
            <input
              type="text"
              dir="rtl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="שם המסמך"
              className="w-full bg-navy-900/60 border border-parchment/20 rounded-lg px-3 py-2 text-parchment text-sm placeholder:text-parchment/30 outline-none focus:border-gold/40"
            />
          </div>

          <div>
            <label className="text-parchment/50 text-xs block mb-1">סוג מסמך</label>
            <select
              dir="rtl"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full bg-navy-900/60 border border-parchment/20 rounded-lg px-3 py-2 text-parchment text-sm outline-none focus:border-gold/40"
            >
              {Object.entries(DOC_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-parchment/50 text-xs block mb-1">תיק מקושר (אופציונלי)</label>
            <select
              dir="rtl"
              value={matterId ?? ''}
              onChange={(e) => setMatterId(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-navy-900/60 border border-parchment/20 rounded-lg px-3 py-2 text-parchment text-sm outline-none focus:border-gold/40"
            >
              <option value="">— ללא תיק מקושר —</option>
              {cases.map((c) => (
                <option key={c['id'] as number} value={c['id'] as number}>
                  {String(c['case_number'] ?? c['caseNumber'] ?? '')} — {String(c['title_he'] ?? c['titleHe'] ?? '')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onCreate(title || 'טיוטה חדשה', matterId, docType)}
            className="flex-1 px-4 py-2 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm hover:bg-gold/30 transition-colors"
          >
            צור טיוטה
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-parchment/50 border border-parchment/20 rounded-lg text-sm hover:bg-parchment/5 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

export function DraftingPage() {
  const navigate       = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: drafts, isLoading } = useDrafts(statusFilter ? { status: statusFilter } : undefined);
  const createDraft = useCreateDraft();
  const forkDraft   = useForkDraft();
  const archiveDraft = useArchiveDraft();
  const { selectDraft } = useUIStore();

  const handleCreate = (title: string, matterId: number | null, docType: string) => {
    createDraft.mutate(
      { title, ...(matterId !== null ? { matterId } : {}), documentType: docType },
      {
        onSuccess: (draft) => {
          setShowModal(false);
          selectDraft(draft.id);
          navigate(`/drafting/${draft.id}`);
        },
      },
    );
  };

  const handleFork = (draft: DraftRecord) => {
    forkDraft.mutate(
      { id: draft.id, forkReason: 'user' },
      { onSuccess: (forked) => { selectDraft(forked.id); navigate(`/drafting/${forked.id}`); } },
    );
  };

  const activeDrafts = (drafts ?? []).filter((d) => d.is_active === 1);
  const shown = statusFilter
    ? activeDrafts.filter((d) => d.status === statusFilter)
    : activeDrafts;

  return (
    <div className="space-y-5 p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileTextIcon size={20} className="text-gold" weight="duotone" />
          <h1 className="text-parchment font-semibold text-lg">טיוטות</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold/20 text-gold border border-gold/30 rounded-lg text-sm hover:bg-gold/30 transition-colors"
        >
          <PlusIcon size={14} />
          טיוטה חדשה
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap">
        {[undefined, 'draft', 'review', 'final'].map((s) => (
          <button
            key={s ?? 'all'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              statusFilter === s
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'text-parchment/40 hover:text-parchment border border-transparent'
            }`}
          >
            {s ? (STATUS_LABEL[s]?.label ?? s) : 'הכל'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <CircleNotchIcon size={24} className="animate-spin text-gold" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <FileTextIcon size={48} className="text-parchment/15" />
          <div>
            <p className="text-parchment/50 text-sm">אין טיוטות עדיין</p>
            <p className="text-parchment/30 text-xs mt-1">צור טיוטה חדשה כדי להתחיל</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onFork={() => handleFork(draft)}
              onArchive={() => archiveDraft.mutate(draft.id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <NewDraftModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
