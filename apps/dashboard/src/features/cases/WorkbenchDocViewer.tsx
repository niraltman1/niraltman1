import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileTextIcon, TextAaIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { useDocument } from '@/api/hooks.js';

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif', '.webp', '.gif'];

/** Compact inline document viewer for the Workbench centre pane (M E). */
export function WorkbenchDocViewer({ docId }: { docId: number | null }) {
  const { data: doc, isLoading } = useDocument(docId ?? 0);
  const [showOcr, setShowOcr] = useState(false);

  if (docId == null) {
    return (
      <div className="bg-navy-100 border border-parchment/10 rounded-xl flex flex-col items-center justify-center text-center gap-2 p-8" style={{ minHeight: '70vh' }}>
        <FileTextIcon size={36} className="text-parchment/20" />
        <p className="text-parchment/50 text-sm">בחר מסמך מציר הזמן כדי להציגו כאן</p>
      </div>
    );
  }
  if (isLoading || !doc) {
    return <div className="bg-navy-100 border border-parchment/10 rounded-xl flex items-center justify-center text-parchment/30 text-sm" style={{ minHeight: '70vh' }}>טוען מסמך…</div>;
  }

  const d = doc as Record<string, unknown>;
  const filename = String(d['filename'] ?? '');
  const ext      = String(d['extension'] ?? '').toLowerCase();
  const mime     = String(d['mimeType'] ?? d['mime_type'] ?? '');
  const ocrText  = String(d['ocrText'] ?? d['ocr_text'] ?? '');
  const fileUrl  = `/api/documents/${docId}/file`;
  const isImage  = mime.startsWith('image/') || IMAGE_EXT.includes(ext);
  const isPdf    = mime === 'application/pdf' || ext === '.pdf';

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '70vh' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-parchment/10">
        <FileTextIcon size={14} className="text-parchment/40 shrink-0" />
        <span className="flex-1 text-parchment text-xs truncate">{filename}</span>
        {ocrText && (
          <button onClick={() => setShowOcr((v) => !v)} className={`p-1 rounded ${showOcr ? 'text-gold' : 'text-parchment/40 hover:text-parchment'}`} title="טקסט OCR">
            <TextAaIcon size={14} />
          </button>
        )}
        <Link to={`/documents/${docId}/read`} className="p-1 text-parchment/40 hover:text-parchment" title="פתח בקורא מלא">
          <ArrowSquareOutIcon size={14} />
        </Link>
      </div>
      <div className="flex-1">
        {showOcr ? (
          <p className="text-parchment/70 text-xs whitespace-pre-wrap leading-relaxed font-mono p-3 overflow-auto" dir="rtl" style={{ maxHeight: '72vh' }}>
            {ocrText || 'אין טקסט OCR'}
          </p>
        ) : isPdf ? (
          <iframe src={fileUrl} title={filename} className="w-full" style={{ height: '72vh', border: 'none', background: '#fff' }} />
        ) : isImage ? (
          <div className="overflow-auto p-3 flex items-start justify-center" style={{ height: '72vh' }}>
            <img src={fileUrl} alt={filename} style={{ maxWidth: '100%' }} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-center p-8" style={{ height: '72vh' }}>
            <FileTextIcon size={32} className="text-parchment/20" />
            <a href={fileUrl} download={filename} className="text-gold text-xs hover:underline">הורד את הקובץ</a>
          </div>
        )}
      </div>
    </div>
  );
}
