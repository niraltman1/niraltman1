import { CheckCircleIcon, WarningCircleIcon, FileTextIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { useClientTimeline } from '@/api/hooks.js';

interface Props {
  clientId: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

const STATE_LABELS: Record<string, string> = {
  DISCOVERED:    'זוהה',
  HASHED:        'גובּב',
  OCR_PENDING:   'ממתין ל-OCR',
  OCR_COMPLETE:  'OCR הושלם',
  CLASSIFIED:    'סווג',
  ENRICHED:      'הועשר',
  REVIEW_PENDING:'ממתין לאישור',
  APPLIED:       'הוחל',
  VERIFIED:      'אומת',
  FAILED:        'נכשל',
  ROLLED_BACK:   'בוטל',
};

export function ClientTimeline({ clientId }: Props) {
  const { data: events, isLoading, isError } = useClientTimeline(clientId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-parchment/40 text-sm">
        טוען ציר זמן…
      </div>
    );
  }

  if (isError || !events) {
    return (
      <div className="flex items-center justify-center py-12 text-red-400 text-sm">
        שגיאה בטעינת ציר הזמן
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-parchment/30 gap-3">
        <FileTextIcon size={36} weight="thin" />
        <span className="text-sm">אין פעילות להצגה</span>
      </div>
    );
  }

  return (
    <ol className="relative border-r-2 border-parchment/10 mr-4 space-y-0">
      {events.map((ev, i) => {
        const event = ev as Record<string, unknown>;
        const success   = event['success'] as boolean;
        const state     = event['state'] as string;
        const prevState = event['prevState'] as string;
        const docName   = event['documentName'] as string;
        const docId     = event['documentId'] as number;
        const occurredAt = event['occurredAt'] as string;

        return (
          <li key={i} className="mr-6 pb-6 last:pb-0">
            {/* Icon on timeline */}
            <span className={`
              absolute -right-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2
              ${success
                ? 'bg-green-500/10 border-green-500/40'
                : 'bg-red-500/10 border-red-500/40'}
            `}>
              {success
                ? <CheckCircleIcon size={16} className="text-green-400" weight="duotone" />
                : <WarningCircleIcon size={16} className="text-red-400" weight="duotone" />}
            </span>

            {/* Content */}
            <div className="bg-navy-100/50 border border-parchment/10 rounded-lg p-3 mr-2">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-parchment/40 text-xs">{formatDate(occurredAt)}</span>
                <div className="flex items-center gap-1 text-xs">
                  <span className="badge badge-neutral">{STATE_LABELS[prevState] ?? prevState}</span>
                  <ArrowRightIcon size={10} className="text-parchment/30" />
                  <span className={`badge ${success ? 'badge-success' : 'badge-error'}`}>
                    {STATE_LABELS[state] ?? state}
                  </span>
                </div>
              </div>
              <p className="text-parchment text-sm truncate" title={docName}>
                <FileTextIcon size={12} className="inline ml-1 text-gold/60" />
                <a href={`/documents/${docId}`} className="hover:text-gold transition-colors">
                  {docName}
                </a>
              </p>
              {!!event['errorMessage'] && (
                <p className="text-red-400 text-xs mt-1 truncate" title={event['errorMessage'] as string}>
                  {event['errorMessage'] as string}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
