/**
 * Personal API tokens for the extension.
 *
 * A token authenticates as one staff member and nothing more; a revoked or
 * unknown token is refused indistinguishably, and one person can never revoke
 * another's. Run against the real schema.
 */
import { describe, expect, it } from "vitest";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
} from "../src/worker/lib/apiToken";
import { migratedDb } from "./helpers/d1";

function seedUser(db: ReturnType<typeof migratedDb>, id: string, role = "recruiter") {
  db.raw
    .prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`)
    .run(id, `${id}@nexian.test`, id, role);
}

describe("minting and using a token", () => {
  it("authenticates as the owning user", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    const { raw } = await createApiToken(db as unknown as D1Database, "u1", "My laptop");
    const who = await verifyApiToken(db as unknown as D1Database, `Bearer ${raw}`);
    expect(who?.id).toBe("u1");
    expect(who?.role).toBe("recruiter");
  });

  it("stores only a hash, never the raw token", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    const { raw } = await createApiToken(db as unknown as D1Database, "u1", "x");
    const rows = db.raw.prepare(`SELECT token_hash FROM api_tokens`).all() as {
      token_hash: string;
    }[];
    expect(rows[0]!.token_hash).not.toBe(raw);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tolerates the bearer prefix being present or absent", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    const { raw } = await createApiToken(db as unknown as D1Database, "u1", "x");
    expect((await verifyApiToken(db as unknown as D1Database, raw))?.id).toBe("u1");
    expect((await verifyApiToken(db as unknown as D1Database, `Bearer ${raw}`))?.id).toBe("u1");
  });
});

describe("a token that must not work", () => {
  it("refuses an unknown token", async () => {
    const db = migratedDb();
    expect(await verifyApiToken(db as unknown as D1Database, "Bearer nxext_deadbeef")).toBeNull();
  });

  it("refuses anything without the nxext_ prefix", async () => {
    const db = migratedDb();
    for (const bad of ["", "Bearer ", "Bearer sometoken", null, undefined]) {
      expect(await verifyApiToken(db as unknown as D1Database, bad)).toBeNull();
    }
  });

  it("refuses a revoked token", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    const { id, raw } = await createApiToken(db as unknown as D1Database, "u1", "x");
    expect(await revokeApiToken(db as unknown as D1Database, "u1", id)).toBe(true);
    expect(await verifyApiToken(db as unknown as D1Database, `Bearer ${raw}`)).toBeNull();
  });

  it("refuses a token whose account has been disabled", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    const { raw } = await createApiToken(db as unknown as D1Database, "u1", "x");
    db.raw.prepare(`UPDATE users SET active = 0 WHERE id = 'u1'`).run();
    expect(await verifyApiToken(db as unknown as D1Database, `Bearer ${raw}`)).toBeNull();
  });
});

describe("tokens are scoped to their owner", () => {
  it("one user cannot revoke another's token", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    seedUser(db, "u2");
    const { id, raw } = await createApiToken(db as unknown as D1Database, "u1", "x");
    // u2 tries to revoke u1's token.
    expect(await revokeApiToken(db as unknown as D1Database, "u2", id)).toBe(false);
    // Still works for u1.
    expect((await verifyApiToken(db as unknown as D1Database, `Bearer ${raw}`))?.id).toBe("u1");
  });

  it("lists only the caller's tokens", async () => {
    const db = migratedDb();
    seedUser(db, "u1");
    seedUser(db, "u2");
    await createApiToken(db as unknown as D1Database, "u1", "a");
    await createApiToken(db as unknown as D1Database, "u1", "b");
    await createApiToken(db as unknown as D1Database, "u2", "c");
    expect(await listApiTokens(db as unknown as D1Database, "u1")).toHaveLength(2);
    expect(await listApiTokens(db as unknown as D1Database, "u2")).toHaveLength(1);
  });
});
