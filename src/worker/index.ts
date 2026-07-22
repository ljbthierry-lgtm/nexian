import { Hono } from "hono";
import { ZodError } from "zod";
import { runScheduledJobs } from "./cron";
import type { AppContext, Env } from "./env";
import { rememberOrigin } from "./lib/baseUrl";
import { AppError } from "./lib/errors";
import { harden } from "./lib/securityHeaders";
import { log } from "./lib/log";
import { requireAuth } from "./middleware/auth";
import { actionRoutes } from "./modules/actions/routes";
import { adminRoutes } from "./modules/admin/routes";
import { authRoutes } from "./modules/auth/routes";
import { campaignRoutes } from "./modules/campaigns/routes";
import { contactRoutes } from "./modules/contacts/routes";
import { outreachRoutes } from "./modules/outreach/routes";
import { poolRoutes } from "./modules/pool/routes";
import { portalRoutes } from "./modules/portal/routes";
import { publicRoutes } from "./modules/publicsite/routes";

const app = new Hono<AppContext>();

/* ---- global error boundary: loud in the logs, graceful to the client ---- */
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.status as 400);
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return c.json({ error: "validation", message }, 400);
  }
  log.error("unhandled_error", {
    path: c.req.path,
    method: c.req.method,
    error: err.message,
    stack: err.stack?.split("\n").slice(0, 5).join(" | "),
  });
  return c.json(
    { error: "internal", message: "Something went wrong — the error has been logged." },
    500,
  );
});

/* ---- security headers + learn the public origin for email links ---- */
app.use("*", async (c, next) => {
  c.executionCtx?.waitUntil?.(rememberOrigin(c.env, c.req.url).catch(() => {}));
  await next();
  harden(c.res.headers);
});

/**
 * Uptime probe. It touches D1 on purpose: a health check that only proves the
 * Worker booted stays green through a total database outage, which is precisely
 * the failure someone needs to be told about.
 */
app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true, env: c.env.APP_ENV, db: "ok" });
  } catch (e) {
    log.error("health.db_unreachable", { error: e instanceof Error ? e.message : String(e) });
    return c.json({ ok: false, env: c.env.APP_ENV, db: "unreachable" }, 503);
  }
});

/* ---- token-authenticated email actions (no session) ---- */
app.route("/a", actionRoutes);

/* ---- public: registration and "email me my link" ---- */
app.route("/api/public", publicRoutes);

/* ---- staff auth (login/bootstrap are public; /me guards itself) ---- */
app.route("/api/auth", authRoutes);

/* ---- freelancer portal (its own cookie, guarded inside the router) ---- */
app.route("/api/portal", portalRoutes);

/* ---- everything else under /api requires a staff session ---- */
app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/public/") ||
    path.startsWith("/api/portal/") ||
    path === "/api/health"
  ) {
    return next();
  }
  return requireAuth()(c, next);
});

app.route("/api/contacts", contactRoutes);
app.route("/api/outreach", outreachRoutes);
app.route("/api/pool", poolRoutes);
app.route("/api/campaigns", campaignRoutes);
app.route("/api/admin", adminRoutes);

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found", message: "Unknown API route" }, 404);
  }
  // Non-API paths fall through to the SPA. The asset response is built by the
  // runtime, so Hono's c.header() never reaches it — copy it and set the headers
  // explicitly, or the login page would be frameable.
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  const res = new Response(asset.body, asset);
  harden(res.headers);
  return res;
});

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledJobs(env));
  },
};
