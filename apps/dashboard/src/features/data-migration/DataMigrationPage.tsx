// DataMigrationPage — /data-migration
// Phase 3B: Database Intelligence Platform — preview-only (no import execution).

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  DatabaseIcon, WarningIcon, MagnifyingGlassIcon, ArrowRightIcon,
  CheckCircleIcon, DownloadSimpleIcon, FolderIcon, FileIcon,
} from '@phosphor-icons/react';

// ── Types (mirrored from @factum-il/database-intelligence) ──────────────────

interface ColumnInfo   { name: string; type: string; nullable: boolean; primaryKey: boolean }
interface TableInfo    { name: string; rowCount: number; columns: ColumnInfo[]; sampleRows: Record<string, unknown>[] }
interface TableMapping { sourceTable: string; targetTable: string; confidence: number; matchedBy: string; transforms: { kind: string; detail: string }[]; conflicts: string[]; unmappedColumns: string[] }

interface ScanResult {
  sourceType: string;
  sourcePath: string;
  scannedAt:  string;
  tables:     TableInfo[];
  totalRows:  number;
  fileSizeBytes: number;
}

interface AnalysisResult {
  snapshot:       ScanResult;
  mappings:       TableMapping[];
  unmappedTables: string[];
  warnings:       string[];
}

interface MappingReport {
  generatedAt:    string;
  sourceSnapshot: ScanResult;
  mappings:       TableMapping[];
  unmappedTables: string[];
  warnings:       string[];
}

interface PlanResult {
  generatedAt: string;
  steps:       { order: number; sourceTable: string; targetTable: string; estimatedSec: number }[];
  totalEstSec: number;
  warnings:    string[];
}

interface DocInventory {
  generatedAt:     string;
  rootPath:        string;
  totalFiles:      number;
  supportedFiles:  number;
  unsupportedFiles: number;
  duplicates:      number;
  byExtension:     Record<string, number>;
  estimatedHours:  number;
  warnings:        string[];
}

interface FileStructure {
  generatedAt:    string;
  rootPath:       string;
  totalFolders:   number;
  maxDepth:       number;
  namingIssues:   string[];
  migrationNotes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res  = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!json.success) throw new Error(json.error?.message ?? 'API error');
  return json.data;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'var(--ok)';
  if (c >= 0.6) return 'var(--warn)';
  return 'var(--bad)';
}

function fmtBytes(b: number): string {
  if (b > 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b > 1_024)     return `${(b / 1_024).toFixed(0)} KB`;
  return `${b} B`;
}

// ── Source type tabs ─────────────────────────────────────────────────────────

type SourceType = 'sqlite' | 'csv' | 'excel';

const SOURCE_TYPES: { type: SourceType; label: string; hint: string }[] = [
  { type: 'sqlite', label: 'SQLite', hint: 'נתיב לקובץ .db / .sqlite' },
  { type: 'csv',    label: 'CSV',    hint: 'נתיב לתיקיית קבצי CSV' },
  { type: 'excel',  label: 'Excel',  hint: 'נתיב לקובץ .xlsx' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function DataMigrationPage() {
  const [sourceType, setSourceType]     = useState<SourceType>('sqlite');
  const [sourcePath, setSourcePath]     = useState('');
  const [docPath, setDocPath]           = useState('');
  const scanMut        = useMutation({ mutationFn: () => postJSON<{ snapshot: ScanResult }>('/api/data-migration/scan', { path: sourcePath, type: sourceType }) });
  const analyzeMut     = useMutation({ mutationFn: () => postJSON<{ analysis: AnalysisResult }>('/api/data-migration/analyze', { path: sourcePath, type: sourceType }) });
  const reportMut      = useMutation({ mutationFn: () => postJSON<{ report: MappingReport }>('/api/data-migration/report', { path: sourcePath, type: sourceType }) });
  const planMut        = useMutation({ mutationFn: () => postJSON<{ plan: PlanResult }>('/api/data-migration/plan', { path: sourcePath, type: sourceType }) });
  const docInventoryMut = useMutation({ mutationFn: () => postJSON<{ report: DocInventory }>('/api/data-migration/document-inventory', { path: docPath }) });
  const fileStructMut  = useMutation({ mutationFn: () => postJSON<{ report: FileStructure }>('/api/data-migration/file-structure', { path: docPath }) });

  const snapshot  = scanMut.data?.snapshot;
  const analysis  = analyzeMut.data?.analysis;
  const report    = reportMut.data?.report;
  const plan      = planMut.data?.plan;
  const docReport = docInventoryMut.data?.report;
  const fsReport  = fileStructMut.data?.report;

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `factum-migration-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir="rtl" style={{ padding: '24px', maxWidth: 1000 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3 mb-2">
          <DatabaseIcon size={20} weight="duotone" style={{ color: 'var(--info)' }} />
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-1)', margin: 0 }}>
            ייבוא נתונים
          </h1>
        </div>
        <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>
          פלטפורמת מיגרציה חכמה — סריקה, ניתוח סמנטי, מיפוי אוטומטי לטבלאות Factum-IL.
        </p>
      </div>

      {/* Preview-only banner */}
      <div
        className="cyber-panel flex items-center gap-3 mb-4"
        style={{ padding: '10px 14px', borderColor: 'rgba(197,160,89,0.3)', background: 'rgba(197,160,89,0.04)' }}
      >
        <WarningIcon size={14} weight="fill" style={{ color: 'var(--warn)', flexShrink: 0 }} />
        <span style={{ color: 'var(--warn)', fontSize: 12 }}>
          תצוגה מקדימה בלבד — ביצוע ייבוא יהיה זמין בעדכון עתידי. כל הפעולות הן לקריאה בלבד.
        </span>
      </div>

      <div className="flex flex-col gap-4">

        {/* Section 1 — Source Selection */}
        <div className="cyber-panel">
          <div className="cyber-panel-header">
            <div className="flex items-center gap-2.5">
              <DatabaseIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                1. בחירת מקור נתונים
              </span>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {/* Source type tabs */}
            <div className="flex gap-2 mb-3">
              {SOURCE_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setSourceType(type)}
                  className={`btn btn-sm ${sourceType === type ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 11 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder={SOURCE_TYPES.find((s) => s.type === sourceType)?.hint ?? ''}
                style={{
                  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)',
                  borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--fg-1)',
                  fontFamily: 'var(--f-mono)',
                }}
              />
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={!sourcePath.trim() || scanMut.isPending}
                onClick={() => scanMut.mutate()}
                style={{ fontSize: 11 }}
              >
                <MagnifyingGlassIcon size={11} />
                סרוק
              </button>
            </div>
            {scanMut.isError && (
              <p style={{ color: 'var(--bad)', fontSize: 11, marginTop: 8 }}>שגיאה: {String(scanMut.error)}</p>
            )}
          </div>
        </div>

        {/* Section 2 — Schema Preview */}
        {snapshot && (
          <div className="cyber-panel">
            <div className="cyber-panel-header">
              <div className="flex items-center gap-2.5">
                <FileIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                  2. תצוגת סכמה
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={analyzeMut.isPending}
                onClick={() => analyzeMut.mutate()}
                style={{ fontSize: 10 }}
              >
                <ArrowRightIcon size={11} />
                נתח מיפוי
              </button>
            </div>
            <div style={{ padding: '8px 12px' }}>
              <div className="flex gap-4 mb-3 px-2" style={{ fontSize: 11, color: 'var(--fg-4)' }}>
                <span>טבלאות: <strong style={{ color: 'var(--fg-1)' }}>{snapshot.tables.length}</strong></span>
                <span>רשומות: <strong style={{ color: 'var(--fg-1)' }}>{snapshot.totalRows.toLocaleString()}</strong></span>
                <span>גודל: <strong style={{ color: 'var(--fg-1)' }}>{fmtBytes(snapshot.fileSizeBytes)}</strong></span>
                <span>סוג: <strong style={{ color: 'var(--fg-1)' }}>{snapshot.sourceType}</strong></span>
              </div>
              <div className="flex flex-col gap-1">
                {snapshot.tables.map((tbl) => (
                  <div key={tbl.name} className="flex items-center gap-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-1)', minWidth: 160 }}>{tbl.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--fg-4)', minWidth: 90 }}>{tbl.rowCount.toLocaleString()} רשומות</span>
                    <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>{tbl.columns.map((c) => c.name).join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Section 3 — Mapping Preview */}
        {analysis && (
          <div className="cyber-panel">
            <div className="cyber-panel-header">
              <div className="flex items-center gap-2.5">
                <ArrowRightIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                  3. תצוגת מיפוי
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={reportMut.isPending}
                onClick={() => reportMut.mutate()}
                style={{ fontSize: 10 }}
              >
                <ArrowRightIcon size={11} />
                צור דוח
              </button>
            </div>
            <div style={{ padding: '8px 12px' }}>
              {analysis.warnings.length > 0 && (
                <div className="flex flex-col gap-1 mb-3 px-2 py-2 rounded-md" style={{ background: 'rgba(197,160,89,0.05)', border: '1px solid rgba(197,160,89,0.15)' }}>
                  {analysis.warnings.map((w, i) => (
                    <span key={i} style={{ fontSize: 10, color: 'var(--warn)' }}>{w}</span>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {analysis.mappings.map((m) => (
                  <div key={m.sourceTable} className="flex items-center gap-3 px-2 py-2 rounded-md" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-2)', minWidth: 140 }}>{m.sourceTable}</span>
                    <ArrowRightIcon size={10} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--brand-gold)', minWidth: 160 }}>{m.targetTable}</span>
                    <div
                      style={{
                        fontSize: 10, fontFamily: 'var(--f-mono)', padding: '1px 6px', borderRadius: 4,
                        background: `${confidenceColor(m.confidence)}22`,
                        color: confidenceColor(m.confidence),
                      }}
                    >
                      {Math.round(m.confidence * 100)}%
                    </div>
                    {m.conflicts.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--warn)' }}>{m.conflicts[0]}</span>
                    )}
                  </div>
                ))}
                {analysis.unmappedTables.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-4)', padding: '0 8px' }}>
                    ללא מיפוי: {analysis.unmappedTables.join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section 4 — Plan Preview */}
        {report && (
          <div className="cyber-panel">
            <div className="cyber-panel-header">
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                  תוכנית מיגרציה (תצוגה מקדימה)
                </span>
              </div>
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={planMut.isPending}
                onClick={() => planMut.mutate()}
                style={{ fontSize: 10 }}
              >
                <ArrowRightIcon size={11} />
                {planMut.isPending ? 'מחשב...' : 'צור תוכנית'}
              </button>
            </div>
            {plan && (
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-4)', padding: '0 8px', marginBottom: 8 }}>
                  {plan.steps.length} שלבים · זמן משוער: ~{Math.ceil(plan.totalEstSec / 60)} דק'
                </div>
                <div className="flex flex-col gap-1">
                  {plan.steps.slice(0, 10).map((step) => (
                    <div key={step.order} className="flex items-center gap-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)', minWidth: 24 }}>#{step.order}</span>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--fg-2)', minWidth: 140 }}>{step.sourceTable}</span>
                      <ArrowRightIcon size={10} style={{ color: 'var(--fg-4)' }} />
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--brand-gold)' }}>{step.targetTable}</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-4)', marginRight: 'auto' }}>~{step.estimatedSec}ש'</span>
                    </div>
                  ))}
                  {plan.steps.length > 10 && (
                    <span style={{ fontSize: 10, color: 'var(--fg-4)', padding: '4px 8px' }}>...ועוד {plan.steps.length - 10} שלבים</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 5 — Document Inventory */}
        <div className="cyber-panel">
          <div className="cyber-panel-header">
            <div className="flex items-center gap-2.5">
              <FolderIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                5. מלאי מסמכים
              </span>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div className="flex gap-2 items-center mb-3">
              <input
                type="text"
                value={docPath}
                onChange={(e) => setDocPath(e.target.value)}
                placeholder="נתיב לתיקיית מסמכים (PDF, DOCX, XLSX, MSG...)"
                style={{
                  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)',
                  borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--fg-1)',
                  fontFamily: 'var(--f-mono)',
                }}
              />
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={!docPath.trim() || docInventoryMut.isPending}
                onClick={() => docInventoryMut.mutate()}
                style={{ fontSize: 11 }}
              >
                <MagnifyingGlassIcon size={11} />
                {docInventoryMut.isPending ? 'סורק...' : 'סרוק'}
              </button>
              <button
                className="btn btn-ghost btn-sm flex items-center gap-1"
                disabled={!docPath.trim() || fileStructMut.isPending}
                onClick={() => fileStructMut.mutate()}
                style={{ fontSize: 11 }}
              >
                <FolderIcon size={11} />
                {fileStructMut.isPending ? 'בודק...' : 'מבנה'}
              </button>
            </div>

            {docReport && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-4" style={{ fontSize: 12, padding: '8px 4px' }}>
                  <span style={{ color: 'var(--fg-4)' }}>סה"כ: <strong style={{ color: 'var(--fg-1)' }}>{docReport.totalFiles.toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--fg-4)' }}>נתמך: <strong style={{ color: 'var(--ok)' }}>{docReport.supportedFiles.toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--fg-4)' }}>לא נתמך: <strong style={{ color: 'var(--warn)' }}>{docReport.unsupportedFiles.toLocaleString()}</strong></span>
                  <span style={{ color: 'var(--fg-4)' }}>כפילויות: <strong style={{ color: docReport.duplicates > 0 ? 'var(--bad)' : 'var(--ok)' }}>{docReport.duplicates}</strong></span>
                  <span style={{ color: 'var(--fg-4)' }}>זמן עיבוד: <strong style={{ color: 'var(--fg-1)' }}>~{docReport.estimatedHours} שעות</strong></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(docReport.byExtension).map(([ext, count]) => (
                    <span
                      key={ext}
                      style={{
                        fontFamily: 'var(--f-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--hairline)',
                        color: 'var(--fg-3)',
                      }}
                    >
                      {ext || '(ללא)'} × {count}
                    </span>
                  ))}
                </div>
                {docReport.warnings.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--warn)', padding: '4px 4px' }}>
                    {docReport.warnings.slice(0, 5).join(' · ')}
                    {docReport.warnings.length > 5 && ` ...ועוד ${docReport.warnings.length - 5}`}
                  </div>
                )}
              </div>
            )}

            {/* File Structure */}
            {fsReport && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--hairline)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-2)', marginBottom: 6, fontWeight: 500 }}>מבנה תיקיות</div>
                <div className="flex gap-4" style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 6 }}>
                  <span>תיקיות: <strong style={{ color: 'var(--fg-1)' }}>{fsReport.totalFolders}</strong></span>
                  <span>עומק מקסימלי: <strong style={{ color: 'var(--fg-1)' }}>{fsReport.maxDepth}</strong></span>
                </div>
                {fsReport.namingIssues.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--warn)' }}>
                    בעיות שמות: {fsReport.namingIssues.slice(0, 3).join(' · ')}
                  </div>
                )}
                {fsReport.migrationNotes.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 4 }}>
                    {fsReport.migrationNotes.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 6 — Export Report */}
        {report && (
          <div className="cyber-panel">
            <div className="cyber-panel-header">
              <div className="flex items-center gap-2.5">
                <DownloadSimpleIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                  6. ייצוא דוח מיפוי
                </span>
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <p style={{ color: 'var(--fg-4)', fontSize: 12, marginBottom: 12 }}>
                הורד את דוח המיפוי המלא כקובץ JSON לשמירה ובדיקה.
              </p>
              <button
                className="btn btn-ghost btn-sm flex items-center gap-2"
                onClick={downloadReport}
              >
                <DownloadSimpleIcon size={12} />
                הורד MigrationMappingReport.json
              </button>
              <p style={{ color: 'var(--fg-4)', fontSize: 11, marginTop: 8 }}>
                {report.mappings.length} מיפויים · {report.unmappedTables.length} ללא מיפוי · {report.warnings.length} אזהרות
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
