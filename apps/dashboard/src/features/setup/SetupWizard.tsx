import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon, XCircleIcon, WarningCircleIcon, ArrowRightIcon,
  DatabaseIcon, RobotIcon, FolderOpenIcon, RocketLaunchIcon, SpinnerIcon,
} from '@phosphor-icons/react';

// ─── API types ────────────────────────────────────────────────────────────────

interface StatusCheck {
  healthy: boolean;
  detail?: string;
}

interface SetupStatus {
  completed:    boolean;
  db:           StatusCheck;
  migrations:   StatusCheck;
  ollama:       StatusCheck;
  disk:         StatusCheck;
  orgDirectory: string;
}

async function fetchSetupStatus(): Promise<SetupStatus> {
  const res  = await fetch('/api/setup/status');
  const body = await res.json() as { success: boolean; data: SetupStatus };
  if (!body.success) throw new Error('Failed to fetch setup status');
  return body.data;
}

async function postComplete(): Promise<void> {
  const res = await fetch('/api/setup/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Failed to mark setup complete');
}

async function postOrgDir(orgDirectory: string): Promise<void> {
  const res = await fetch('/api/setup/org-dir', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ orgDirectory }),
  });
  if (!res.ok) throw new Error('Failed to update org directory');
}

// ─── Shared UI primitives ────────────────────────────────────────────────────

function StatusBadge({ check, label }: { check: StatusCheck; label: string }) {
  const Icon  = check.healthy ? CheckCircleIcon : XCircleIcon;
  const color = check.healthy ? 'text-green-400' : 'text-red-400';
  return (
    <div className="flex items-center gap-3 bg-navy-100 rounded-lg px-4 py-3">
      <Icon size={20} weight="duotone" className={color} />
      <div className="flex-1">
        <div className="text-parchment text-sm font-medium">{label}</div>
        {check.detail && <div className="text-parchment/50 text-xs mt-0.5">{check.detail}</div>}
      </div>
      <span className={`text-xs font-medium ${color}`}>{check.healthy ? 'תקין' : 'שגיאה'}</span>
    </div>
  );
}

function StepDot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
      done   ? 'bg-gold-500' :
      active ? 'bg-gold-500 ring-2 ring-gold-500/30' :
               'bg-navy-300'
    }`} />
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

function Step1Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-8">
      <div className="w-20 h-20 bg-navy-100 rounded-2xl flex items-center justify-center border border-gold-500/20">
        <RocketLaunchIcon size={40} weight="duotone" className="text-gold-500" />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-parchment font-serif mb-2">ברוך הבא ל-Factum-IL</h1>
        <p className="text-parchment/60 text-base max-w-sm">
          מערכת ניהול משפטית מקומית לעורכי דין ישראלים. נגדיר את המערכת יחד תוך דקות ספורות.
        </p>
      </div>
      <button
        onClick={onNext}
        className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        <span>בדיקת מערכת</span>
        <ArrowRightIcon size={18} weight="bold" />
      </button>
    </div>
  );
}

function Step2System({
  status, loading, onRefresh, onNext,
}: {
  status: SetupStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onNext: () => void;
}) {
  const canProceed = !!(status?.db?.healthy) && !!(status?.migrations?.healthy);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-parchment font-serif mb-1">בדיקת מערכת</h2>
        <p className="text-parchment/50 text-sm">מוודא שכל הרכיבים הנדרשים פעילים</p>
      </div>

      {loading || !status ? (
        <div className="flex justify-center py-8">
          <SpinnerIcon size={32} weight="bold" className="text-gold-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <StatusBadge check={status.db}         label="מסד נתונים" />
          <StatusBadge check={status.migrations} label="מיגרציות" />
          <StatusBadge check={status.disk}       label="מקום פנוי בדיסק" />
          <div className="flex items-center gap-3 bg-navy-100 rounded-lg px-4 py-3">
            <WarningCircleIcon
              size={20}
              weight="duotone"
              className={status.ollama?.healthy ? 'text-green-400' : 'text-yellow-400'}
            />
            <div className="flex-1">
              <div className="text-parchment text-sm font-medium">מנוע AI (Ollama)</div>
              {status.ollama?.detail && (
                <div className="text-parchment/50 text-xs mt-0.5">{status.ollama.detail}</div>
              )}
            </div>
            <span className={`text-xs font-medium ${status.ollama?.healthy ? 'text-green-400' : 'text-yellow-400'}`}>
              {status.ollama?.healthy ? 'תקין' : 'אזהרה'}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onRefresh}
          className="text-parchment/60 hover:text-parchment text-sm transition-colors"
        >
          רענן בדיקה
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-40 disabled:cursor-not-allowed text-navy-900 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          <span>המשך</span>
          <ArrowRightIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Step3OrgDir({
  status, onNext,
}: {
  status: SetupStatus | null;
  onNext: (orgDir: string) => void;
}) {
  const [orgDir, setOrgDir]   = useState(status?.orgDirectory ?? '');
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  useEffect(() => {
    if (status?.orgDirectory) setOrgDir(status.orgDirectory);
  }, [status?.orgDirectory]);

  async function handleSave() {
    if (!orgDir.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await postOrgDir(orgDir.trim());
      setSaved(true);
    } catch {
      setError('לא הצלח לשמור. בדוק הרשאות.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-parchment font-serif mb-1">תיקיית עבודה</h2>
        <p className="text-parchment/50 text-sm">תיקיית הארגון שבה נמצאים תיקי הלקוחות</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-parchment/70 text-sm">נתיב התיקייה</label>
        <div className="flex gap-2">
          <input
            dir="ltr"
            value={orgDir}
            onChange={(e) => { setOrgDir(e.target.value); setSaved(false); }}
            placeholder="C:\Legal\Cases"
            className="flex-1 bg-navy-100 border border-parchment/10 rounded-lg px-3 py-2.5 text-parchment text-sm focus:outline-none focus:border-gold-500/50 font-mono"
          />
          <button
            onClick={handleSave}
            disabled={saving || !orgDir.trim()}
            className="flex items-center gap-1.5 bg-navy-300 hover:bg-navy-400 disabled:opacity-40 text-parchment px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <FolderOpenIcon size={16} weight="duotone" />
            <span>{saving ? '...' : 'עדכן'}</span>
          </button>
        </div>
        {saved  && <div className="text-green-400 text-xs">✓ הנתיב עודכן בהצלחה</div>}
        {error  && <div className="text-red-400  text-xs">{error}</div>}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => onNext(orgDir)}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          <span>המשך</span>
          <ArrowRightIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Step4AI({
  status, onRefresh, onNext,
}: {
  status: SetupStatus | null;
  onRefresh: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold text-parchment font-serif mb-1">מנוע AI</h2>
        <p className="text-parchment/50 text-sm">Ollama + BrainboxAI/law-il-E2B</p>
      </div>

      <div className="bg-navy-100 rounded-lg p-4 flex items-start gap-3">
        <RobotIcon size={28} weight="duotone" className={status?.ollama.healthy ? 'text-green-400' : 'text-yellow-400'} />
        <div className="flex-1">
          {status?.ollama.healthy ? (
            <div>
              <div className="text-parchment font-medium text-sm">מנוע AI מוכן</div>
              <div className="text-parchment/50 text-xs mt-1">{status.ollama.detail}</div>
            </div>
          ) : (
            <div>
              <div className="text-yellow-400 font-medium text-sm">Ollama אינו פעיל</div>
              <div className="text-parchment/60 text-xs mt-1 leading-relaxed">
                המערכת תפעל ללא AI. להפעלת AI: הורד Ollama מ-ollama.com ואת המודל
                <span dir="ltr" className="font-mono mx-1">BrainboxAI/law-il-E2B:Q4_K_M</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onRefresh}
          className="text-parchment/60 hover:text-parchment text-sm transition-colors"
        >
          רענן סטטוס
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          <span>המשך</span>
          <ArrowRightIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Step5Done({
  status, onFinish, finishing,
}: {
  status: SetupStatus | null;
  onFinish: () => void;
  finishing: boolean;
}) {
  const allOk = !!status?.db.healthy && !!status.migrations.healthy && !!status.disk.healthy;

  return (
    <div className="flex flex-col items-center text-center gap-6 py-6">
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border ${
        allOk ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'
      }`}>
        <CheckCircleIcon
          size={40}
          weight="duotone"
          className={allOk ? 'text-green-400' : 'text-yellow-400'}
        />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-parchment font-serif mb-2">
          {allOk ? 'הכל מוכן!' : 'ניתן להמשיך'}
        </h2>
        <p className="text-parchment/60 text-sm max-w-xs">
          {allOk
            ? 'כל הרכיבים פעילים. Factum-IL מוכן לשימוש.'
            : 'חלק מהרכיבים אינם פעילים, אך ניתן להמשיך ולתקן מאוחר יותר.'}
        </p>
      </div>
      <button
        onClick={onFinish}
        disabled={finishing}
        className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-navy-900 font-semibold px-8 py-3 rounded-lg transition-colors"
      >
        {finishing ? (
          <SpinnerIcon size={18} weight="bold" className="animate-spin" />
        ) : (
          <RocketLaunchIcon size={18} weight="bold" />
        )}
        <span>פתח את Factum-IL</span>
      </button>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function SetupWizard() {
  const navigate = useNavigate();

  const [step,      setStep]      = useState<Step>(1);
  const [status,    setStatus]    = useState<SetupStatus | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [finishing, setFinishing] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSetupStatus();
      setStatus(s);
      if (s.completed) {
        navigate('/dashboard', { replace: true });
      }
    } catch { /* show stale state */ } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Load status on mount and auto-refresh every 5s on step 2
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (step !== 2) return;
    const id = setInterval(() => void loadStatus(), 5_000);
    return () => clearInterval(id);
  }, [step, loadStatus]);

  async function handleFinish() {
    setFinishing(true);
    try {
      await postComplete();
      navigate('/dashboard', { replace: true });
    } catch { /* proceed anyway */ } finally {
      setFinishing(false);
    }
  }

  const steps: Step[] = [1, 2, 3, 4, 5];

  return (
    <div dir="rtl" className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((s) => (
            <StepDot key={s} active={step === s} done={step > s} />
          ))}
        </div>

        {/* Card */}
        <div className="bg-navy-DEFAULT border border-parchment/10 rounded-2xl p-8 shadow-2xl">
          {step === 1 && (
            <Step1Welcome onNext={() => { void loadStatus(); setStep(2); }} />
          )}
          {step === 2 && (
            <Step2System
              status={status}
              loading={loading}
              onRefresh={() => void loadStatus()}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3OrgDir
              status={status}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <Step4AI
              status={status}
              onRefresh={() => void loadStatus()}
              onNext={() => setStep(5)}
            />
          )}
          {step === 5 && (
            <Step5Done
              status={status}
              onFinish={() => void handleFinish()}
              finishing={finishing}
            />
          )}
        </div>

        {/* Step counter */}
        <div className="text-center mt-4 text-parchment/30 text-sm">
          שלב {step} מתוך 5
        </div>
      </div>
    </div>
  );
}
