import { useState } from 'react';
import { LockIcon, MicrophoneIcon, ImageSquareIcon, PaperclipIcon, FileTextIcon, PlusIcon } from '@phosphor-icons/react';
import { useEvidenceList, useLockEvidence } from '@/api/hooks.js';
import type { EvidenceItemRecord } from '@/api/hooks.js';

const MEDIA_TYPE_LABELS: Record<string, string> = {
  voice_note: 'הקלטה קולית',
  image:      'תמונה',
  message:    'הודעה',
  attachment: 'קובץ מצורף',
  file:       'קובץ',
};

const SOURCE_APP_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'אימייל',
  manual:   'ידני',
};

function MediaTypeIcon({ type }: { type: string }) {
  if (type === 'voice_note') return <MicrophoneIcon size={14} className="text-blue-400" />;
  if (type === 'image')      return <ImageSquareIcon size={14} className="text-green-400" />;
  if (type === 'attachment') return <PaperclipIcon   size={14} className="text-amber-400" />;
  return <FileTextIcon size={14} className="text-parchment/40" />;
}

function LockEvidenceForm({ onDone }: { onDone: () => void }) {
  const [path,   setPath]   = useState('');
  const [source, setSource] = useState<'whatsapp' | 'email' | 'manual'>('whatsapp');
  const { mutate, isPending } = useLockEvidence();

  const submit = () => {
    if (!path.trim()) return;
    mutate({ sourcePath: path.trim(), sourceApp: source }, { onSuccess: onDone });
  };

  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-xl p-5 space-y-3" dir="rtl">
      <h3 className="text-parchment/70 text-sm font-semibold">נעל קובץ ראיה</h3>
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="נתיב מלא לקובץ..."
        className="w-full bg-navy-200 border border-parchment/10 rounded-lg px-3 py-2 text-parchment text-sm placeholder:text-parchment/30 outline-none focus:border-gold/40"
        dir="ltr"
      />
      <div className="flex items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="bg-navy-200 border border-parchment/10 rounded-lg px-3 py-2 text-parchment text-sm outline-none"
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">אימייל</option>
          <option value="manual">ידני</option>
        </select>
        <button
          onClick={submit}
          disabled={isPending || !path.trim()}
          className="px-4 py-2 bg-gold/15 text-gold border border-gold/30 rounded-lg text-sm hover:bg-gold/25 transition-colors disabled:opacity-40"
        >
          {isPending ? 'נועל...' : 'נעל קובץ'}
        </button>
        <button onClick={onDone} className="px-3 py-2 text-parchment/40 text-sm hover:text-parchment transition-colors">
          ביטול
        </button>
      </div>
    </div>
  );
}

export function EvidenceLockerPage() {
  const [showForm, setShowForm] = useState(false);
  const { data = [], isLoading } = useEvidenceList();

  return (
    <div className="max-w-4xl mx-auto space-y-5 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LockIcon size={20} className="text-gold" weight="duotone" />
          <h1 className="text-parchment font-semibold text-lg">ארגז ראיות</h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gold/10 text-gold border border-gold/20 rounded-lg text-sm hover:bg-gold/20 transition-colors"
        >
          <PlusIcon size={14} />
          הוסף ראיה
        </button>
      </div>

      {showForm && <LockEvidenceForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <p className="text-parchment/30 text-sm text-center py-12">טוען ראיות...</p>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <LockIcon size={40} className="text-parchment/15" />
          <p className="text-parchment/30 text-sm">אין ראיות נעולות עדיין</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((item: EvidenceItemRecord) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 bg-navy-100 border border-parchment/10 rounded-lg"
            >
              <MediaTypeIcon type={item.mediaType} />
              <span className="flex-1 text-parchment text-sm truncate">{item.originalFilename}</span>
              <span className="badge badge-neutral text-[10px]">{MEDIA_TYPE_LABELS[item.mediaType] ?? item.mediaType}</span>
              <span className="badge text-[10px]">{SOURCE_APP_LABELS[item.sourceApp] ?? item.sourceApp}</span>
              {item.isWriteProtected && (
                <LockIcon size={12} className="text-gold/60" />
              )}
              <span className="text-parchment/30 text-[10px]">
                {new Date(item.lockedAt).toLocaleDateString('he-IL')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
