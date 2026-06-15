type Severity = 'critical' | 'warning' | 'info' | 'success';

const TOKEN_MAP: Record<Severity, string> = {
  critical: 'var(--color-danger)',
  warning:  'var(--color-warning)',
  info:     'var(--color-info)',
  success:  'var(--color-success)',
};

const LABEL_MAP: Record<Severity, string> = {
  critical: 'קריטי',
  warning:  'אזהרה',
  info:     'מידע',
  success:  'תקין',
};

interface SeverityBadgeProps {
  severity: Severity;
  label?:   string;
}

export function SeverityBadge({ severity, label }: SeverityBadgeProps) {
  const color = TOKEN_MAP[severity];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {label ?? LABEL_MAP[severity]}
    </span>
  );
}
