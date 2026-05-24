import { useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BugIcon,
  MicrophoneIcon,
  StopCircleIcon,
  CircleNotchIcon,
  CheckCircleIcon,
  XIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

type Stage = 'compose' | 'submitting' | 'done' | 'error';

interface BugReportModalProps {
  onClose: () => void;
}

export function BugReportModal({ onClose }: BugReportModalProps) {
  const location                      = useLocation();
  const [stage, setStage]             = useState<Stage>('compose');
  const [description, setDescription] = useState('');
  const [recording, setRecording]     = useState(false);
  const [zipPath, setZipPath]         = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const mediaRef                      = useRef<MediaRecorder | null>(null);
  const chunksRef                     = useRef<Blob[]>([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr     = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        // Append placeholder text — in production the Whisper exe transcribes this
        const reader = new FileReader();
        reader.onload = () => {
          setDescription((prev) =>
            prev
              ? prev + '\n[קובץ אודיו מוצמד — Whisper יתמלל אוטומטית]'
              : '[קובץ אודיו מוצמד — Whisper יתמלל אוטומטית]',
          );
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setDescription((prev) => prev + '\n(מיקרופון לא זמין)');
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  }

  async function submit() {
    setStage('submitting');
    try {
      const res  = await fetch('/api/bug-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          activeRoute:     location.pathname,
          userDescription: description,
        }),
      });
      const json = await res.json() as { success: boolean; data?: { desktopPath: string } };
      if (!json.success) throw new Error('שגיאה מהשרת');
      setZipPath(json.data?.desktopPath ?? '');
      setStage('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(8,14,26,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-parchment/15 shadow-2xl p-6 space-y-5"
        style={{ background: 'var(--bg-2)' }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BugIcon size={20} weight="duotone" style={{ color: 'var(--brand-cyan)' }} />
            <h2 className="font-bold text-parchment text-base">דווח על באג</h2>
          </div>
          <button
            onClick={onClose}
            className="text-parchment/40 hover:text-parchment transition-colors"
            aria-label="סגור"
          >
            <XIcon size={18} />
          </button>
        </div>

        {stage === 'compose' && (
          <>
            {/* Route info */}
            <p className="text-xs text-parchment/40" dir="ltr">
              מסך פעיל: <code>{location.pathname}</code>
            </p>

            {/* Description textarea */}
            <div className="space-y-2">
              <label className="text-sm text-parchment/70">תיאור הבאג</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תאר את הבאג שנתקלת בו…"
                rows={5}
                className="w-full rounded-lg px-3 py-2 text-sm border border-parchment/15
                           bg-navy-900/30 text-parchment placeholder-parchment/30
                           focus:outline-none focus:border-brand-cyan resize-none"
              />
            </div>

            {/* Voice dictation */}
            <div className="flex items-center gap-2">
              {recording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                             bg-red-900/30 text-red-300 border border-red-700/30 hover:bg-red-900/50 transition-colors"
                >
                  <StopCircleIcon size={14} weight="fill" />
                  עצור הקלטה
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                             bg-navy-900/40 text-parchment/60 border border-parchment/15
                             hover:border-parchment/30 hover:text-parchment transition-colors"
                >
                  <MicrophoneIcon size={14} weight="duotone" />
                  הקלט תיאור קולי
                </button>
              )}
              {recording && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  מקליט…
                </span>
              )}
            </div>

            <button
              onClick={submit}
              disabled={!description.trim()}
              className="btn-primary w-full"
            >
              צור דוח באג
            </button>
          </>
        )}

        {stage === 'submitting' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CircleNotchIcon size={32} className="animate-spin" style={{ color: 'var(--brand-cyan)' }} />
            <p className="text-parchment/60 text-sm">בונה קובץ ZIP…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircleIcon size={20} weight="fill" />
              <span className="text-sm font-medium">דוח הבאג נוצר בהצלחה</span>
            </div>
            <div className="rounded-lg p-3 border border-parchment/10 bg-navy-900/30">
              <p className="text-xs text-parchment/40 mb-1">נשמר ב-Desktop:</p>
              <p className="text-xs text-parchment font-mono break-all" dir="ltr">{zipPath}</p>
            </div>
            <p className="text-xs text-parchment/50">
              גרור את קובץ ה-ZIP ישירות לשיחה עם Claude לקבלת אבחון מיידי.
            </p>
            <button onClick={onClose} className="btn-secondary w-full text-sm">
              סגור
            </button>
          </div>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <WarningCircleIcon size={20} weight="fill" />
              <span className="text-sm font-medium">שגיאה ביצירת הדוח</span>
            </div>
            <p className="text-xs text-parchment/50">{errorMsg}</p>
            <button onClick={() => setStage('compose')} className="btn-secondary w-full text-sm">
              נסה שוב
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
