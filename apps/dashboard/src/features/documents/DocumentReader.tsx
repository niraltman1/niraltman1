import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRightIcon, FileTextIcon, DownloadSimpleIcon,
  MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, TextAaIcon, RobotIcon,
} from '@phosphor-icons/react';
import { useDocument } from '@/api/hooks.js';

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif', '.webp', '.gif'];

export function DocumentReader() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const { data: doc, isLoading, isError } = useDocument(docId);
  const [zoom, setZoom] = useState(1);
  const [showOcr, setShowOcr] = useState(false);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-parchment/30 text-sm">טוען מסמך…</div>;
  }
  if (isError || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <FileTextIcon size={36} className="text-parchment/20" />
        <p className="text-parchment/40 text-sm">מסמך לא נמצא</p>
        <Link to="/documents" className="text-gold text-xs hover:underline">← חזרה לרשימת מסמכים</Link>
      </div>
    );
  }

  const d = doc as Record<string, unknown>;
  const filename = String(d['filename'] ?? '');
  const ext      = String(d['extension'] ?? '').toLowerCase();
  const mime     = String(d['mimeType'] ?? d['mime_type'] ?? '');
  const ocrText  = String(d['ocrText'] ?? d['ocr_text'] ?? '');
  const fileUrl  = `/api/documents/${docId}/file`;

  const isImage = mime.startsWith('image/') || IMAGE_EXT.includes(ext);
  const isPdf   = mime === 'application/pdf' || ext === '.pdf';

  return (
    <div className="space-y-3" dir="rtl">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/documents/${docId}`} className="inline-flex items-center gap-1 text-parchment/40 text-xs hover:text-parchment shrink-0">
            <ArrowRightIcon size={12} />
            פרטי מסמך
          </Link>
          <span className="text-parchment font-medium truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isImage && (
            <>
              <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} className="p-1.5 text-parchment/50 hover:text-parchment" aria-label="הקטן">
                <MagnifyingGlassMinusIcon size={16} />
              </button>
              <span className="text-xs text-parchment/50 w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="p-1.5 text-parchment/50 hover:text-parchment" aria-label="הגדל">
                <MagnifyingGlassPlusIcon size={16} />
              </button>
            </>
          )}
          {ocrText && (
            <button
              onClick={() => setShowOcr((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${showOcr ? 'text-gold border-gold/30 bg-gold/10' : 'text-parchment/60 border-parchment/15 hover:bg-parchment/5'}`}
            >
              <TextAaIcon size={13} />
              טקסט OCR
            </button>
          )}
          <a href={fileUrl} download={filename} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-parchment/60 border border-parchment/15 rounded-lg hover:bg-parchment/5">
            <DownloadSimpleIcon size={13} />
            הורד
          </a>
          <Link to={`/documents/${docId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/10">
            <RobotIcon size={13} />
            תובנות AI
          </Link>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${showOcr ? 'lg:grid-cols-2' : ''} gap-3`}>
        {/* Render surface */}
        <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden" style={{ minHeight: '70vh' }}>
          {isPdf ? (
            <iframe src={fileUrl} title={filename} className="w-full" style={{ height: '78vh', border: 'none', background: '#fff' }} />
          ) : isImage ? (
            <div className="overflow-auto p-4 flex items-start justify-center" style={{ height: '78vh' }}>
              <img src={fileUrl} alt={filename} style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', maxWidth: '100%' }} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-center p-8" style={{ height: '78vh' }}>
              <FileTextIcon size={40} className="text-parchment/20" />
              <p className="text-parchment/50 text-sm">לא ניתן להציג קובץ מסוג זה בתצוגה מקדימה</p>
              <a href={fileUrl} download={filename} className="text-gold text-xs hover:underline">הורד את הקובץ ({ext || mime || 'קובץ'})</a>
              {ocrText && <p className="text-parchment/40 text-xs">השתמש ב״טקסט OCR״ כדי לקרוא את התוכן שחולץ.</p>}
            </div>
          )}
        </div>

        {/* OCR text layer */}
        {showOcr && (
          <div className="bg-navy-100 border border-parchment/10 rounded-xl p-4 overflow-auto" style={{ maxHeight: '78vh' }}>
            <h2 className="text-parchment/50 text-xs font-semibold uppercase tracking-widest mb-2">טקסט שחולץ (OCR)</h2>
            <p className="text-parchment/70 text-sm whitespace-pre-wrap leading-relaxed font-mono text-[12px]" dir="rtl">
              {ocrText || 'אין טקסט OCR למסמך זה'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
