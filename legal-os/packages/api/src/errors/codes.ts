export const ErrorCode = {
  NOT_FOUND:        'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT:         'CONFLICT',
  INTEGRITY_ERROR:  'INTEGRITY_ERROR',
  INTERNAL_ERROR:   'INTERNAL_ERROR',
  UNAUTHORIZED:     'UNAUTHORIZED',
  FORBIDDEN:        'FORBIDDEN',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
