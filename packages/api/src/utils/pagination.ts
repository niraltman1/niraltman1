export function parsePagination(
  query: Record<string, unknown>,
  defaults = { page: 1, pageSize: 50 },
): { page: number; pageSize: number } {
  const page     = Math.max(1, Number(query['page']     ?? defaults.page));
  const pageSize = Math.min(200, Math.max(1, Number(query['pageSize'] ?? defaults.pageSize)));
  return {
    page:     Number.isFinite(page)     ? page     : defaults.page,
    pageSize: Number.isFinite(pageSize) ? pageSize : defaults.pageSize,
  };
}
