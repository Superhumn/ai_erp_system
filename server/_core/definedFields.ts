/**
 * Strip `undefined` values from a partial-update payload.
 *
 * tRPC inputs built from `z.object({ ...optional fields })` arrive with every
 * omitted key set to `undefined`. Drizzle's `.set()` drops those keys and then
 * throws "No values to set" (or emits `UPDATE t SET WHERE …`, a SQL syntax
 * error) when nothing is left. Returns `null` when there is nothing to update
 * so callers can short-circuit instead of hitting the database.
 */
export function definedFields<T extends object>(data: T): Partial<T> | null {
  const out: Partial<T> = {};
  let any = false;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
      any = true;
    }
  }
  return any ? out : null;
}
