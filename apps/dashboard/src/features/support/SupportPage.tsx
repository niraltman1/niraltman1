// SupportPage — /support
// Phase 3A: System health, support bundle, repair recommendations, self-healing.

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  HardDriveIcon, WarningCircleIcon, CheckCircleIcon, WarningIcon,
  ArrowClockwiseIcon, DownloadSimpleIcon, WrenchIcon,
} from '@phosphor-icons/react';
import { LoadingPanel } from '@/components/common/LoadingPanel.js';
import { EmptyPanel } from '@/components/common/EmptyPanel.js';

interface DiagnosticCheck {
  name:    string;
  status:  'ok' | 'warn' | 'critical' | 'unknown';
  message: string;
}

interface SystemStatus {
  overall: 'ok' | 'warn' | 'critical' | 'unknown';
  checks:  DiagnosticCheck[];
  ts:      number;
}

interface RepairRecommendation {
  action:        string;
  severity:      'info' | 'warn' | 'critical';
  titleHe:       string;
  descriptionHe: string;
  estimatedSec:  number;
  safeToAutoRun: boolean;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'API error');
  return body.data;
}

async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body ?? {}),
  });
  const json = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!json.success) throw new Error(json.error?.message ?? 'API error');
  return json.data;
}

function statusColor(s: DiagnosticCheck['status']): string {
  return s === 'ok' ? 'var(--ok)' : s === 'warn' ? 'var(--warn)' : s === 'critical' ? 'var(--bad)' : 'var(--fg-4)';
}

function StatusIcon({ status }: { status: DiagnosticCheck['status'] }) {
  const color = statusColor(status);
  if (status === 'ok') return <CheckCircleIcon size={14} weight="fill" style={{ color }} />;
  if (status === 'critical') return <WarningCircleIcon size={14} weight="fill" style={{ color }} />;
  return <WarningIcon size={14} weight="fill" style={{ color }} />;
}

export function SupportPage() {
  const [healResult, setHealResult] = useState<{ action: string; success: boolean; message?: string } | null>(null);

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey:  ['diagnostics', 'status'],
    queryFn:   () => fetchJSON<SystemStatus>('/api/diagnostics/status'),
    staleTime: 30_000,
    retry:     false,
  });

  const { data: recsData, isLoading: recsLoading, refetch: refetchRecs } = useQuery({
    queryKey:  ['diagnostics', 'recommendations'],
    queryFn:   () => fetchJSON<{ recommendations: RepairRecommendation[] }>('/api/diagnostics/recommendations'),
    staleTime: 60_000,
    retry:     false,
  });

  const bundleMutation = useMutation({
    mutationFn: () => postJSON<{ path: string }>('/api/diagnostics/bundle'),
  });

  const healMutation = useMutation({
    mutationFn: (action: string) => postJSON<{ success: boolean; durationMs: number }>(`/api/diagnostics/heal/${action}`),
    onSuccess: (data, action) => {
      setHealResult({ action, success: data.success });
      void refetchStatus();
      void refetchRecs();
    },
    onError: (err, action) => {
      setHealResult({ action, success: false, message: String(err) });
    },
  });

  const status = statusData as SystemStatus | undefined;
  const recs   = recsData?.recommendations ?? [];

  return (
    <div dir="rtl" style={{ padding: '24px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3 mb-2">
          <HardDriveIcon size={20} weight="duotone" style={{ color: 'var(--brand-gold)' }} />
          <h1 style={{ fontFamily: 'var(--f-mono)', fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-1)', margin: 0 }}>
            תמיכה ואבחון
          </h1>
        </div>
        <p style={{ color: 'var(--fg-4)', fontSize: 13 }}>
          אבחון מערכת, חבילות תמיכה, המלצות תיקון ופעולות ריפוי עצמי.
        </p>
      </div>

      <div className="flex flex-col gap-4">

        {/* Section 1 — System Health */}
        <div className="cyber-panel">
          <div className="cyber-panel-header">
            <div className="flex items-center gap-2.5">
              <HardDriveIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                מצב מערכת
              </span>
            </div>
            <button
              onClick={() => void refetchStatus()}
              className="btn btn-ghost btn-sm flex items-center gap-1"
              style={{ fontSize: 10 }}
            >
              <ArrowClockwiseIcon size={11} />
              רענן
            </button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            {statusLoading ? (
              <LoadingPanel rows={2} />
            ) : status ? (
              <>
                <div className="flex items-center gap-2 mb-3 px-2">
                  <StatusIcon status={status.overall} />
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: statusColor(status.overall),
                  }}>
                    {status.overall === 'ok' ? 'מערכת תקינה' : status.overall === 'warn' ? 'אזהרות' : 'בעיות קריטיות'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {(status.checks ?? []).map((c) => (
                    <div key={c.name} className="flex items-center gap-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <StatusIcon status={c.status} />
                      <span style={{ fontSize: 12, color: 'var(--fg-2)', minWidth: 120 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-4)' }}>{c.message}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--fg-4)', fontSize: 13, padding: '12px 8px' }}>לא ניתן לטעון מצב מערכת</p>
            )}
          </div>
        </div>

        {/* Section 2 — Support Bundle */}
        <div className="cyber-panel">
          <div className="cyber-panel-header">
            <div className="flex items-center gap-2.5">
              <DownloadSimpleIcon size={13} weight="duotone" style={{ color: 'var(--fg-3)' }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                חבילת תמיכה
              </span>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <p style={{ color: 'var(--fg-4)', fontSize: 12, marginBottom: 12 }}>
              צור חבילת אבחון מלאה (ללא נתוני לקוח) לשליחה לתמיכה טכנית.
            </p>
            <button
              className="btn btn-ghost btn-sm flex items-center gap-2"
              disabled={bundleMutation.isPending}
              onClick={() => bundleMutation.mutate()}
            >
              <DownloadSimpleIcon size={12} />
              {bundleMutation.isPending ? 'מייצר...' : 'צור חבילת תמיכה'}
            </button>
            {bundleMutation.isSuccess && (
              <p style={{ color: 'var(--ok)', fontSize: 12, marginTop: 8 }}>
                ✓ נוצר בהצלחה
              </p>
            )}
            {bundleMutation.isError && (
              <p style={{ color: 'var(--bad)', fontSize: 12, marginTop: 8 }}>
                שגיאה: {String(bundleMutation.error)}
              </p>
            )}
          </div>
        </div>

        {/* Section 3 — Repair Recommendations */}
        <div className="cyber-panel">
          <div className="cyber-panel-header">
            <div className="flex items-center gap-2.5">
              <WrenchIcon size={13} weight="duotone" style={{ color: 'var(--warn)' }} />
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
                המלצות תיקון
              </span>
            </div>
            <button
              onClick={() => void refetchRecs()}
              className="btn btn-ghost btn-sm flex items-center gap-1"
              style={{ fontSize: 10 }}
            >
              <ArrowClockwiseIcon size={11} />
              רענן
            </button>
          </div>
          <div style={{ padding: '8px 12px' }}>
            {recsLoading ? (
              <LoadingPanel rows={3} />
            ) : recs.length === 0 ? (
              <EmptyPanel
                message="אין המלצות תיקון."
                sub="המערכת תקינה — לא זוהו בעיות הדורשות טיפול."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {recs.map((rec) => (
                  <div
                    key={rec.action}
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: rec.severity === 'critical' ? 'rgba(197,122,106,0.06)' : rec.severity === 'warn' ? 'rgba(197,160,89,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${rec.severity === 'critical' ? 'rgba(197,122,106,0.2)' : rec.severity === 'warn' ? 'rgba(197,160,89,0.2)' : 'var(--hairline)'}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)', marginBottom: 2 }}>{rec.titleHe}</div>
                      <div style={{ fontSize: 11, color: 'var(--fg-4)', marginBottom: 6 }}>{rec.descriptionHe}</div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
                        ~{rec.estimatedSec}ש · {rec.safeToAutoRun ? 'בטוח להפעלה אוטומטית' : 'דרוש אישור ידני'}
                      </div>
                    </div>
                    {rec.safeToAutoRun && (
                      <button
                        className="btn btn-ghost btn-sm flex items-center gap-1 flex-shrink-0"
                        style={{ fontSize: 10 }}
                        disabled={healMutation.isPending}
                        onClick={() => healMutation.mutate(rec.action)}
                      >
                        <WrenchIcon size={11} />
                        תקן
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {healResult && (
              <div style={{
                marginTop: 12, padding: '8px 12px', borderRadius: 6,
                background: healResult.success ? 'rgba(100,200,100,0.06)' : 'rgba(197,122,106,0.06)',
                border: `1px solid ${healResult.success ? 'rgba(100,200,100,0.2)' : 'rgba(197,122,106,0.2)'}`,
              }}>
                <span style={{ fontSize: 12, color: healResult.success ? 'var(--ok)' : 'var(--bad)' }}>
                  {healResult.success ? `✓ הפעולה "${healResult.action}" הושלמה בהצלחה` : `✗ שגיאה: ${healResult.message ?? 'שגיאה לא ידועה'}`}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
