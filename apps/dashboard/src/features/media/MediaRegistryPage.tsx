import { useState } from 'react';
import {
  FileImageIcon, FilePdfIcon, CheckCircleIcon, WarningCircleIcon,
  CircleNotchIcon, SealCheckIcon, ClockIcon, UploadSimpleIcon,
  ArrowCounterClockwiseIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';
import {
  useMediaRegistry, useMediaRegistryStats, useMediaHealth,
  useIngestFile, type ProcessedFileEntry,
} from '@/api/hooks.js';

type StatusFilter = 'all' | 'complete' | 'converting' | 'pending' | 'failed' | 'skipped';

const STATUS_BADGE: Record<string, string> = {
  complete:   'badge bg-green-500/15 text-green-400 border border-green-500/30',
  converting: 'badge bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  ocr:        'badge bg-blue-500/15 text-blue-400 border border-blue-500/30',
  pending:    'badge bg-parchment/10 text-parchment/40 border border-parchment/10',
  hashing:    'badge bg-parchment/10 text-parchment/40 border border-parchment/10',
  failed:     'badge bg-red-500/15 text-red-400 border border-red-500/30',
  skipped:    'badge bg-parchment/5 text-parchment/25 border border-parchment/5',
};

const STATUS_LABEL: Record<string, string> = {
  complete:   'הושלם',
  converting: 'ממיר',
  ocr:        'OCR',
  pending:    'ממתין',
  hashing:    'גיבוב',
  failed:     'נכשל',
  skipped:    'דולג',
};

import type { ReactElement } from 'react';

const STATUS_ICON: Record<string, ReactElement> = {
  complete:   <CheckCircleIcon size={14} weight="fill" className="text-green-400" />,
  converting: <CircleNotchIcon size={14} className="text-yellow-400 animate-spin" />,
  ocr:        <CircleNotchIcon size={14} className="text-blue-400 animate-spin" />,
  pending:    <ClockIcon size={14} className="text-parchment/30" />,
  hashing:    <CircleNotchIcon size={14} className="text-parchment/40 animate-spin" />,
  failed:     <WarningCircleIcon size={14} weight="fill" className="text-red-400" />,
  skipped:    <ArrowCounterClockwiseIcon size={14} className="text-parchment/20" />,
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024)   return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function basename(path: string): string {
  return path.replace(/.*[\\/]/, '');
}

export function MediaRegistryPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page,         setPage]         = useState(1);
  const [ingestPath,   setIngestPath]   = useState('');
  const [ingestClient, setIngestClient] = useState('');

  const { data: registryData, isLoading } = useMediaRegistry(page, statusFilter === 'all' ? undefined : statusFilter);
  const { data: stats }   = useMediaRegistryStats();
  const { data: health }  = useMediaHealth();
  const ingest            = useIngestFile();

  const items   = registryData?.items ?? [];
  const total   = registryData?.total ?? 0;
  const hasNext = registryData?.hasNextPage ?? false;

  async function handleIngest() {
    if (!ingestPath.trim()) return;
    const opts: { filePath: string; clientName?: string } = { filePath: ingestPath.trim() };
    if (ingestClient.trim()) opts.clientName = ingestClient.trim();
    await ingest.mutateAsync(opts);
    setIngestPath('');
    setIngestClient('');
  }

  const tabCounts: Record<StatusFilter, number> = {
    all:        stats?.total     ?? 0,
    complete:   stats?.complete  ?? 0,
    converting: stats?.converting ?? 0,
    pending:    stats?.pending   ?? 0,
    failed:     stats?.failed    ?? 0,
    skipped:    stats?.skipped   ?? 0,
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="px-6 py-5 border-b border-parchment/10 bg-navy/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileImageIcon size={24} weight="duotone" className="text-gold" />
            <div>
              <h1 className="font-serif font-bold text-parchment text-xl">רישום מדיה</h1>
              <p className="text-parchment/50 text-sm mt-0.5">
                SHA-256 Deduplication Registry — המרת תמונות ל-PDF גניח לחיפוש
              </p>
            </div>
          </div>

          {/* Tool health badges */}
          {health && (
            <div className="flex items-center gap-2">
              <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${
                health.tesseract ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'
              }`}>
                <ShieldCheckIcon size={12} />
                Tesseract {health.tesseract ? '✓' : '✗'}
              </span>
              <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${
                health.imageMagick ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-parchment/30 border-parchment/10'
              }`}>
                ImageMagick {health.imageMagick ? '✓ (HEIC)' : '—'}
              </span>
            </div>
          )}
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="text-center">
              <p className="text-parchment font-bold text-lg">{stats.total}</p>
              <p className="text-parchment/40 text-xs">סה"כ קבצים</p>
            </div>
            <div className="text-center">
              <p className="text-green-400 font-bold text-lg">{stats.complete}</p>
              <p className="text-parchment/40 text-xs">הושלמו</p>
            </div>
            {stats.converting > 0 && (
              <div className="text-center">
                <p className="text-yellow-400 font-bold text-lg">{stats.converting}</p>
                <p className="text-parchment/40 text-xs">ממיר</p>
              </div>
            )}
            {stats.failed > 0 && (
              <div className="text-center">
                <p className="text-red-400 font-bold text-lg">{stats.failed}</p>
                <p className="text-parchment/40 text-xs">נכשלו</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-parchment/50 font-bold text-lg">{stats.skipped}</p>
              <p className="text-parchment/40 text-xs">דולגו (כפילות)</p>
            </div>
          </div>
        )}
      </div>

      {/* Ingest panel */}
      <div className="px-6 py-3 border-b border-parchment/10 bg-navy/10">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs text-parchment/50 mb-1">נתיב קובץ לקליטה</label>
            <input
              type="text"
              value={ingestPath}
              onChange={(e) => setIngestPath(e.target.value)}
              placeholder="C:\Users\...\Downloads\scan001.jpg"
              className="form-input text-sm font-mono"
              dir="ltr"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleIngest(); }}
            />
          </div>
          <div className="w-48">
            <label className="block text-xs text-parchment/50 mb-1">שם לקוח (אופציונלי)</label>
            <input
              type="text"
              value={ingestClient}
              onChange={(e) => setIngestClient(e.target.value)}
              placeholder="כהן דוד"
              className="form-input text-sm"
              dir="rtl"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleIngest()}
            disabled={!ingestPath.trim() || ingest.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded bg-gold text-navy font-semibold text-sm
                       hover:bg-gold/90 disabled:opacity-40 transition-colors shrink-0"
          >
            {ingest.isPending
              ? <CircleNotchIcon size={15} className="animate-spin" />
              : <UploadSimpleIcon size={15} weight="bold" />
            }
            קלוט
          </button>
        </div>

        {/* Ingest result */}
        {ingest.isSuccess && ingest.data && (
          <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded ${
            ingest.data.status === 'failed'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-green-500/10 text-green-400'
          }`}>
            {ingest.data.status === 'failed'
              ? <WarningCircleIcon size={14} weight="fill" />
              : <CheckCircleIcon size={14} weight="fill" />
            }
            {ingest.data.message}
          </div>
        )}
        {ingest.isError && (
          <p className="mt-2 text-xs text-red-400 px-3 py-2 bg-red-500/10 rounded">
            שגיאה בקליטה — בדוק את נתיב הקובץ
          </p>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-6 py-2 border-b border-parchment/10 flex items-center gap-1.5">
        {(['all', 'complete', 'converting', 'pending', 'failed', 'skipped'] as StatusFilter[]).map((s) => {
          const labels: Record<StatusFilter, string> = {
            all: 'הכל', complete: 'הושלם', converting: 'ממיר', pending: 'ממתין', failed: 'נכשל', skipped: 'דולג',
          };
          return (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1 rounded text-xs transition-colors
                ${statusFilter === s
                  ? 'bg-gold/15 text-gold border border-gold/30'
                  : 'text-parchment/50 hover:text-parchment border border-transparent'}`}
            >
              {labels[s]}
              <span className="mr-1.5 text-parchment/30">{tabCounts[s]}</span>
            </button>
          );
        })}
        <span className="mr-auto text-xs text-parchment/30">{total} קבצים</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-parchment/40 text-sm">
            <CircleNotchIcon size={16} className="animate-spin" />
            טוען…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <FileImageIcon size={40} className="text-parchment/20" />
            <p className="text-parchment/40 text-sm">
              {statusFilter === 'all'
                ? 'לא נקלטו קבצים עדיין. הזן נתיב קובץ בשדה למעלה.'
                : `אין קבצים בסטטוס "${STATUS_LABEL[statusFilter] ?? statusFilter}"`}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm" dir="rtl">
            <thead className="sticky top-0 bg-navy-100 border-b border-parchment/10 z-10">
              <tr className="text-parchment/40 text-xs">
                <th className="text-right px-4 py-2 font-medium">קובץ</th>
                <th className="text-right px-4 py-2 font-medium">סטטוס</th>
                <th className="text-right px-4 py-2 font-medium">גודל</th>
                <th className="text-right px-4 py-2 font-medium">Hash</th>
                <th className="text-right px-4 py-2 font-medium">תאריך</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment/5">
              {items.map((item) => (
                <FileRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="px-6 py-3 border-t border-parchment/10 flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-xs rounded border border-parchment/20 text-parchment/60 disabled:opacity-30"
          >
            הקודם
          </button>
          <span className="text-xs text-parchment/40">עמוד {page}</span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-xs rounded border border-parchment/20 text-parchment/60 disabled:opacity-30"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({ item }: { item: ProcessedFileEntry }) {
  const isImage = item.mimeType?.startsWith('image/');
  const hasPdf  = !!item.convertedPdfPath;

  return (
    <tr className="hover:bg-navy/20 transition-colors">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          {hasPdf
            ? <FilePdfIcon size={16} className="text-red-400/70 shrink-0" />
            : isImage
              ? <FileImageIcon size={16} className="text-blue-400/70 shrink-0" />
              : <FileImageIcon size={16} className="text-parchment/30 shrink-0" />
          }
          <div className="min-w-0">
            <p className="text-parchment text-xs font-medium truncate max-w-[200px]" title={item.originalName}>
              {item.originalName}
            </p>
            {hasPdf && (
              <p className="text-green-400/70 text-xs truncate max-w-[200px]" title={item.convertedPdfPath ?? ''}>
                → {item.convertedPdfPath ? basename(item.convertedPdfPath) : ''}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {STATUS_ICON[item.processingStatus]}
          <span className={STATUS_BADGE[item.processingStatus] ?? ''}>
            {STATUS_LABEL[item.processingStatus] ?? item.processingStatus}
          </span>
        </div>
        {item.skipReason && (
          <p className="text-parchment/25 text-xs mt-0.5">{item.skipReason}</p>
        )}
      </td>
      <td className="px-4 py-2.5 text-parchment/50 text-xs font-mono">
        {formatBytes(item.fileSizeBytes)}
      </td>
      <td className="px-4 py-2.5">
        <span className="text-parchment/30 text-xs font-mono" title={item.fileHash}>
          {item.fileHash.slice(0, 8)}…
        </span>
      </td>
      <td className="px-4 py-2.5 text-parchment/40 text-xs">
        {new Date(item.createdAt).toLocaleDateString('he-IL')}
      </td>
    </tr>
  );
}
