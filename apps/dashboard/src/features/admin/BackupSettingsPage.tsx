import { useState } from 'react';
import { HardDriveIcon, FolderOpenIcon, CircleNotchIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { useCreateBackup, useBackupSnapshots } from '@/api/hooks.js';
import { SecurityStatusPanel } from '@/components/admin/SecurityStatusPanel.js';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-parchment/10 overflow-hidden" style={{ background: 'var(--bg-2)' }}>
      <div className="px-5 py-3 border-b border-parchment/10">
        <h2 className="text-sm font-semibold text-parchment/80">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function BackupSettingsPage() {
  const [backupDir, setBackupDir] = useState(
    localStorage.getItem('backupDir') ?? '',
  );
  const [saved, setSaved] = useState(false);

  const createBackup  = useCreateBackup();
  const { data: snaps } = useBackupSnapshots();

  function openFolderPicker() {
    if (window.chrome?.webview) {
      window.chrome.webview.postMessage('openFolderPicker');
    }
  }

  function saveBackupDir() {
    localStorage.setItem('backupDir', backupDir);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const lastSnap = snaps?.[snaps.length - 1];

  return (
    <div className="max-w-2xl mx-auto space-y-5 py-2">
      <div className="flex items-center gap-3 mb-6">
        <HardDriveIcon size={22} weight="duotone" style={{ color: 'var(--brand-cyan)' }} />
        <h1 className="text-xl font-bold text-parchment">הגדרות גיבוי</h1>
      </div>

      {/* Encryption explanation */}
      <Section title="הגנת הגיבויים — AES-256">
        <p className="text-parchment/70 text-sm leading-relaxed">
          כל הגיבויים מוצפנים במחשב שלך בטכנולוגיית AES-256. המפתח לא עוזב את המחשב לעולם.
          זה כמו כספת דיגיטלית — אפילו אם הקובץ יגנב, איש לא יוכל לפתוח אותו.
        </p>
      </Section>

      {/* Backup directory */}
      <Section title="תיקיית גיבויים">
        <div className="flex gap-2">
          <input
            type="text"
            value={backupDir}
            onChange={(e) => setBackupDir(e.target.value)}
            placeholder="נתיב לתיקיית הגיבויים…"
            dir="ltr"
            className="flex-1 rounded-lg px-3 py-2 text-sm border border-parchment/15
                       bg-navy-900/30 text-parchment placeholder-parchment/30
                       focus:outline-none focus:border-brand-cyan"
          />
          <button
            onClick={openFolderPicker}
            title="בחר תיקייה"
            className="btn-secondary px-3"
          >
            <FolderOpenIcon size={16} weight="duotone" />
          </button>
        </div>
        <button
          onClick={saveBackupDir}
          className="btn-primary mt-3 text-sm"
          disabled={!backupDir}
        >
          {saved ? <><CheckCircleIcon size={14} weight="fill" /> נשמר</> : 'שמור נתיב'}
        </button>
      </Section>

      {/* Security status */}
      <Section title="מצב הצפנה">
        <SecurityStatusPanel />
      </Section>

      {/* Manual backup */}
      <Section title="גיבוי ידני">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-parchment/80">צור תמונת מצב עכשיו</p>
            {lastSnap && (
              <p className="text-xs text-parchment/40 mt-0.5">
                גיבוי אחרון:{' '}
                {lastSnap['created_at']
                  ? new Date(String(lastSnap['created_at'])).toLocaleString('he-IL')
                  : '—'}
              </p>
            )}
          </div>
          <button
            onClick={() => createBackup.mutate()}
            disabled={createBackup.isPending}
            className="btn-primary text-sm"
          >
            {createBackup.isPending
              ? <><CircleNotchIcon size={14} className="animate-spin" /> מגבה…</>
              : 'גיבוי עכשיו'}
          </button>
        </div>
        {createBackup.isSuccess && (
          <p className="text-xs text-green-400 mt-2">הגיבוי נוצר בהצלחה.</p>
        )}
        {createBackup.isError && (
          <p className="text-xs text-red-400 mt-2">שגיאה ביצירת הגיבוי.</p>
        )}
      </Section>
    </div>
  );
}
