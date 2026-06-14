import { useAdminMetrics } from '@/api/hooks.js';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function MetricsPanel() {
  const { data, isLoading, isError } = useAdminMetrics({ limit: 20 });

  const metrics = data?.metrics ?? [];

  return (
    <div className="space-y-3" dir="rtl">
      <h3 className="text-sm font-semibold text-parchment/70">מדדי ביצועים אחרונים</h3>

      {isLoading && (
        <div className="py-6 text-center text-parchment/30 text-xs">טוען מדדים...</div>
      )}

      {isError && (
        <div className="py-4 text-center text-red-400/60 text-xs">
          שגיאה בטעינת מדדי ביצועים
        </div>
      )}

      {!isLoading && !isError && metrics.length === 0 && (
        <div className="py-6 text-center text-parchment/20 text-xs">אין מדדים זמינים</div>
      )}

      {metrics.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-parchment/10 text-parchment/40">
                <th className="pb-2 text-right font-normal">מדד</th>
                <th className="pb-2 text-right font-normal">ערך</th>
                <th className="pb-2 text-right font-normal">יחידה</th>
                <th className="pb-2 text-right font-normal">סוכן</th>
                <th className="pb-2 text-right font-normal">שעה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment/5">
              {metrics.map((m) => (
                <tr key={m.id} className="hover:bg-parchment/5 transition-colors">
                  <td className="py-2 text-parchment/80 font-mono">{m.name}</td>
                  <td className="py-2 text-parchment font-mono font-medium pr-3">
                    {typeof m.value === 'number' ? m.value.toLocaleString('he-IL') : m.value}
                  </td>
                  <td className="py-2 text-parchment/50 pr-3">{m.unit ?? '—'}</td>
                  <td className="py-2 text-parchment/50 pr-3">{m.agent ?? '—'}</td>
                  <td className="py-2 text-parchment/40 tabular-nums pr-3">{fmtTime(m.recordedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
