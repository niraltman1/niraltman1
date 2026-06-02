import { useState } from 'react';
import {
  NoteBlankIcon, BookmarkSimpleIcon, NotePencilIcon, TrashIcon, PlusIcon,
} from '@phosphor-icons/react';
import {
  useDocumentAnnotations, useCreateAnnotation, useDeleteAnnotation,
  type Annotation,
} from '@/api/hooks.js';

const TYPE_META: Record<Annotation['annotationType'], { label: string; icon: typeof NoteBlankIcon }> = {
  note:      { label: 'הערה',   icon: NoteBlankIcon },
  bookmark:  { label: 'סימנייה', icon: BookmarkSimpleIcon },
  highlight: { label: 'הדגשה',  icon: NotePencilIcon },
  redline:   { label: 'תיקון',  icon: NotePencilIcon },
};

interface Props {
  docId:       number;
  currentPage: number;
}

/**
 * Notes & bookmarks panel for a document. Local-first, additive over the existing
 * Annotations table. Coordinate-based (pixel) highlights are intentionally not added
 * here — they need hOCR from the OCR pipeline (tracked follow-up); page-scoped notes,
 * bookmarks and redlines work fully today.
 */
export function DocumentAnnotations({ docId, currentPage }: Props) {
  const { data: items = [], isLoading } = useDocumentAnnotations(docId);
  const createAnnotation = useCreateAnnotation(docId);
  const deleteAnnotation = useDeleteAnnotation(docId);

  const [noteText, setNoteText] = useState('');
  const [notePage, setNotePage] = useState(currentPage);

  const addNote = () => {
    const content = noteText.trim();
    if (!content) return;
    createAnnotation.mutate(
      { annotationType: 'note', pageNumber: notePage, content },
      { onSuccess: () => setNoteText('') },
    );
  };

  const addBookmark = () => {
    createAnnotation.mutate({
      annotationType: 'bookmark',
      pageNumber: currentPage,
      content: `עמוד ${currentPage}`,
    });
  };

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 overflow-auto flex flex-col gap-3" style={{ maxHeight: '78vh' }} dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest">
          הערות וסימניות
        </h2>
        <button
          onClick={addBookmark}
          disabled={createAnnotation.isPending}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-parchment/60 border border-parchment/15 rounded-lg hover:bg-parchment/5 disabled:opacity-40"
        >
          <BookmarkSimpleIcon size={13} />
          סמן עמוד {currentPage}
        </button>
      </div>

      {/* Add note */}
      <div className="space-y-2 border-b border-parchment/10 pb-3">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="הוסף הערה למסמך…"
          rows={2}
          className="w-full bg-navy-200 border border-parchment/15 rounded-lg p-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/40 resize-none"
          dir="rtl"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs text-parchment/40">
            עמוד
            <input
              type="number"
              min={1}
              value={notePage}
              onChange={(e) => setNotePage(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 bg-navy-200 border border-parchment/15 rounded px-1.5 py-0.5 text-parchment text-center"
            />
          </label>
          <button
            onClick={addNote}
            disabled={!noteText.trim() || createAnnotation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/30 bg-gold/10 rounded-lg hover:bg-gold/20 disabled:opacity-40"
          >
            <PlusIcon size={13} />
            הוסף הערה
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-parchment/30 text-sm">טוען…</p>
      ) : items.length === 0 ? (
        <p className="text-parchment/30 text-sm text-center py-6">אין הערות או סימניות עדיין</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const meta = TYPE_META[a.annotationType];
            const Icon = meta.icon;
            return (
              <li key={a.id} className="group flex items-start gap-2 bg-navy-200/50 border border-parchment/10 rounded-lg p-2.5">
                <Icon size={15} className="text-gold/70 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-parchment/40">
                    <span>{meta.label}</span>
                    <span>· עמוד {a.pageNumber}</span>
                  </div>
                  {a.content && (
                    <p className="text-parchment/80 text-sm whitespace-pre-wrap break-words mt-0.5">{a.content}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteAnnotation.mutate(a.id)}
                  className="text-parchment/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  aria-label="מחק"
                >
                  <TrashIcon size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
