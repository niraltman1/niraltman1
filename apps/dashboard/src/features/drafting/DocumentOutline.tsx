import type { Editor } from '@tiptap/react';

interface OutlineItem {
  level: number;
  text: string;
  pos: number;
}

export function DocumentOutline({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        level: node.attrs['level'] as number,
        text:  node.textContent,
        pos,
      });
    }
  });

  if (items.length === 0) return null;

  return (
    <div className="border-b border-parchment/10 pb-2 mb-2" dir="rtl">
      <p className="text-parchment/30 text-[10px] uppercase tracking-widest mb-1.5 px-1">תוכן עניינים</p>
      <nav className="space-y-0.5">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              editor.chain().focus().setTextSelection(item.pos + 1).run();
              const domNode = editor.view.domAtPos(item.pos + 1)?.node as HTMLElement | null;
              domNode?.closest('[class*="ProseMirror"]')?.scrollTo({ top: (domNode as HTMLElement)?.offsetTop - 60, behavior: 'smooth' });
            }}
            className="w-full text-right px-1 py-0.5 text-xs text-parchment/50 hover:text-parchment transition-colors truncate block"
            style={{ paddingRight: `${(item.level - 1) * 12 + 4}px` }}
          >
            {item.text || '(ללא כותרת)'}
          </button>
        ))}
      </nav>
    </div>
  );
}
