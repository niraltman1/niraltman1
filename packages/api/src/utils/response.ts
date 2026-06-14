import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function fail(res: Response, code: string, message: string, status = 500): void {
  res.status(status).json({ success: false, error: { code, message } });
}

export interface PaginationMeta {
  page:     number;
  pageSize: number;
  total:    number;
  totalPages: number;
}

export function okPaginated<T>(
  res: Response,
  data: T[],
  meta: Omit<PaginationMeta, 'totalPages'>,
): void {
  res.status(200).json({
    success: true,
    data,
    pagination: {
      ...meta,
      totalPages: Math.ceil(meta.total / meta.pageSize),
    },
  });
}
