import { useState, type ReactNode } from 'react';
import { BookOpenIcon, GavelIcon } from '@phosphor-icons/react';
import { LegalCorpusPage } from './LegalCorpusPage.js';
import { JudgmentLibraryPage } from '../judgment-library/JudgmentLibraryPage.js';

type Tab = 'legislation' | 'judgments';

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 ${
        active
          ? 'border-gold text-gold'
          : 'border-transparent text-parchment/50 hover:text-parchment/80'
      }`}
      style={{ marginBottom: -1 }}
    >
      {children}
    </button>
  );
}

export function LegalLibraryPage() {
  const [tab, setTab] = useState<Tab>('legislation');

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* Tab bar */}
      <div
        className="flex items-center gap-0 shrink-0"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        <TabBtn active={tab === 'legislation'} onClick={() => setTab('legislation')}>
          <BookOpenIcon size={14} weight="duotone" />
          חקיקה
        </TabBtn>
        <TabBtn active={tab === 'judgments'} onClick={() => setTab('judgments')}>
          <GavelIcon size={14} weight="duotone" />
          פסיקה
        </TabBtn>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'legislation' && <LegalCorpusPage />}
        {tab === 'judgments'   && <JudgmentLibraryPage />}
      </div>
    </div>
  );
}
