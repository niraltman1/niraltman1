import { useEffect, useRef, useState } from 'react';

interface UpdateCheckResult {
  available:       boolean;
  currentVersion:  string;
  latestVersion?:  string;
  channel:         string;
  mandatory?:      boolean;
  releaseNotes?:   string | null;
  assetUrl?:       string | null;
  error?:          string;
}

type DownloadState = 'idle' | 'downloading' | 'verified' | 'launching' | 'error';

export function UpdateNotificationBanner() {
  const [update,      setUpdate]      = useState<UpdateCheckResult | null>(null);
  const [dismissed,   setDismissed]   = useState(false);
  const [dlState,     setDlState]     = useState<DownloadState>('idle');
  const [progress,    setProgress]    = useState(0);   // 0–100
  const [dlError,     setDlError]     = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef       = useRef<EventSource | null>(null);

  async function checkForUpdate() {
    try {
      const res = await fetch('/api/updates/app-check');
      if (!res.ok) return;
      const data = (await res.json()) as { success: boolean; data: UpdateCheckResult };
      if (data.success && data.data.available) setUpdate(data.data);
    } catch { /* silent */ }
  }

  useEffect(() => {
    void checkForUpdate();
    intervalRef.current = setInterval(() => void checkForUpdate(), 60 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      esRef.current?.close();
    };
  }, []);

  function startDownload() {
    if (dlState === 'downloading' || dlState === 'launching') return;
    setDlState('downloading');
    setProgress(0);
    setDlError(null);

    const es = new EventSource('/api/updates/start');
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>;
        if (msg['type'] === 'progress') {
          setProgress(Number(msg['percentComplete'] ?? 0));
        } else if (msg['type'] === 'verified') {
          setDlState('verified');
        } else if (msg['type'] === 'launching') {
          setDlState('launching');
        } else if (msg['type'] === 'error') {
          setDlState('error');
          setDlError(String(msg['error'] ?? 'שגיאה לא ידועה'));
          es.close();
        }
      } catch { /* ignore malformed event */ }
    };

    es.onerror = () => {
      // SSE connection closes after stream ends — normal on success/launching.
      // Use functional form to read current state without closure capture issues.
      setDlState((prev) => {
        if (prev !== 'launching' && prev !== 'verified') {
          setDlError('החיבור לשרת נותק');
          return 'error';
        }
        return prev;
      });
      es.close();
    };
  }

  async function handleAbort() {
    esRef.current?.close();
    await fetch('/api/updates/abort', { method: 'POST' }).catch(() => undefined);
    setDlState('idle');
    setProgress(0);
  }

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
        {dlState === 'downloading' && (
          <span style={{ marginRight: 12 }}>
            <span
              style={{
                display: 'inline-block', width: 120, height: 6,
                background: '#1A2B4A', borderRadius: 3, verticalAlign: 'middle',
                border: '1px solid #C9A94F44', overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block', height: '100%',
                  width: `${progress}%`,
                  background: '#C9A94F',
                  transition: 'width 0.3s ease',
                }}
              />
            </span>
            <span style={{ marginRight: 6, color: '#C9A94F' }}>{progress}%</span>
          </span>
        )}
        {dlState === 'verified'  && <span style={{ marginRight: 8, color: '#6EE7B7' }}>✓ מאומת — מפעיל...</span>}
        {dlState === 'launching' && <span style={{ marginRight: 8, color: '#6EE7B7' }}>✓ מפעיל מתקין...</span>}
        {dlState === 'error'     && (
          <span style={{ marginRight: 8, color: '#FCA5A5' }}>
            ✗ {dlError}
          </span>
        )}
        {update.releaseNotes != null && update.releaseNotes.length > 0 && dlState === 'idle' && (
          <span style={{ marginRight: 8, color: 'var(--fg-3, #8A95A3)' }}>
            — {update.releaseNotes.slice(0, 80)}{update.releaseNotes.length > 80 ? '…' : ''}
          </span>
        )}
      </span>

      {/* Action buttons */}
      {dlState === 'idle' && (
        <button
          type="button"
          onClick={startDownload}
          style={{
            background: '#C9A94F', color: '#0A1428',
            borderRadius: 5, padding: '4px 12px',
            fontWeight: 600, fontSize: 12, border: 'none',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          הורד והתקן
        </button>
      )}
      {dlState === 'error' && (
        <button
          type="button"
          onClick={startDownload}
          style={{
            background: '#374151', color: '#DCE3EC',
            borderRadius: 5, padding: '4px 12px',
            fontWeight: 600, fontSize: 12, border: 'none',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          נסה שוב
        </button>
      )}
      {dlState === 'downloading' && (
        <button
          type="button"
          onClick={() => void handleAbort()}
          style={{
            background: 'none', border: '1px solid #6B7280',
            color: '#9CA3AF', cursor: 'pointer',
            borderRadius: 5, padding: '3px 10px', fontSize: 12,
          }}
        >
          ביטול
        </button>
      )}

      {update.mandatory !== true && dlState === 'idle' && (
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
