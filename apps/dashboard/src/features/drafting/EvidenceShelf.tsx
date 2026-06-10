import { ArchiveIcon, PlusCircleIcon, CheckCircleIcon } from '@phosphor-icons/react';
import {
  useDraftShelf, useMarkShelfItemInserted, useRemoveFromShelf,
  type EvidenceShelfItemRecord,
} from '@/api/hooks.js';
import type { Editor } from '@tiptap/react';

const SHELF_TYPE_LABEL: Record<string, string> = {
  case:        'פסיקה',
  legislation: 'חקיקה',
  precedent:   'תקדים',
  note:        'הערה',
  ai_output:   'AI',
  excerpt:     'ציטוט',
  document:    'מסמך',
};

interface Props {
  draftId: number;
  editor:  Editor | null;
}

function ShelfItem({
  item,
  draftId,
  editor,
}: {
  item: EvidenceShelfItemRecord;
  draftId: number;
  editor: Editor | null;
}) {
  const markInserted = useMarkShelfItemInserted();
  const removeItem   = useRemoveFromShelf();

  const handleInsert = () => {
    if (!editor) return;

    // Insert content as a blockquote or paragraph depending on type
    if (item.content_he) {
      editor.chain().focus().insertContent({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: item.content_he }],
        }],
      }).run();
    } else if (item.source_ref) {
      // Insert as a citation node
      editor.chain().focus().insertContent({
        type: 'citation',
        attrs: {
          citationRef: item.source_ref,
          entityType:  item.entity_type ?? 'legislation',
          entityId:    item.entity_id ?? null,
        },
      }).run();
    }

    markInserted.mutate({ draftId, itemId: item.id });
  };

  return (
    <div
      className={`bg-navy-900/40 border rounded-lg p-3 space-y-1.5 transition-opacity ${
        item.is_inserted ? 'opacity-50 border-parchment/5' : 'border-parchment/10'
      }`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] text-parchment/30 bg-parchment/5 rounded px-1">
              {SHELF_TYPE_LABEL[item.shelf_type] ?? item.shelf_type}
            </span>
            {item.is_inserted === 1 && (
              <CheckCircleIcon size={10} className="text-green-400 shrink-0" />
            )}
          </div>
          <p className="text-parchment/80 text-xs leading-relaxed line-clamp-2">{item.title}</p>
          {item.source_ref && (
            <p className="text-parchment/30 text-[10px] font-mono mt-0.5 truncate">{item.source_ref}</p>
          )}
        </div>
      </div>

      {item.content_he && (
        <p className="text-parchment/50 text-[11px] leading-relaxed line-clamp-3 border-r-2 border-gold/20 pr-2">
          {item.content_he.slice(0, 200)}
          {item.content_he.length > 200 ? '…' : ''}
        </p>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={handleInsert}
          disabled={markInserted.isPending || item.is_inserted === 1}
          className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1 bg-gold/10 text-gold border border-gold/20 rounded hover:bg-gold/20 transition-colors disabled:opacity-40"
        >
          <PlusCircleIcon size={11} />
          הכנס לטיוטה
        </button>
        <button
          onClick={() => removeItem.mutate({ draftId, itemId: item.id })}
          disabled={removeItem.isPending}
          className="p-1 text-parchment/30 hover:text-parchment/60 transition-colors"
          title="הסר מהמדף"
        >
          <ArchiveIcon size={11} />
        </button>
      </div>
    </div>
  );
}

export function EvidenceShelf({ draftId, editor }: Props) {
  const { data: items, isLoading } = useDraftShelf(draftId);

  if (isLoading) {
    return <div className="text-parchment/30 text-xs text-center py-4">טוען מדף...</div>;
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-6 space-y-1">
        <p className="text-parchment/30 text-xs">המדף ריק</p>
        <p className="text-parchment/20 text-[10px]">שלח סעיפים מהחקיקה או תקדימים למדף</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ShelfItem key={item.id} item={item} draftId={draftId} editor={editor} />
      ))}
    </div>
  );
}
