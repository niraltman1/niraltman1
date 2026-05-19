import type { BookCitation, ArticleCitation } from '../schemas/types.js';

// Format a book citation per Nevo Unified Citation Rules 2021.
// Output: {authors} {title} (ed {edition}) {volume} ({year}) {pages}
export function formatBook(c: BookCitation): string {
  const authors = c.authors.join(', ');
  const parts: string[] = [authors, c.title];
  if (c.edition !== undefined && c.edition > 1) {
    parts.push(`(מהדורה ${c.edition})`);
  }
  if (c.volume !== undefined) {
    parts.push(`כרך ${c.volume}`);
  }
  if (c.year !== undefined) {
    parts.push(`(${c.year})`);
  }
  if (c.pages) {
    parts.push(c.pages);
  }
  return parts.join(' ');
}

// Format an article citation per Nevo Unified Citation Rules 2021.
// Output: {authors} "{title}" {volume} {journal} {firstPage} ({year})
export function formatArticle(c: ArticleCitation): string {
  const authors = c.authors.join(', ');
  const parts: string[] = [authors, `"${c.title}"`];
  if (c.volume !== undefined) {
    parts.push(String(c.volume));
  }
  parts.push(c.journal);
  if (c.firstPage) {
    parts.push(c.firstPage);
  }
  if (c.year !== undefined) {
    parts.push(`(${c.year})`);
  }
  if (c.citedPage && c.citedPage !== c.firstPage) {
    parts.push(c.citedPage);
  }
  return parts.join(' ');
}
