/**
 * Managing your own extension tokens. Any staff member may mint one for
 * themselves — recruiters need them for the LinkedIn helper — and see or revoke
 * only their own. Session-authenticated (mounted behind the staff guard).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { createApiToken, listApiTokens, revokeApiToken } from "../../lib/apiToken";
import { notFound } from "../../lib/errors";

export const extTokenRoutes = new Hono<AppContext>();

extTokenRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tokens = await listApiTokens(c.env.DB, user.id);
  return c.json({
    tokens: tokens.map((t) => ({
      // The hash is safe to expose — it is not the token, and revoking needs it.
      id: t.token_hash,
      label: t.label,
      created_at: t.created_at,
      last_used_at: t.last_used_at,
      revoked: t.revoked_at !== null,
    })),
  });
});

extTokenRoutes.post("/", async (c) => {
  const { label } = z
    .object({ label: z.string().trim().max(80).default("Browser extension") })
    .parse(await c.req.json().catch(() => ({})));
  const user = c.get("user");
  const { id, raw } = await createApiToken(c.env.DB, user.id, label || "Browser extension");
  // The raw token is returned exactly once; the client shows it and never asks again.
  return c.json({ ok: true, id, token: raw });
});

extTokenRoutes.post("/:id/revoke", async (c) => {
  const user = c.get("user");
  const ok = await revokeApiToken(c.env.DB, user.id, c.req.param("id"));
  if (!ok) throw notFound("No such active token");
  return c.json({ ok: true });
});
