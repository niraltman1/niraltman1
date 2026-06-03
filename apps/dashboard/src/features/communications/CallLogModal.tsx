import { useState, useRef } from 'react';
import {
  PhoneIcon, XIcon, MicrophoneIcon, StopCircleIcon, SpinnerGapIcon,
  PlusIcon, TrashIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import {
  useCases, useCreateCallLog, useSaveCallEvidence, useTranscribeAudio,
  type CallDirection, type CallLogCreateInput,
} from '@/api/hooks.js';

interface Props {
  clientId:    number;
  /** Preselected case when opened from a case context. */
  caseId?:     number;
  onClose:     () => void;
  onSaved?:    () => void;
}

interface ActionItemDraft { title: string; priority: string }

const PRIORITIES: Array<{ value: string; label: string }> = [
  { value: 'normal',   label: 'רגיל' },
  { value: 'high',     label: 'גבוה' },
  { value: 'critical', label: 'דחוף' },
  { value: 'low',      label: 'נמוך' },
];

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function splitList(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Document a phone call (no live recording). Summary can be typed or dictated locally (Whisper). */
export function CallLogModal({ clientId, caseId: presetCase, onClose, onSaved }: Props) {
  const { data: caseList } = useCases(1, 100, clientId);
  const createCall   = useCreateCallLog();
  const saveEvidence = useSaveCallEvidence();
  const transcribe   = useTranscribeAudio();

  const [caseId, setCaseId]           = useState<number | ''>(presetCase ?? '');
  const [direction, setDirection]     = useState<CallDirection>('inbound');
  const [subject, setSubject]         = useState('');
  const [summary, setSummary]         = useState('');
  const [occurredAt, setOccurredAt]   = useState(nowLocalInput());
  const [duration, setDuration]       = useState('');
  const [participants, setParticipants] = useState('');
  const [tags, setTags]               = useState('');
  const [actionItems, setActionItems] = useState<ActionItemDraft[]>([]);
  const [alsoEvidence, setAlsoEvidence] = useState(false);
  const [recording, setRecording]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const mediaRef  = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cases = (caseList?.items ?? []) as Array<Record<string, unknown>>;
  const busy  = createCall.isPending || saveEvidence.isPending;

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          transcribe.mutate(
            { audioBase64: base64, mimeType: blob.type || 'audio/webm' },
            {
              onSuccess: (r) => setSummary((prev) => (prev ? `${prev}\n${r.transcript}` : r.transcript)),
              onError:   (e) => setError((e as { message?: string }).message ?? 'תמלול אינו זמין'),
            },
          );
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setError('המיקרופון אינו זמין');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  function save() {
    setError(null);
    const input: CallLogCreateInput = {
      clientId,
      direction,
      ...(caseId !== '' ? { caseId } : {}),
      ...(subject.trim() ? { subject: subject.trim() } : {}),
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      occurredAt: new Date(occurredAt).toISOString(),
      ...(duration.trim() ? { durationMinutes: Number(duration) } : {}),
      ...(participants.trim() ? { participants: splitList(participants) } : {}),
      ...(tags.trim() ? { tags: splitList(tags) } : {}),
      ...(actionItems.length
        ? { actionItems: actionItems.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), priority: a.priority })) }
        : {}),
    };
    createCall.mutate(input, {
      onSuccess: ({ call }) => {
        if (alsoEvidence && caseId !== '') {
          saveEvidence.mutate({ id: call.id, caseId }, { onSuccess: () => { onSaved?.(); onClose(); } });
        } else {
          onSaved?.();
          onClose();
        }
      },
      onError: (e) => setError((e as { message?: string }).message ?? 'שמירת התרשומת נכשלה'),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,14,26,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-parchment/15 shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--bg-2)' }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneIcon size={20} weight="duotone" className="text-emerald-300" />
            <h2 className="font-bold text-parchment text-base">תיעוד שיחה</h2>
          </div>
          <button onClick={onClose} className="text-parchment/40 hover:text-parchment transition-colors" aria-label="סגור">
            <XIcon size={18} />
          </button>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-parchment/60">תיק</span>
            <select
              value={caseId} onChange={(e) => setCaseId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment focus:outline-none focus:border-gold/50"
            >
              <option value="">— ללא תיק —</option>
              {cases.map((c) => (
                <option key={c['id'] as number} value={c['id'] as number}>
                  {(c['case_number'] as string) ?? (c['title_he'] as string) ?? `תיק ${c['id'] as number}`}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-parchment/60">כיוון</span>
            <div className="flex rounded-lg overflow-hidden border border-parchment/15">
              {(['inbound', 'outbound'] as CallDirection[]).map((d) => (
                <button
                  key={d} type="button" onClick={() => setDirection(d)}
                  className={`flex-1 py-1.5 text-xs transition-colors ${direction === d ? 'bg-gold/20 text-gold' : 'text-parchment/50 hover:text-parchment'}`}
                >
                  {d === 'inbound' ? 'נכנסת' : 'יוצאת'}
                </button>
              ))}
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-parchment/60">מועד השיחה</span>
            <input
              type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment focus:outline-none focus:border-gold/50"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-parchment/60">משך (דקות)</span>
            <input
              type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="0"
              className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-parchment/60">משתתפים (מופרדים בפסיק)</span>
          <input
            value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="הלקוח, עו״ד שכנגד…"
            className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50"
          />
        </label>

        {/* Core */}
        <label className="block space-y-1">
          <span className="text-xs text-parchment/60">נושא</span>
          <input
            value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="נושא השיחה"
            className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50"
          />
        </label>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-parchment/60">סיכום</span>
            {recording ? (
              <button onClick={stopRecording} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-900/30 text-red-300 border border-red-700/30">
                <StopCircleIcon size={13} weight="fill" /> עצור
              </button>
            ) : (
              <button
                onClick={startRecording} disabled={transcribe.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-navy-900/40 text-parchment/60 border border-parchment/15 hover:text-parchment disabled:opacity-50"
              >
                {transcribe.isPending ? <SpinnerGapIcon size={13} className="animate-spin" /> : <MicrophoneIcon size={13} weight="duotone" />}
                הכתב
              </button>
            )}
          </div>
          <textarea
            value={summary} onChange={(e) => setSummary(e.target.value)} rows={4}
            placeholder="סכם את עיקרי השיחה… (או הקש על ׳הכתב׳)"
            className="w-full rounded-lg px-3 py-2 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50 resize-none"
          />
          {recording && <span className="text-[11px] text-red-400 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> מקליט…</span>}
        </div>

        {/* Follow-up */}
        <label className="block space-y-1">
          <span className="text-xs text-parchment/60">תוויות (מופרדות בפסיק)</span>
          <input
            value={tags} onChange={(e) => setTags(e.target.value)} placeholder="דחוף, פשרה…"
            className="w-full rounded-lg px-2 py-1.5 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50"
          />
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-parchment/60">משימות המשך</span>
            <button
              onClick={() => setActionItems((a) => [...a, { title: '', priority: 'normal' }])}
              className="flex items-center gap-1 text-xs text-parchment/50 hover:text-gold"
            >
              <PlusIcon size={12} /> הוסף משימה
            </button>
          </div>
          {actionItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={item.title}
                onChange={(e) => setActionItems((a) => a.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                placeholder="לבצע…"
                className="flex-1 rounded-lg px-2 py-1 text-sm border border-parchment/15 bg-navy-900/30 text-parchment placeholder-parchment/30 focus:outline-none focus:border-gold/50"
              />
              <select
                value={item.priority}
                onChange={(e) => setActionItems((a) => a.map((x, j) => (j === i ? { ...x, priority: e.target.value } : x)))}
                className="rounded-lg px-1.5 py-1 text-xs border border-parchment/15 bg-navy-900/30 text-parchment focus:outline-none focus:border-gold/50"
              >
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <button onClick={() => setActionItems((a) => a.filter((_, j) => j !== i))} className="text-parchment/40 hover:text-red-400">
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>

        {caseId !== '' && (
          <label className="flex items-center gap-2 text-xs text-parchment/70">
            <input type="checkbox" checked={alsoEvidence} onChange={(e) => setAlsoEvidence(e.target.checked)} />
            שמור גם כראיה בציר הזמן של התיק
          </label>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <WarningCircleIcon size={15} weight="duotone" /> {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} disabled={busy} className="btn-primary flex-1">
            {busy ? <SpinnerGapIcon size={16} className="animate-spin" /> : 'שמור תרשומת'}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm">ביטול</button>
        </div>
      </div>
    </div>
  );
}
