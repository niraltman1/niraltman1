import { EmptyState } from './SharedComponents.js';

interface EmptyPanelProps {
  message: string;
  sub?:    string;
  action?: { label: string; onClick: () => void };
}

export function EmptyPanel({ message, sub, action }: EmptyPanelProps) {
  return (
    <EmptyState
      message={message}
      {...(sub    !== undefined ? { sub }    : {})}
      {...(action !== undefined ? { action } : {})}
    />
  );
}
