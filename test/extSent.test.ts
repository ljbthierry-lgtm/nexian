/**
 * The browser extension records a LinkedIn touch through POST /api/ext/sent.
 *
 * That touch shares the 2-touch cap with email, and the cap is a hard stop. The
 * disabled "Mark as sent" button in the extension is only a convenience — the
 * server must refuse a touch on its own, so a stale or hand-made call cannot push
 * someone past the cap or contact a suppressed / registered / replied person.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/worker/env";
import { createApiToken } from "../src/worker/lib/apiToken";
import { AppError } from "../src/worker/lib/errors";
import { extRoutes } from "../src/worker/modules/ext/routes";
import { type FakeD1, migratedDb } from "./helpers/d1";

function env(db: FakeD1): Env {
  return { DB: db } as unknown as Env;
}

/** Mirror index.ts's error boundary so thrown AppErrors map to their status. */
function appWith(): Hono {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof AppError)
      return c.json({ error: err.code, message: err.message }, err.status as 400);
    return c.json({ error: "internal" }, 500);
  });
  app.route("/api/ext", extRoutes);
  return app;
}

function seedUser(db: FakeD1, id = "u1"): string {
  db.raw
    .prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, 'Rec', 'recruiter')`)
    .run(id, `${id}@nexian.test`);
  return id;
}

function seedContact(
  db: FakeD1,
  opts: {
    id: string;
    outreachCount?: number;
    suppressed?: boolean;
    repliedAt?: string | null;
    withProfile?: boolean;
  },
): void {
  db.raw
    .prepare(
      `INSERT INTO contacts (id, email, first_name, last_name, outreach_count, suppressed, replied_at)
       VALUES (?, ?, 'A', 'B', ?, ?, ?)`,
    )
    .run(
      opts.id,
      `${opts.id}@person.test`,
      opts.outreachCount ?? 0,
      opts.suppressed ? 1 : 0,
      opts.repliedAt ?? null,
    );
  if (opts.withProfile) {
    db.raw
      .prepare(`INSERT INTO profiles (contact_id, availability) VALUES (?, 'now')`)
      .run(opts.id);
  }
}

async function markSent(db: FakeD1, token: string, contactId: string): Promise<Response> {
  return appWith().request(
    "/api/ext/sent",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ contactId }),
    },
    env(db),
  );
}

function outreachCount(db: FakeD1, id: string): number {
  return (
    db.raw.prepare(`SELECT outreach_count AS n FROM contacts WHERE id = ?`).get(id) as { n: number }
  ).n;
}

describe("POST /api/ext/sent enforces the shared outreach cap server-side", () => {
  it("records the first touch and increments the counter", async () => {
    const db = migratedDb();
    const uid = seedUser(db);
    const token = await createApiToken(db as unknown as D1Database, uid, "test");
    seedContact(db, { id: "c1", outreachCount: 0 });

    const res = await markSent(db, token.raw, "c1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(outreachCount(db, "c1")).toBe(1);
  });

  it("refuses a third touch once the cap is reached, and does not increment", async () => {
    const db = migratedDb();
    const uid = seedUser(db);
    const token = await createApiToken(db as unknown as D1Database, uid, "test");
    seedContact(db, { id: "c1", outreachCount: 2 });

    const res = await markSent(db, token.raw, "c1");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "not_allowed" });
    expect(outreachCount(db, "c1")).toBe(2);
  });

  it("refuses a touch on a suppressed contact", async () => {
    const db = migratedDb();
    const uid = seedUser(db);
    const token = await createApiToken(db as unknown as D1Database, uid, "test");
    seedContact(db, { id: "c1", outreachCount: 0, suppressed: true });

    const res = await markSent(db, token.raw, "c1");
    expect(res.status).toBe(409);
    expect(outreachCount(db, "c1")).toBe(0);
  });

  it("refuses a touch on someone who already replied", async () => {
    const db = migratedDb();
    const uid = seedUser(db);
    const token = await createApiToken(db as unknown as D1Database, uid, "test");
    seedContact(db, { id: "c1", outreachCount: 1, repliedAt: "2026-01-01 00:00:00" });

    const res = await markSent(db, token.raw, "c1");
    expect(res.status).toBe(409);
    expect(outreachCount(db, "c1")).toBe(1);
  });

  it("refuses a touch on someone already registered in the pool", async () => {
    const db = migratedDb();
    const uid = seedUser(db);
    const token = await createApiToken(db as unknown as D1Database, uid, "test");
    seedContact(db, { id: "c1", outreachCount: 0, withProfile: true });

    const res = await markSent(db, token.raw, "c1");
    expect(res.status).toBe(409);
    expect(outreachCount(db, "c1")).toBe(0);
  });

  it("rejects an invalid bearer token", async () => {
    const db = migratedDb();
    seedContact(db, { id: "c1" });
    const res = await markSent(db, "nxext_not_a_real_token", "c1");
    expect(res.status).toBe(401);
    expect(outreachCount(db, "c1")).toBe(0);
  });
});
