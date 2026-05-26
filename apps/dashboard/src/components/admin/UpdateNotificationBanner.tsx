import { useEffect, useRef, useState } from 'react';

interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  channel: string;
  mandatory?: boolean;
  releaseNotes?: string | null;
  assetUrl?: string | null;
  error?: string;
}

export function UpdateNotificationBanner() {
  const [update, setUpdate]     = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function checkForUpdate() {
    try {
      const res = await fetch('/api/updates/app-check');
      if (!res.ok) return;
      const data = (await res.json()) as UpdateCheckResult;
      if (data.available) setUpdate(data);
    } catch {
      // Network unavailable — silent failure
    }
  }

  useEffect(() => {
    void checkForUpdate();
    intervalRef.current = setInterval(() => void checkForUpdate(), 60 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!update || dismissed) return null;

  return (
    <div
      role="alert"
      dir="rtl"
      style={{
        background:   'linear-gradient(90deg, #1A2B4A 0%, #0E1629 100%)',
        borderBottom: '1px solid rgba(201,169,79,0.35)',
        padding:      '10px 20px',
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        fontSize:     13,
        color:        'var(--fg-1, #DCE3EC)',
        flexShrink:   0,
      }}
    >
      {/* Gold dot indicator */}
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#C9A94F', flexShrink: 0,
          boxShadow: '0 0 6px #C9A94F88',
        }}
      />

      <span style={{ flex: 1 }}>
        <strong style={{ color: '#C9A94F' }}>
          עדכון זמין: גרסה {update.latestVersion}
        </strong>
        {update.mandatory === true && (
          <span
            style={{
              marginRight: 8, marginLeft: 4,
              background: '#7B2D2D', color: '#FFAAAA',
              borderRadius: 4, padding: '1px 6px', fontSize: 11,
            }}
          >
            נדרש
          </span>
        )}
        {update.releaseNotes != null && update.releaseNotes.length > 0 && (
          <span style={{ marginRight: 8, color: 'var(--fg-3, #8A95A3)' }}>
            — {update.releaseNotes.slice(0, 80)}{update.releaseNotes.length > 80 ? '…' : ''}
          </span>
        )}
      </span>

      {update.assetUrl != null && (
        <a
          href={update.assetUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            background: '#C9A94F', color: '#0A1428',
            borderRadius: 5, padding: '4px 12px',
            fontWeight: 600, fontSize: 12,
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          הורד עדכון
        </a>
      )}

      {update.mandatory !== true && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: 'none', border: 'none',
            color: 'var(--fg-3, #8A95A3)', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, padding: '0 4px',
          }}
          aria-label="סגור התראה"
        >
          ×
        </button>
      )}
    </div>
  );
}
