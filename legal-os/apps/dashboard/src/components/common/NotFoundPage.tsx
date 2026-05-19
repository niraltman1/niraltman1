import { Link } from 'react-router-dom';
import { WarningIcon } from '@phosphor-icons/react';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <WarningIcon size={56} weight="duotone" className="text-gold/60" />
      <div>
        <h1 className="text-2xl font-serif font-bold text-parchment">דף לא נמצא</h1>
        <p className="text-parchment/60 mt-2">הדף שחיפשת אינו קיים במערכת.</p>
      </div>
      <Link
        to="/dashboard"
        className="px-4 py-2 bg-gold/20 hover:bg-gold/30 text-gold rounded-md
                   transition-colors text-sm font-medium"
      >
        חזרה ללוח הבקרה
      </Link>
    </div>
  );
}
