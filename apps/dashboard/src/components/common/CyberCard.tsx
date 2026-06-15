import type { ReactNode } from 'react';

interface CyberCardProps {
  title:     string;
  children:  ReactNode;
  actions?:  ReactNode;
  badge?:    ReactNode;
  footer?:   ReactNode;
}

export function CyberCard({ title, children, actions, badge, footer }: CyberCardProps) {
  return (
    <div
      className="rounded-lg border flex flex-col overflow-hidden"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-parchment/90">{title}</h2>
          {badge && <span>{badge}</span>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="flex-1 p-4">{children}</div>
      {footer && (
        <div className="px-4 py-2 border-t text-xs text-parchment/50" style={{ borderColor: 'var(--color-border)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}
