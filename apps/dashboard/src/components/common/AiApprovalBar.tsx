import { ThumbsUpIcon, ThumbsDownIcon, PencilSimpleIcon } from '@phosphor-icons/react';

interface AiApprovalBarProps {
  onApprove: () => void;
  onReject: () => void;
  onEdit?: () => void;
  state?: string | undefined;
  isPending?: boolean | undefined;
}

/**
 * Unified אשר/דחה/עריכה bar for AI-generated content.
 * Shows approved/rejected badge once a decision is made.
 */
export function AiApprovalBar({ onApprove, onReject, onEdit, state, isPending }: AiApprovalBarProps) {
  if (state === 'approved') {
    return <span className="text-[10px] text-green-400/70">✓ אומת</span>;
  }
  if (state === 'rejected') {
    return <span className="text-[10px] text-red-400/70">✗ נדחה</span>;
  }
  return (
    <div className="flex gap-2">
      <button
        disabled={isPending}
        onClick={onApprove}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-green-400 border border-green-400/20 rounded-lg hover:bg-green-400/10 transition-colors disabled:opacity-40"
      >
        <ThumbsUpIcon size={12} /> אשר
      </button>
      <button
        disabled={isPending}
        onClick={onReject}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-400 border border-red-400/20 rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-40"
      >
        <ThumbsDownIcon size={12} /> דחה
      </button>
      {onEdit && (
        <button
          disabled={isPending}
          onClick={onEdit}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-parchment/60 border border-parchment/15 rounded-lg hover:bg-parchment/5 transition-colors disabled:opacity-40"
        >
          <PencilSimpleIcon size={12} /> עריכה
        </button>
      )}
    </div>
  );
}
