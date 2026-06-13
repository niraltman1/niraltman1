import { useState, useRef, useEffect } from 'react';
import { DownloadSimpleIcon, FilePdfIcon, FileDocIcon, SpinnerIcon } from '@phosphor-icons/react';
import { exportToPDF, exportToWord, type ExportPayload } from '@/lib/export.js';

interface Props {
  payload: ExportPayload;
  className?: string;
}

export function ExportMenu({ payload, className = '' }: Props) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<'pdf' | 'docx' | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const run = async (type: 'pdf' | 'docx') => {
    setOpen(false);
    setError(null);
    setLoading(type);
    try {
      if (type === 'pdf')  await exportToPDF(payload);
      else                  await exportToWord(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בייצוא');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-parchment/20 text-parchment/60 hover:text-parchment hover:border-parchment/40 text-xs font-medium transition-colors disabled:opacity-50"
        disabled={loading !== null}
        onClick={() => setOpen((v) => !v)}
        title="ייצוא מסמך"
      >
        {loading ? (
          <SpinnerIcon size={13} className="animate-spin" />
        ) : (
          <DownloadSimpleIcon size={13} />
        )}
        {loading ? (loading === 'pdf' ? 'מייצא PDF…' : 'מייצא Word…') : 'ייצוא'}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-navy-100 border border-parchment/15 rounded-xl shadow-xl overflow-hidden min-w-[148px]">
          <button
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-parchment/75 hover:bg-parchment/8 hover:text-parchment transition-colors"
            onClick={() => void run('pdf')}
          >
            <FilePdfIcon size={15} className="text-red-400" />
            ייצוא PDF
          </button>
          <div className="h-px bg-parchment/8" />
          <button
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-parchment/75 hover:bg-parchment/8 hover:text-parchment transition-colors"
            onClick={() => void run('docx')}
          >
            <FileDocIcon size={15} className="text-blue-400" />
            ייצוא Word
          </button>
        </div>
      )}

      {error && (
        <p className="absolute left-0 top-full mt-1 text-xs text-red-400 whitespace-nowrap">
          {error}
        </p>
      )}
    </div>
  );
}
