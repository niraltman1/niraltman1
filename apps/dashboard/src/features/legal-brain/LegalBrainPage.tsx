import { useState, useRef, useEffect } from 'react';
import {
  LightbulbIcon, PlusIcon, TrashIcon,
  ThumbsUpIcon, ThumbsDownIcon, PaperPlaneTiltIcon,
} from '@phosphor-icons/react';
import {
  useLegalBrainSessions,
  useBrainSession,
  useCreateBrainSession,
  useDeleteBrainSession,
  useBrainFeedback,
  useAskBrain,
  type BrainMessage,
} from '@/api/hooks.js';

function MessageBubble({
  msg,
  onFeedback,
}: {
  msg: BrainMessage;
  onFeedback: (id: number, rating: 1 | -1) => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-4`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-navy-100 border border-parchment/10 text-parchment'
            : 'bg-gold/10 border border-gold/20 text-parchment'
        }`}
      >
        <div className="whitespace-pre-wrap">{msg.content}</div>
        {!isUser && (
          <div className="mt-2 flex gap-2 justify-end">
            <button
              onClick={() => onFeedback(msg.id, 1)}
              className={`p-1 rounded transition-colors ${
                msg.rating === 1
                  ? 'text-emerald-400'
                  : 'text-parchment/20 hover:text-emerald-400'
              }`}
              aria-label="תשובה טובה"
            >
              <ThumbsUpIcon size={13} />
            </button>
            <button
              onClick={() => onFeedback(msg.id, -1)}
              className={`p-1 rounded transition-colors ${
                msg.rating === -1
                  ? 'text-red-400'
                  : 'text-parchment/20 hover:text-red-400'
              }`}
              aria-label="תשובה גרועה"
            >
              <ThumbsDownIcon size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LegalBrainPage() {
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [question, setQuestion]               = useState('');
  const [showNewForm, setShowNewForm]         = useState(false);
  const [newTitle, setNewTitle]               = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useLegalBrainSessions();
  const sessionQuery  = useBrainSession(activeSessionId);
  const createSession = useCreateBrainSession();
  const deleteSession = useDeleteBrainSession();
  const feedback      = useBrainFeedback();
  const { ask, streaming, streamedText } = useAskBrain();

  const sessions = sessionsQuery.data ?? [];
  const session  = sessionQuery.data;
  const messages = session?.messages ?? [];

  // Scroll to bottom whenever messages change or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamedText]);

  function handleCreateSession() {
    createSession.mutate(
      { userId: 'default', title: newTitle.trim() || 'שיחה חדשה' },
      {
        onSuccess: (s) => {
          setActiveSessionId(s.id);
          setShowNewForm(false);
          setNewTitle('');
        },
      },
    );
  }

  function handleDeleteSession(id: number) {
    if (!confirm('למחוק שיחה זו?')) return;
    deleteSession.mutate(id, {
      onSuccess: () => {
        if (activeSessionId === id) setActiveSessionId(null);
      },
    });
  }

  async function handleSend() {
    if (!activeSessionId || !question.trim() || streaming) return;
    const q = question.trim();
    setQuestion('');
    await ask(activeSessionId, q);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex h-full" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-navy-100 border-l border-parchment/10 flex flex-col">
        <div className="p-4 border-b border-parchment/10">
          <h2 className="text-sm font-serif font-bold text-parchment flex items-center gap-2">
            <LightbulbIcon size={16} weight="duotone" className="text-gold" />
            מוח משפטי
          </h2>
          <p className="text-parchment/40 text-[11px] mt-0.5">BrainboxAI/law-il-E2B</p>
        </div>

        <div className="p-3">
          {showNewForm ? (
            <div className="space-y-2">
              <input
                dir="rtl"
                autoFocus
                placeholder="כותרת השיחה (אופציונלי)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSession(); if (e.key === 'Escape') setShowNewForm(false); }}
                className="w-full bg-navy-200 border border-parchment/10 rounded px-2.5 py-1.5
                           text-xs text-parchment placeholder:text-parchment/30 outline-none
                           focus:border-gold/40"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowNewForm(false)}
                  className="flex-1 py-1 text-xs text-parchment/40 hover:text-parchment transition-colors"
                >
                  ביטול
                </button>
                <button
                  onClick={handleCreateSession}
                  disabled={createSession.isPending}
                  className="flex-1 py-1 text-xs bg-gold/20 border border-gold/40 text-gold
                             rounded hover:bg-gold/30 disabled:opacity-50 transition-colors"
                >
                  צור
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gold
                         bg-gold/10 border border-gold/20 rounded-lg hover:bg-gold/20 transition-colors"
            >
              <PlusIcon size={12} weight="bold" />
              שיחה חדשה
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 && !sessionsQuery.isLoading && (
            <p className="text-parchment/30 text-xs text-center py-4">אין שיחות עדיין</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeSessionId === s.id
                  ? 'bg-gold/15 text-parchment'
                  : 'text-parchment/60 hover:bg-parchment/5 hover:text-parchment'
              }`}
              onClick={() => setActiveSessionId(s.id)}
            >
              <LightbulbIcon size={12} className="shrink-0 text-gold/60" />
              <span className="flex-1 text-xs truncate">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-parchment/30
                           hover:text-red-400 transition-all"
                aria-label="מחק שיחה"
              >
                <TrashIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSessionId === null ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <LightbulbIcon size={40} className="text-gold/30 mx-auto" weight="duotone" />
              <p className="text-parchment/40 text-sm">בחר שיחה או צור שיחה חדשה</p>
              <p className="text-parchment/20 text-xs">מודל: BrainboxAI/law-il-E2B · כל הנתונים מעובדים מקומית</p>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6">
              {sessionQuery.isLoading && (
                <p className="text-center text-parchment/30 text-sm py-8">טוען שיחה...</p>
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onFeedback={(id, rating) => feedback.mutate({ id, rating })}
                />
              ))}
              {/* Streaming response preview */}
              {streaming && streamedText && (
                <div className="flex justify-end mb-4">
                  <div className="max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed
                                  bg-gold/10 border border-gold/20 text-parchment">
                    <div className="whitespace-pre-wrap">{streamedText}</div>
                    <div className="mt-1 text-gold/50 text-[11px]">מייצר תשובה...</div>
                  </div>
                </div>
              )}
              {streaming && !streamedText && (
                <div className="flex justify-end mb-4">
                  <div className="px-4 py-3 rounded-xl bg-gold/5 border border-gold/10 text-parchment/40 text-xs">
                    מייצר תשובה...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-parchment/10 p-4">
              <div className="flex gap-3 items-end">
                <textarea
                  dir="rtl"
                  rows={2}
                  placeholder="שאל שאלה משפטית... (Ctrl+Enter לשליחה)"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  className="flex-1 bg-navy-100 border border-parchment/10 rounded-lg px-3 py-2
                             text-sm text-parchment placeholder:text-parchment/30 outline-none
                             focus:border-gold/40 resize-none disabled:opacity-50"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={streaming || !question.trim()}
                  className="p-2.5 bg-gold/20 border border-gold/30 text-gold rounded-lg
                             hover:bg-gold/30 disabled:opacity-40 transition-colors shrink-0"
                  aria-label="שלח"
                >
                  <PaperPlaneTiltIcon size={18} />
                </button>
              </div>
              <p className="text-parchment/20 text-[11px] mt-1.5 text-center">
                הנתונים מעובדים על המחשב המקומי בלבד · לא נשלחים לאינטרנט
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
