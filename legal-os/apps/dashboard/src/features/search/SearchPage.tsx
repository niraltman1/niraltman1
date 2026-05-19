import { useState } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

export function SearchPage() {
  const [query, setQuery] = useState('');

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">חיפוש</h1>
        <p className="text-parchment/50 text-sm mt-1">חיפוש טקסט מלא במסמכים, לקוחות ותיקים</p>
      </div>

      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon
          size={18}
          className="absolute top-1/2 -translate-y-1/2 right-3 text-parchment/40 pointer-events-none"
        />
        <input
          type="search"
          placeholder="הקלד לחיפוש…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-navy-100 border border-parchment/20 rounded-lg
                     pr-10 pl-4 py-2.5 text-parchment placeholder-parchment/40
                     text-sm outline-none focus:border-gold/50 transition-colors"
          dir="rtl"
        />
      </div>

      {/* Results */}
      {query.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-parchment/30 gap-3">
          <MagnifyingGlassIcon size={40} weight="thin" />
          <span className="text-sm">הזן מונח לחיפוש</span>
        </div>
      ) : (
        <div className="bg-navy-100 border border-parchment/10 rounded-lg p-4 text-parchment/40 text-sm text-center py-10">
          מחפש עבור &ldquo;{query}&rdquo;…
        </div>
      )}
    </div>
  );
}
