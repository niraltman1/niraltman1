import { useQuery } from '@tanstack/react-query';

interface HistoryRow { id: number; channel: string; version: string | null; status: string; applied_at: string; }
interface RecoveryPointRow { id: string; version: string; createdAt: string; sizeBytes: number; }
interface HistoryData {
  history:        HistoryRow[];
  currentVersion: string;
  systemState:    string;
  recoveryPoints: RecoveryPointRow[];
}
interface HealthData {
  healthy:    boolean;
  wasApplied: boolean;
  failures:   string[];
  systemState: string;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const json = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

function useUpdateHistory() {
  return useQuery<HistoryData>({
    queryKey: ['updates', 'history'],
    queryFn: () => fetchJSON<HistoryData>('/api/updates/history'),
    retry: false,
  });
}

function useUpdateHealth() {
  return useQuery<HealthData>({
    queryKey: ['updates', 'health'],
    queryFn: () => fetchJSON<HealthData>('/api/updates/health'),
    retry: false,
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StateChip({ state }: { state: string }) {
  const colors: Record<string, string> = {
    NORMAL:       'bg-green-900/30 text-green-400',
    UPDATING:     'bg-blue-900/30 text-blue-400',
    ROLLING_BACK: 'bg-amber-900/30 text-amber-400',
    SAFE_MODE:    'bg-red-900/30 text-red-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${colors[state] ?? 'bg-navy-100 text-parchment/60'}`}>
      {state}
    </span>
  );
}

export function UpdatesCenterPage() {
  const history = useUpdateHistory();
  const health  = useUpdateHealth();

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-xl font-semibold text-parchment">מרכז עדכונים</h1>

      {/* System State */}
      <section className="bg-navy-100 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-medium text-parchment/70">מצב המערכת</h2>
        <div className="flex items-center gap-3">
          {history.data && <StateChip state={history.data.systemState} />}
          <span className="text-parchment/60 text-sm font-mono">
            גרסה נוכחית: {history.data?.currentVersion ?? '—'}
          </span>
        </div>
      </section>

      {/* Patch Health */}
      <section className="bg-navy-100 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-medium text-parchment/70">בריאות המערכת לאחר עדכון</h2>
        {health.isPending && (
          <p className="text-parchment/40 text-sm">בודק...</p>
        )}
        {health.data && (
          <div className="space-y-1">
            <p className={`text-sm font-medium ${health.data.healthy ? 'text-green-400' : 'text-red-400'}`}>
              {health.data.healthy ? '✓ כל הבדיקות עברו' : '✗ נמצאו שגיאות'}
            </p>
            {health.data.failures.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5">
                {health.data.failures.map((f, i) => (
                  <li key={i} className="text-red-400 text-xs font-mono">{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Recovery Points */}
      <section className="bg-navy-100 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-medium text-parchment/70">נקודות שחזור</h2>
        {(history.data?.recoveryPoints.length ?? 0) === 0 ? (
          <p className="text-parchment/40 text-sm">אין נקודות שחזור.</p>
        ) : (
          <div className="space-y-2">
            {history.data?.recoveryPoints.map((rp) => (
              <div key={rp.id} className="flex items-center justify-between text-xs font-mono">
                <span className="text-parchment/60">{rp.createdAt.slice(0, 10)}</span>
                <span className="text-parchment/40">גרסה {rp.version}</span>
                <span className="text-parchment/40">{formatBytes(rp.sizeBytes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Patch History */}
      <section className="bg-navy-100 rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-medium text-parchment/70">היסטוריית עדכונים</h2>
        {history.isPending && <p className="text-parchment/40 text-sm">טוען...</p>}
        {history.isError && <p className="text-red-400 text-sm">שגיאה בטעינת היסטוריה.</p>}
        {(history.data?.history.length ?? 0) === 0 && !history.isPending && (
          <p className="text-parchment/40 text-sm">אין היסטוריית עדכונים.</p>
        )}
        {(history.data?.history.length ?? 0) > 0 && (
          <table className="w-full text-xs font-mono" dir="rtl">
            <thead>
              <tr className="text-parchment/40">
                <th className="text-right pb-1">ערוץ</th>
                <th className="text-right pb-1">גרסה</th>
                <th className="text-right pb-1">סטטוס</th>
                <th className="text-right pb-1">תאריך</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.history.map((row) => (
                <tr key={row.id} className="border-t border-parchment/5">
                  <td className="py-1 text-parchment/60">{row.channel}</td>
                  <td className="py-1 text-parchment/60">{row.version ?? '—'}</td>
                  <td className={`py-1 ${row.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {row.status}
                  </td>
                  <td className="py-1 text-parchment/40">{row.applied_at?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
