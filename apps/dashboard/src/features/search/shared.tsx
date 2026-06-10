import { Fragment } from 'react';
import { FileTextIcon, UsersIcon, GavelIcon, BookOpenIcon, NoteIcon, ScalesIcon } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import type { SearchHit } from '@/api/hooks.js';

export type SearchEntityType = SearchHit['entityType'];

type IconCmp = React.ComponentType<{ size?: number; className?: string; weight?: IconWeight }>;

interface EntityMeta {
  /** Plural section label (Hebrew). */
  label:    string;
  /** Singular badge label (Hebrew). */
  badge:    string;
  Icon:     IconCmp;
  /** Tailwind text-colour for the icon/accent. */
  accent:   string;
  badgeCls: string;
}

export const ENTITY_META: Record<SearchEntityType, EntityMeta> = {
  client:      { label: 'לקוחות',    badge: 'לקוח',   Icon: UsersIcon,    accent: 'text-blue-400',     badgeCls: 'badge badge-blue'    },
  case:        { label: 'תיקים',     badge: 'תיק',    Icon: GavelIcon,    accent: 'text-gold',         badgeCls: 'badge badge-gold'    },
  document:    { label: 'מסמכים',    badge: 'מסמך',   Icon: FileTextIcon, accent: 'text-parchment/40', badgeCls: 'badge badge-neutral' },
  legislation: { label: 'חקיקה',     badge: 'חוק',    Icon: BookOpenIcon, accent: 'text-emerald-400',  badgeCls: 'badge badge-success' },
  draft:       { label: 'טיוטות',    badge: 'טיוטה',  Icon: NoteIcon,     accent: 'text-amber-400',    badgeCls: 'badge badge-warning' },
  precedent:   { label: 'תקדימים',   badge: 'תקדים',  Icon: ScalesIcon,   accent: 'text-purple-400',   badgeCls: 'badge badge-neutral' },
};

/** Deterministic display order. */
export const ENTITY_ORDER: SearchEntityType[] = ['client', 'case', 'document', 'legislation', 'draft', 'precedent'];

/** Route a hit navigates to on activation. */
export function resultHref(hit: SearchHit): string {
  switch (hit.entityType) {
    case 'client':      return `/clients/${hit.id}`;
    case 'case':        return `/cases/${hit.id}`;
    case 'document':    return `/documents/${hit.id}`;
    case 'legislation': return `/legal-corpus`;
    case 'draft':       return `/drafting/${hit.id}`;
    case 'precedent':   return `/precedents`;
    default:            return '/';
  }
}

/** Whether a hit type can be sent to the Evidence Shelf. */
export function canSendToShelf(entityType: SearchEntityType): boolean {
  return entityType === 'legislation' || entityType === 'precedent' || entityType === 'document';
}

/** Secondary line — shown only when it adds info beyond the title. */
export function resultSub(hit: SearchHit): string | null {
  const snippet = hit.snippet?.trim();
  if (!snippet || snippet === hit.title.trim()) return null;
  return snippet;
}

/** Group a flat hit list into ordered sections. Empty sections are dropped. */
export function groupHits(hits: SearchHit[]): { type: SearchEntityType; items: SearchHit[] }[] {
  const map = new Map<SearchEntityType, SearchHit[]>();
  for (const h of hits) {
    const list = map.get(h.entityType);
    if (list) list.push(h);
    else map.set(h.entityType, [h]);
  }
  return ENTITY_ORDER.flatMap((type) => {
    const items = map.get(type);
    return items && items.length > 0 ? [{ type, items }] : [];
  });
}

/** Count hits of a given entity type (for filter-pill badges). */
export function countByType(hits: SearchHit[], type: SearchEntityType): number {
  return hits.reduce((n, h) => (h.entityType === type ? n + 1 : n), 0);
}

// ── Term highlighting ─────────────────────────────────────────────────────────
// Case-insensitive, Hebrew-friendly: wraps occurrences of each query token
// (≥2 chars) in <mark>. Tokens are escaped for use in a RegExp.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Renders `text` with every query token highlighted. */
export function Highlight({ text, query }: { text: string; query: string }): React.ReactElement {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(escapeRegExp);

  if (tokens.length === 0) return <>{text}</>;

  // split() with a capturing group puts the matched delimiters at odd indices.
  const re = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = text.split(re);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-gold/30 text-parchment rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
