import { useState } from 'react';
import { CircleNotchIcon, WarningCircleIcon, CheckCircleIcon } from '@phosphor-icons/react';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface BundleResult {
  path: string;
}

type ExportState = 'idle' | 'loading' | 'success' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
//  Inline SVG — download icon
// ─────────────────────────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M224,152v56a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V152a8,8,0,0,1,16,0v56H208V152a8,8,0,0,1,16,0ZM117.66,138.34a8,8,0,0,0,11.31,0l40-40A8,8,0,0,0,157.66,86.34L136,108V32a8,8,0,0,0-16,0v76L98.34,86.34A8,8,0,0,0,86.66,98.34Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────────────────────────────────────

export function SupportExportButton() {
  const [state, setState]   = useState<ExportState>('idle');
  const [result, setResult] = useState<BundleResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleExport() {
    setState('loading');
    setResult(null);

    try {
      const res = await fetch('/api/diagnostics/bundle', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // The API may return { success, data } wrapper or a direct object.
      const body = (await res.json()) as
        | { success: true; data: BundleResult }
        | { path: string };

      const path = 'success' in body ? body.data.path : body.path;
      setResult({ path });
      setState('success');
    } catch {
      setState('error');
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silently ignore
    }
  }

  return (
    <div dir="rtl" className="space-y-2">
      {/* Main button */}
      <button
        onClick={() => void handleExport()}
        disabled={state === 'loading'}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gold/20 hover:bg-gold/30
                   text-gold text-sm font-medium rounded-lg border border-gold/30
                   transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === 'loading'
          ? <CircleNotchIcon size={14} className="animate-spin" />
          : <DownloadIcon />}
        {state === 'loading' ? 'מייצא…' : 'ייצא חבילת תמיכה'}
      </button>

      {/* Success state */}
      {state === 'success' && result && (
        <div className="flex items-start gap-2 px-3 py-2 bg-green-900/20 border border-green-700/30
                        rounded-lg text-xs">
          <CheckCircleIcon size={14} className="text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-green-300 font-medium">הקובץ יוצא בהצלחה</p>
            <div className="flex items-center gap-2">
              <span
                dir="ltr"
                className="text-parchment/50 font-mono text-[10px] truncate flex-1"
              >
                {result.path}
              </span>
              <button
                onClick={() => void handleCopy()}
                title="העתק נתיב"
                className="shrink-0 text-parchment/40 hover:text-parchment transition-colors"
              >
                {copied
                  ? <CheckCircleIcon size={12} className="text-green-400" />
                  : <CopyIcon />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/30
                        rounded-lg text-xs text-red-400">
          <WarningCircleIcon size={14} className="shrink-0" />
          שגיאה בייצוא — נסה שוב
        </div>
      )}
    </div>
  );
}
