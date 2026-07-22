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
