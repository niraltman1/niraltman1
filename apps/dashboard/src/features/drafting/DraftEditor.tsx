import { useEffect, useRef, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import {
  TextBolderIcon, TextItalicIcon, ListIcon, ListNumbersIcon,
  ArrowCounterClockwiseIcon, ArrowClockwiseIcon,
  PrinterIcon, DownloadSimpleIcon, CircleNotchIcon,
} from '@phosphor-icons/react';
import { CitationNode } from './CitationNode.js';
import { DocumentOutline } from './DocumentOutline.js';
import type { DraftRecord } from '@/api/hooks.js';

interface Props {
  draft: DraftRecord;
  onSave: (contentJson: string, contentHtml: string, wordCount: number, changeReason?: string) => void;
  isSaving: boolean;
  onEditorReady?: (editor: import('@tiptap/react').Editor) => void;
}

export function DraftEditor({ draft, onSave, isSaving, onEditorReady }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      Placeholder.configure({ placeholder: 'התחל לכתוב את הטיוטה שלך...' }),
      CharacterCount,
      CitationNode,
    ],
    content: (() => {
      if (!draft.content_json) return '';
      try { return JSON.parse(draft.content_json) as object; }
      catch { return draft.content_json; }
    })(),
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none outline-none min-h-[400px] text-parchment',
        dir: 'rtl',
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json  = JSON.stringify(editor.getJSON());
        const html  = editor.getHTML();
        const words = editor.storage['characterCount']?.words?.() ?? 0;
        onSave(json, html, words, 'autosave');
        setLastSavedAt(new Date());
      }, 2_000);
    },
  });

  // Notify parent when editor is ready
  const didNotify = useRef(false);
  useEffect(() => {
    if (editor && onEditorReady && !didNotify.current) {
      didNotify.current = true;
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Sync content when draft changes from outside (e.g. version restore)
  const prevDraftId = useRef(draft.id);
  useEffect(() => {
    if (draft.id !== prevDraftId.current && editor && draft.content_json) {
      prevDraftId.current = draft.id;
      try {
        editor.commands.setContent(JSON.parse(draft.content_json) as object);
      } catch { /* skip */ }
    }
  }, [draft.id, draft.content_json, editor]);

  const handleManualSave = useCallback(() => {
    if (!editor) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const json  = JSON.stringify(editor.getJSON());
    const html  = editor.getHTML();
    const words = editor.storage['characterCount']?.words?.() ?? 0;
    onSave(json, html, words, 'manual');
    setLastSavedAt(new Date());
  }, [editor, onSave]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportHtml = async () => {
    const res = await fetch(`/api/drafts/${draft.id}/export/html`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draft-${draft.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const words = editor?.storage['characterCount']?.words?.() ?? draft.word_count;

  return (
    <div className="flex flex-col h-full bg-navy-200/30" dir="rtl">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-parchment/10 bg-navy-100/50 flex-wrap">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold') === true}
          title="מודגש"
        ><TextBolderIcon size={14} /></ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic') === true}
          title="נטוי"
        ><TextItalicIcon size={14} /></ToolbarButton>

        <div className="w-px h-4 bg-parchment/20 mx-1" />

        {([1, 2, 3] as const).map((level) => (
          <ToolbarButton
            key={level}
            onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
            active={editor?.isActive('heading', { level }) === true}
            title={`כותרת ${level}`}
          >
            <span className="text-xs font-bold">H{level}</span>
          </ToolbarButton>
        ))}

        <div className="w-px h-4 bg-parchment/20 mx-1" />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList') === true}
          title="רשימה"
        ><ListIcon size={14} /></ToolbarButton>

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList') === true}
          title="רשימה ממוספרת"
        ><ListNumbersIcon size={14} /></ToolbarButton>

        <div className="w-px h-4 bg-parchment/20 mx-1" />

        <ToolbarButton onClick={() => editor?.chain().focus().undo().run()} title="בטל">
          <ArrowCounterClockwiseIcon size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor?.chain().focus().redo().run()} title="בצע שוב">
          <ArrowClockwiseIcon size={14} />
        </ToolbarButton>

        <div className="flex-1" />

        <span className="text-parchment/30 text-xs ml-2">{words} מילים</span>

        {isSaving && <CircleNotchIcon size={12} className="animate-spin text-gold" />}
        {!isSaving && lastSavedAt && (
          <span className="text-parchment/25 text-[10px]">
            נשמר {lastSavedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        <button
          onClick={handleManualSave}
          disabled={isSaving}
          className="px-2 py-1 text-xs text-gold border border-gold/30 rounded hover:bg-gold/10 transition-colors disabled:opacity-50 mr-1"
        >
          שמור גרסה
        </button>

        <button onClick={handlePrint} className="p-1.5 text-parchment/40 hover:text-parchment" title="הדפס">
          <PrinterIcon size={14} />
        </button>
        <button onClick={handleExportHtml} className="p-1.5 text-parchment/40 hover:text-parchment" title="ייצוא HTML">
          <DownloadSimpleIcon size={14} />
        </button>
      </div>

      {/* Document Outline */}
      <div className="px-4 pt-2">
        <DocumentOutline editor={editor} />
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 print:px-0">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick, active, title, children,
}: {
  onClick?: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active ? 'bg-gold/20 text-gold' : 'text-parchment/50 hover:text-parchment hover:bg-parchment/5'
      }`}
    >
      {children}
    </button>
  );
}
