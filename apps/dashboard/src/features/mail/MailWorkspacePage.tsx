import { useState } from 'react';
import { EnvelopeIcon, CopyIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { useCases, useGenerateMailReply } from '@/api/hooks.js';

type Tone = 'formal' | 'assertive' | 'conciliatory';

const TONE_LABELS: Record<Tone, string> = {
  formal:       'רשמי',
  assertive:    'תקיף',
  conciliatory: 'פשרה',
};

export function MailWorkspacePage() {
  const [caseId,    setCaseId]    = useState<number | null>(null);
  const [tone,      setTone]      = useState<Tone>('formal');
  const [emailBody, setEmailBody] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [toast,     setToast]     = useState<string | null>(null);

  const { data: casesData } = useCases(1, 200);
  const generate = useGenerateMailReply();

  const cases = casesData?.items ?? [];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleGenerate() {
    if (!caseId || !emailBody.trim()) return;
    const result = await generate.mutateAsync({ caseId, tone, emailBody });
    setDraftBody(result.draftBody);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draftBody);
    showToast('הטיוטה הועתקה — שלח דרך לקוח המייל שלך');
  }

  const hasWarning = draftBody.startsWith('⚠️');
  const canGenerate = caseId !== null && emailBody.trim().length > 0 && !generate.isPending;

  return (
    <div dir="rtl" className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <EnvelopeIcon size={24} weight="duotone" className="text-gold shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-parchment">מחולל תגובה חכמה (RAG)</h1>
          <p className="text-xs text-parchment/50">מבוסס על נתוני התיק המקומי</p>
        </div>
      </div>

      {/* Case + Tone row */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label className="text-xs text-parchment/60">בחר תיק</label>
          <select
            value={caseId ?? ''}
            onChange={(e) => setCaseId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-parchment/10 bg-navy-200/30 px-3 py-2 text-sm text-parchment
                       focus:outline-none focus:ring-1 focus:ring-gold/50"
          >
            <option value="">-- בחר תיק --</option>
            {cases.map((c) => (
              <option key={c['id'] as number} value={c['id'] as number}>
                {(c['caseNumber'] as string | null) ?? `תיק #${c['id'] as number}`}
                {c['titleHe'] ? ` — ${c['titleHe'] as string}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-parchment/60">סגנון תגובה</label>
          <div className="flex gap-1.5">
            {(Object.keys(TONE_LABELS) as Tone[]).map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={`px-3 py-2 rounded-lg text-sm transition-colors border ${
                  tone === t
                    ? 'bg-gold/20 border-gold/50 text-gold'
                    : 'border-parchment/10 text-parchment/60 hover:text-parchment hover:border-parchment/30'
                }`}
              >
                {TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Email body input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-parchment/60">הדבק את תוכן המייל המקורי כאן:</label>
        <textarea
          rows={6}
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          placeholder="הדבק את המייל שהתקבל…"
          className="w-full rounded-lg border border-parchment/10 bg-navy-200/30 px-3 py-2 text-sm text-parchment
                     placeholder:text-parchment/30 resize-y focus:outline-none focus:ring-1 focus:ring-gold/50"
        />
      </div>

      {/* Generate button */}
      <button
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        className="self-start flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium
                   bg-gold/20 border border-gold/40 text-gold
                   hover:bg-gold/30 transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <PaperPlaneTiltIcon size={16} weight="duotone" />
        {generate.isPending ? 'מייצר טיוטה…' : 'צור טיוטה מנתוני התיק ▶'}
      </button>

      {generate.isError && (
        <p className="text-sm text-red-400">
          {(generate.error as Error).message === 'OLLAMA_UNAVAILABLE'
            ? 'מנוע ה-AI אינו זמין כעת. ודא ש-Ollama פועל ונסה שוב.'
            : 'שגיאה בייצור הטיוטה. נסה שוב.'}
        </p>
      )}

      {/* Loading skeleton */}
      {generate.isPending && (
        <div className="space-y-2 animate-pulse">
          {[100, 90, 80, 70, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded bg-parchment/10"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      )}

      {/* Draft output */}
      {draftBody && !generate.isPending && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-parchment/60">טיוטת תגובה:</label>
            {hasWarning && (
              <span className="text-xs text-amber-400 border border-amber-400/30 rounded px-2 py-0.5">
                לא אומתה מול נתוני התיק
              </span>
            )}
          </div>
          <textarea
            rows={10}
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm text-parchment
                        bg-navy-200/30 resize-y focus:outline-none focus:ring-1 focus:ring-gold/50
                        ${hasWarning ? 'border-amber-400/40' : 'border-parchment/10'}`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => void handleCopy()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-parchment/10
                         text-parchment/70 hover:text-parchment hover:border-parchment/30 transition-colors"
            >
              <CopyIcon size={14} />
              העתק
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-navy-200/40
                         border border-parchment/10 text-parchment/50 cursor-default"
              title="SMTP bridge — בפיתוח"
            >
              אישור והעברה למשלוח
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        border border-gold/30 bg-navy-200 text-parchment text-sm shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
