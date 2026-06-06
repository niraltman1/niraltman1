import { daysUntil } from '@/lib/legal-terms.js';

/** Confidence percentage badge: green ≥75%, amber ≥50%, red below. */
export function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const cls = pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-error';
  return <span className={`badge ${cls}`}>{pct}%</span>;
}

/** Deadline chip: red when overdue/today, amber ≤7 days, normal otherwise. */
export function DeadlineChip({ date, label }: { date: string | null | undefined; label?: string }) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days == null) return <span className="text-parchment/40 font-mono text-xs">{label ?? date}</span>;

  const color =
    days <= 0  ? 'text-red-400 bg-red-900/30' :
    days <= 7  ? 'text-amber-400 bg-amber-900/30' :
    days <= 30 ? 'text-yellow-400 bg-yellow-900/20' :
                 'text-parchment/60 bg-navy-100';

  const display = label ?? date;
  const suffix  = days <= 0 ? ` (${Math.abs(days)} ימים באיחור)` : days <= 30 ? ` (${days} ימים)` : '';

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono ${color}`}>
      {display}{suffix}
    </span>
  );
}

/** Hyperlinked source citation: renders as a small gold chip. */
export function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-gold/80 hover:text-gold underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

/** Full-panel empty state with Hebrew message and optional action. */
export function EmptyState({
  message,
  sub,
  action,
}: {
  message: string;
  sub?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" dir="rtl">
      <p className="text-parchment/60 text-sm">{message}</p>
      {sub && <p className="text-parchment/35 text-xs">{sub}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn-primary text-xs px-3 py-1.5"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
