const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors, so check both the error and its cause. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}
