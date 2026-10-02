function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Converts a snake_case DB row to camelCase keys.
 *
 * Accepts null/undefined and returns null, so optional single-row lookups
 * (e.g. `camelCaseKeys(rows[0]) ?? null`) do not throw when no row matched.
 * Previously an absent compensation or risk row crashed the AI chat path.
 */
export function camelCaseKeys<T = Record<string, unknown>>(row: Record<string, unknown> | null | undefined): T | null {
  if (row === null || row === undefined) return null;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamel(key)] = value;
  }
  return result as T;
}

export function camelCaseRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return (rows ?? []).map((row) => camelCaseKeys<T>(row) as T);
}
