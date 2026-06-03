import { useState, useEffect, useRef } from 'react';
import {
  PaperPlaneRightIcon, ChatCircleIcon, WarningCircleIcon, SpinnerGapIcon, NoteIcon,
  ArchiveBoxIcon, WaveformIcon, LockSimpleIcon,
} from '@phosphor-icons/react';
import {
  useCommConversations, useCommConversation, useSendCommMessage, useGrantConsent,
  useCommTemplateMatches, useRenderCommTemplate, useSaveMessageEvidence, useTranscribeMessage,
  useCaseEvidence,
  type CommConversation, type CommMessage,
} from '@/api/hooks.js';
import { CHANNEL_META, STATUS_META, commTime } from './channel-meta.js';

interface Props {
  /** Scope the panel to a case, a client, or (neither) the whole firm inbox. */
  caseId?:   number;
  clientId?: number;
}

/** Unified, omnichannel conversation timeline — embeddable in a case, a client, or standalone. */
export function CommunicationsPanel({ caseId, clientId }: Props) {
  const filter = caseId !== undefined ? { caseId } : clientId !== undefined ? { clientId } : {};
  const { data: conversations = [], isLoading } = useCommConversations(filter);
  const { data: exhibits = [] } = useCaseEvidence(caseId ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Auto-select the most recent conversation when the list loads/changes.
  useEffect(() => {
    if (selectedId === null && conversations.length > 0) setSelectedId(conversations[0]!.id);
  }, [conversations, selectedId]);

  if (isLoading) {
    return <div className="flex justify-center py-12 text-parchment/40"><SpinnerGapIcon size={28} className="animate-spin" /></div>;
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3" dir="rtl">
        <ChatCircleIcon size={40} weight="thin" />
        <span className="text-sm">אין עדיין תקשורת מקושרת</span>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {caseId !== undefined && exhibits.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-parchment/60 bg-navy-100/50 border border-parchment/10 rounded-lg px-3 py-1.5">
          <LockSimpleIcon size={14} weight="fill" className="text-emerald-400" />
          <span>{exhibits.length} מוצגים נעולים מהתקשורת בתיק זה</span>
        </div>
      )}
      <div className="grid grid-cols-[260px_1fr] gap-3 min-h-[420px]">
      {/* Conversation list */}
      <ul className="space-y-1 border-l border-parchment/10 pl-3 overflow-y-auto max-h-[560px]">
        {conversations.map((c) => (
          <li key={c.id}>
            <ConversationRow conv={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
          </li>
        ))}
      </ul>

      {/* Selected conversation timeline */}
      <div>
        {selectedId !== null
          ? <ConversationTimeline conversationId={selectedId} />
          : <div className="text-parchment/30 text-sm py-12 text-center">בחר שיחה</div>}
      </div>
      </div>
    </div>
  );
}

function ConversationRow({ conv, active, onClick }: { conv: CommConversation; active: boolean; onClick: () => void }) {
  const meta = CHANNEL_META[conv.channel];
  const { Icon } = meta;
  const status = STATUS_META[conv.status];
  return (
    <button
      onClick={onClick}
      className={`w-full text-right flex items-center gap-2 px-2.5 py-2 rounded-lg transition-colors
        ${active ? 'bg-gold/10 border border-gold/30' : 'hover:bg-parchment/5 border border-transparent'}`}
    >
      <Icon size={18} className={`${meta.accent} shrink-0`} weight="duotone" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-parchment text-sm truncate">{conv.subject ?? meta.label}</span>
          <span className={status.cls}>{status.label}</span>
        </div>
        <span className="text-parchment/35 text-[11px]">{commTime(conv.lastMessageAt ?? conv.createdAt)}</span>
      </div>
    </button>
  );
}

function ConversationTimeline({ conversationId }: { conversationId: number }) {
  const { data, isLoading } = useCommConversation(conversationId);
  const send = useSendCommMessage(conversationId);
  const grantConsent = useGrantConsent();
  const renderTpl = useRenderCommTemplate();
  const [draft, setDraft] = useState('');
  const [needsConsent, setNeedsConsent] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [data?.messages.length]);
  useEffect(() => { setNeedsConsent(false); }, [conversationId]);

  if (isLoading || !data) {
    return <div className="flex justify-center py-12 text-parchment/40"><SpinnerGapIcon size={24} className="animate-spin" /></div>;
  }

  const { conversation, messages } = data;
  const channel = CHANNEL_META[conversation.channel];

  function applyTemplate(templateId: number) {
    renderTpl.mutate(
      { templateId, caseId: conversation.caseId },
      { onSuccess: (r) => { setDraft(r.rendered); setPickerOpen(false); } },
    );
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setNeedsConsent(false);
    send.mutate(text, {
      onSuccess: () => setDraft(''),
      onError: (err) => {
        if ((err as { code?: string }).code === 'CONFLICT') setNeedsConsent(true);
      },
    });
  }

  function recordConsentAndSend() {
    if (conversation.clientId === null) return;
    grantConsent.mutate(
      { clientId: conversation.clientId, channel: conversation.channel, granted: true, source: 'panel' },
      { onSuccess: () => { setNeedsConsent(false); submit(); } },
    );
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-parchment/10">
        <channel.Icon size={18} className={channel.accent} weight="duotone" />
        <span className="text-parchment text-sm">{channel.label}</span>
        {conversation.status === 'triage' && (
          <span className="badge badge-gold mr-auto">דרוש שיוך לתיק</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2 pl-1">
        {messages.map((m) => <MessageBubble key={m.id} msg={m} conversationId={conversationId} />)}
        <div ref={endRef} />
      </div>

      {/* Consent gate notice */}
      {needsConsent && (
        <div className="mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-200/90 text-xs">
          <WarningCircleIcon size={16} weight="duotone" className="shrink-0" />
          <span className="flex-1">הלקוח לא תיעד הסכמה לערוץ {channel.label}. נדרשת הסכמה לפני שליחה.</span>
          {conversation.clientId !== null && (
            <button
              onClick={recordConsentAndSend}
              disabled={grantConsent.isPending}
              className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 whitespace-nowrap"
            >
              תעד הסכמה ושלח
            </button>
          )}
        </div>
      )}

      {/* Template picker */}
      <div className="relative mt-2">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-parchment/60 hover:text-gold transition-colors"
        >
          <NoteIcon size={14} weight="duotone" /> תבניות חכמות
        </button>
        {pickerOpen && <TemplatePicker conv={conversation} onPick={applyTemplate} busy={renderTpl.isPending} />}
      </div>

      {/* Action bar */}
      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={2}
          placeholder={`הקלד הודעה ל${channel.label}… (Ctrl+Enter לשליחה)`}
          className="flex-1 bg-navy-100 border border-parchment/20 rounded-lg px-3 py-2 text-parchment
                     placeholder-parchment/30 text-sm outline-none focus:border-gold/50 resize-none"
          dir="rtl"
        />
        <button
          onClick={submit}
          disabled={send.isPending || !draft.trim()}
          className="px-3 py-2 rounded-lg bg-gold/20 hover:bg-gold/30 disabled:opacity-40
                     text-gold border border-gold/30 flex items-center gap-1.5 text-sm shrink-0"
        >
          {send.isPending ? <SpinnerGapIcon size={16} className="animate-spin" /> : <PaperPlaneRightIcon size={16} weight="duotone" />}
          שלח
        </button>
      </div>
    </div>
  );
}

function TemplatePicker({ conv, onPick, busy }: { conv: CommConversation; onPick: (id: number) => void; busy: boolean }) {
  const { data: templates = [], isLoading } = useCommTemplateMatches(conv.caseId, conv.channel);
  return (
    <div className="absolute bottom-full mb-1 right-0 w-80 max-h-64 overflow-y-auto bg-navy-100 border border-parchment/20 rounded-lg shadow-2xl z-10 p-1">
      {isLoading ? (
        <div className="py-4 text-center text-parchment/40 text-xs">טוען…</div>
      ) : templates.length === 0 ? (
        <div className="py-4 text-center text-parchment/40 text-xs">אין תבניות מתאימות להקשר זה</div>
      ) : (
        <ul className="space-y-0.5">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onPick(t.id)}
                disabled={busy}
                className="w-full text-right px-2.5 py-1.5 rounded-md hover:bg-gold/10 disabled:opacity-50 transition-colors"
              >
                <div className="text-parchment text-sm">{t.nameHe}</div>
                <div className="text-parchment/40 text-[11px] truncate">{t.preview}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageBubble({ msg, conversationId }: { msg: CommMessage; conversationId: number }) {
  const outbound = msg.direction === 'outbound';
  const saveEvidence = useSaveMessageEvidence(conversationId);
  const transcribe = useTranscribeMessage(conversationId);
  const [transcribeErr, setTranscribeErr] = useState<string | null>(null);

  return (
    <div className={`group flex ${outbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm
          ${outbound
            ? 'bg-gold/15 border border-gold/25 text-parchment rounded-bl-sm'
            : 'bg-navy-100 border border-parchment/15 text-parchment rounded-br-sm'}`}
      >
        {msg.mediaKind && (
          <div className="text-[11px] text-parchment/50 mb-0.5">[{msg.mediaKind}]</div>
        )}
        {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}

        {/* Local Whisper transcript for voice notes */}
        {msg.transcript && (
          <p className="mt-1 pt-1 border-t border-parchment/15 text-parchment/70 text-xs whitespace-pre-wrap">
            <WaveformIcon size={12} className="inline ml-1 text-parchment/40" /> {msg.transcript}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-parchment/35 flex-1 text-left">{commTime(msg.createdAt)}</span>

          {/* Per-message actions (appear on hover) */}
          {msg.mediaKind === 'audio' && !msg.transcript && (
            <button
              onClick={() => { setTranscribeErr(null); transcribe.mutate(msg.id, { onError: () => setTranscribeErr('תמלול אינו זמין') }); }}
              disabled={transcribe.isPending}
              title="תמלל הקלטה (מקומי)"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-parchment/40 hover:text-gold"
            >
              {transcribe.isPending ? <SpinnerGapIcon size={13} className="animate-spin" /> : <WaveformIcon size={13} />}
            </button>
          )}
          <button
            onClick={() => saveEvidence.mutate(msg.id)}
            disabled={saveEvidence.isPending || saveEvidence.isSuccess}
            title="שמור כראיה (מוצג נעול)"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-parchment/40 hover:text-gold disabled:text-emerald-400 disabled:opacity-100"
          >
            {saveEvidence.isSuccess ? <LockSimpleIcon size={13} weight="fill" /> : <ArchiveBoxIcon size={13} />}
          </button>
        </div>
        {transcribeErr && <p className="text-[10px] text-amber-300/80 mt-0.5">{transcribeErr}</p>}
      </div>
    </div>
  );
}
