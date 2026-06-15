interface ErrorPanelProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-center rounded-lg border p-6"
      style={{ borderColor: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}
      dir="rtl"
      role="alert"
    >
      <p className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
        {message ?? 'אירעה שגיאה. אנא נסה שנית.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-1.5 rounded text-xs font-medium border transition-opacity hover:opacity-80"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
        >
          נסה שוב
        </button>
      )}
    </div>
  );
}
