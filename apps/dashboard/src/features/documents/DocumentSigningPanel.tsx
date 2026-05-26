import { useState } from 'react';
import { SealCheckIcon, XCircleIcon, PencilSimpleIcon, WarningIcon } from '@phosphor-icons/react';
import { useDocumentSignatures, useRequestSignature, useSignDocument, useRejectSignature } from '../../api/hooks.js';

interface Props {
  documentId: number;
}

// Maps status to Hebrew label + badge class
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'ממתין לחתימה', cls: 'badge-warning' },
  signed:  { label: 'נחתם ✓',       cls: 'badge-success' },
  rejected:{ label: 'נדחה',          cls: 'badge-error'   },
};

export function DocumentSigningPanel({ documentId }: Props) {
  const { data: sigs = [], isLoading } = useDocumentSignatures(documentId);
  const requestSig  = useRequestSignature();
  const signDoc     = useSignDocument();
  const rejectSig   = useRejectSignature();
  const [rejectId, setRejectId]     = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  return (
    <div className="cyber-panel mt-6" dir="rtl">
      <div className="cyber-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SealCheckIcon size={18} weight="duotone" className="text-gold" />
          <span className="font-bold text-parchment">חתימות</span>
        </div>
        <button
          className="btn-primary btn-sm"
          onClick={() => requestSig.mutate(documentId)}
          disabled={requestSig.isPending}
        >
          <PencilSimpleIcon size={14} />
          בקש חתימה
        </button>
      </div>

      {isLoading && <p className="text-parchment/40 text-sm p-4">טוען...</p>}

      {sigs.length === 0 && !isLoading && (
        <p className="text-parchment/40 text-sm p-4">אין חתימות עדיין</p>
      )}

      <div className="divide-y divide-parchment/10">
        {(sigs as Array<{
          id: number; signer_name: string; status: string;
          signed_at: string | null; signature_hash: string; notes: string | null;
        }>).map((sig) => (
          <div key={sig.id} className="flex items-center justify-between px-4 py-3 gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-parchment text-sm font-medium">{sig.signer_name}</span>
              {sig.signed_at && (
                <span className="text-parchment/40 text-xs">
                  {new Date(sig.signed_at).toLocaleDateString('he-IL')}
                </span>
              )}
              {sig.status === 'signed' && (
                <span
                  className="text-parchment/30 text-[10px] font-mono truncate"
                  title={sig.signature_hash}
                >
                  {sig.signature_hash.slice(0, 16)}…
                </span>
              )}
              {sig.notes && (
                <span className="text-parchment/50 text-xs">{sig.notes}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`badge ${STATUS_LABEL[sig.status]?.cls ?? 'badge-neutral'}`}>
                {STATUS_LABEL[sig.status]?.label ?? sig.status}
              </span>
              {sig.status === 'pending' && (
                <>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => void signDoc.mutate({ signatureId: sig.id })}
                    disabled={signDoc.isPending}
                  >
                    <SealCheckIcon size={14} />
                    חתום
                  </button>
                  <button
                    className="btn-ghost btn-sm text-claret"
                    onClick={() => setRejectId(sig.id)}
                  >
                    <XCircleIcon size={14} />
                    דחה
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectId !== null && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center" dir="rtl">
          <div className="cyber-panel w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-claret">
              <WarningIcon size={20} weight="duotone" />
              <h3 className="font-bold text-parchment">סיבת דחייה</h3>
            </div>
            <textarea
              className="form-input w-full h-24 resize-none"
              placeholder="הזן סיבת דחייה..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={() => { setRejectId(null); setRejectNote(''); }}>ביטול</button>
              <button
                className="btn-danger"
                disabled={!rejectNote.trim() || rejectSig.isPending}
                onClick={() => {
                  if (!rejectNote.trim()) return;
                  void rejectSig.mutate(
                    { signatureId: rejectId, notes: rejectNote },
                    { onSuccess: () => { setRejectId(null); setRejectNote(''); } },
                  );
                }}
              >
                דחה חתימה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
