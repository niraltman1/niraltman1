interface LoadingPanelProps {
  label?: string;
  rows?:  number;
}

export function LoadingPanel({ label, rows = 4 }: LoadingPanelProps) {
  return (
    <div className="w-full p-4" dir="rtl" role="status" aria-live="polite" aria-label={label ?? 'טוען…'}>
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded animate-pulse"
            style={{
              background: 'var(--color-border)',
              width:      `${85 - i * 10}%`,
            }}
          />
        ))}
      </div>
      {label && <p className="mt-3 text-xs text-parchment/50">{label}</p>}
    </div>
  );
}
