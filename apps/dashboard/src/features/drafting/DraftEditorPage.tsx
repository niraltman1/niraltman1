import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { useDraft, useUpdateDraft } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';
import { DraftEditor } from './DraftEditor.js';
import { DraftContextPanel } from './DraftContextPanel.js';
import { DraftIntelligencePanel } from './DraftIntelligencePanel.js';
import type { Editor } from '@tiptap/react';

export function DraftEditorPage() {
  const { id }          = useParams<{ id: string }>();
  const navigate        = useNavigate();
  const draftId         = id ? Number(id) : null;
  const [editor, setEditor] = useState<Editor | null>(null);
  const { selectDraft } = useUIStore();

  const { data: draft, isLoading, error } = useDraft(draftId);
  const updateDraft = useUpdateDraft();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <CircleNotchIcon size={28} className="animate-spin text-gold" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" dir="rtl">
        <p className="text-parchment/50">הטיוטה לא נמצאה</p>
        <button
          onClick={() => navigate('/drafting')}
          className="flex items-center gap-2 text-gold hover:underline text-sm"
        >
          <ArrowRightIcon size={14} />
          חזרה לטיוטות
        </button>
      </div>
    );
  }

  // Register active draft in global store
  selectDraft(draft.id);

  const handleSave = (
    contentJson: string,
    contentHtml: string,
    wordCount:   number,
    changeReason?: string,
  ) => {
    updateDraft.mutate({
      id:          draft.id,
      contentJson,
      contentHtml,
      wordCount,
      ...(changeReason !== undefined ? { changeReason } : {}),
    });
  };

  return (
    <div className="flex h-full overflow-hidden" dir="rtl">

      {/* Back nav + title strip */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2 px-4 py-2">
        <button
          onClick={() => navigate('/drafting')}
          className="flex items-center gap-1.5 text-parchment/40 hover:text-parchment text-xs transition-colors"
        >
          <ArrowRightIcon size={12} />
          טיוטות
        </button>
        <span className="text-parchment/20 text-xs">/</span>
        <span className="text-parchment/60 text-xs truncate max-w-[200px]">{draft.title}</span>
      </div>

      {/* 3-panel grid */}
      <div className="grid grid-cols-[280px_1fr_320px] w-full h-full overflow-hidden mt-8">

        {/* Left panel — Context */}
        <div className="border-l border-parchment/10 overflow-y-auto bg-navy-200/20">
          <DraftContextPanel draft={draft} />
        </div>

        {/* Center — Editor */}
        <div className="overflow-hidden flex flex-col">
          <DraftEditor
            draft={draft}
            onSave={handleSave}
            isSaving={updateDraft.isPending}
            onEditorReady={setEditor}
          />
        </div>

        {/* Right panel — Intelligence */}
        <div className="border-r border-parchment/10 overflow-hidden flex flex-col bg-navy-200/20">
          <DraftIntelligencePanel
            draft={draft}
            editor={editor}
          />
        </div>

      </div>
    </div>
  );
}
