/** Thin typed helpers over D1 — the only place raw SQL execution happens. */

export async function all<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const res = await db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return res.results ?? [];
}

export async function first<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<T>();
  return (row as T | null) ?? null;
}

export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}

/**
 * D1 rejects a query with more than 100 bound parameters, so an `IN (…)` list
 * longer than that must be run in slices. `buildSql` receives the `?, ?, …`
 * placeholder string for one chunk; the rows from every chunk are concatenated.
 * The IN values are the ONLY bound parameters, which holds for every caller.
 *
 * The chunk is kept below the hard limit to leave headroom for the odd extra
 * parameter and because there is no benefit to running right at the edge.
 */
export const IN_CHUNK = 90;

export async function selectByChunks<T = Record<string, unknown>>(
  db: D1Database,
  buildSql: (placeholders: string) => string,
  values: unknown[],
  chunkSize = IN_CHUNK,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const slice = values.slice(i, i + chunkSize);
    const placeholders = slice.map(() => "?").join(", ");
    out.push(...(await all<T>(db, buildSql(placeholders), ...slice)));
  }
  return out;
}

/** Batch statements atomically (D1 batches run in a single transaction). */
export async function batch(
  db: D1Database,
  statements: { sql: string; params: unknown[] }[],
): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
}

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
