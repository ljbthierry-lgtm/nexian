/**
 * The outreach HTTP surface: manual sends, eligibility, the invite wave and the
 * LinkedIn queue. The sending itself lives in ./send so the cron and the wave
 * engine share it without importing HTTP machinery.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext } from "../../env";
import { logActivity } from "../../lib/activity";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { all, first, run, selectByChunks } from "../../lib/db";
import { notFound } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { createActionToken } from "../notifications/tokens";
import { decideOutreach } from "./eligibility";
import { connectionNote, directMessage } from "./linkedin";
import {
  CANDIDATE_SELECT,
  type OutreachCandidateRow,
  policyOf,
  sendOutreachTo,
  toCandidate,
} from "./send";
import { clampLimit, countWaveRemaining, readWave, writeWave } from "./wave";

export const outreachRoutes = new Hono<AppContext>();
outreachRoutes.use("*", requireAuth());

type CandidateRow = OutreachCandidateRow;

outreachRoutes.post("/send", async (c) => {
  const { contactIds } = z
    .object({ contactIds: z.array(z.string().min(1)).min(1).max(200) })
    .parse(await c.req.json());

  const rows = await selectByChunks<CandidateRow>(
    c.env.DB,
    (ph) => `${CANDIDATE_SELECT} WHERE ct.id IN (${ph})`,
    contactIds,
  );
  const user = c.get("user");
  const results = [];
  for (const row of rows) {
    results.push(await sendOutreachTo(c.env, row, user.name, user.id));
  }
  return c.json({
    ok: true,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => !r.sent),
    results,
  });
});

/** Everyone the sequence would act on right now, with the reason when it would not. */
outreachRoutes.get("/eligible", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const rows = await all<CandidateRow>(
    c.env.DB,
    `${CANDIDATE_SELECT}
     WHERE ct.suppressed = 0 AND ct.anonymized_at IS NULL
     ORDER BY ct.outreach_count ASC, ct.created_at ASC
     LIMIT ?`,
    limit * 3,
  );
  const policy = policyOf(c.env);
  const now = new Date();
  const evaluated = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    outreach_count: row.outreach_count,
    decision: decideOutreach(toCandidate(row), policy, now),
  }));
  return c.json({
    policy,
    due: evaluated.filter((e) => e.decision.allowed).slice(0, limit),
    blocked: evaluated.filter((e) => !e.decision.allowed).slice(0, limit),
  });
});

/** The message to paste into LinkedIn, plus the queue bookkeeping. */
outreachRoutes.get("/linkedin/:id", async (c) => {
  const id = c.req.param("id");
  const row = await first<CandidateRow & { linkedin_url: string | null }>(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct WHERE ct.id = ?`,
    id,
  );
  if (!row) throw notFound("No such contact");

  const baseUrl = await resolveBaseUrl(c.env);
  const user = c.get("user");
  // Same personal link as the email channel, marked as LinkedIn — so even a
  // hand-pasted InMail is attributable when the click or registration arrives.
  const inviteToken = await createActionToken(c.env.DB, {
    purpose: "join_prefill",
    contactId: row.id,
    payload: { channel: "linkedin" },
  });
  const input = {
    firstName: row.first_name,
    companyName: c.env.COMPANY_NAME,
    senderName: user.name,
    registerUrl: `${baseUrl}/join?invite=${inviteToken}`,
    focus: c.req.query("focus") ?? undefined,
  };
  const decision = decideOutreach(toCandidate(row), policyOf(c.env));
  return c.json({
    contact: {
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      linkedin_url: row.linkedin_url,
    },
    decision,
    connectionNote: connectionNote(input),
    message: directMessage(input),
  });
});

outreachRoutes.post("/linkedin/:id/queue", async (c) => {
  const id = c.req.param("id");
  await run(
    c.env.DB,
    `UPDATE contacts SET linkedin_state = 'queued', updated_at = datetime('now') WHERE id = ?`,
    id,
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "linkedin_queued",
    channel: "linkedin",
    summary: "Queued for a LinkedIn message",
    actorUserId: c.get("user").id,
  });
  return c.json({ ok: true });
});

/**
 * Recorded after the recruiter has actually sent it in LinkedIn. This counts as
 * a touch, so the email sequence and the LinkedIn queue share one budget.
 */
outreachRoutes.post("/linkedin/:id/sent", async (c) => {
  const id = c.req.param("id");
  await run(
    c.env.DB,
    `UPDATE contacts
       SET linkedin_state = 'sent', linkedin_sent_at = datetime('now'),
           outreach_count = outreach_count + 1,
           first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
           last_outreach_at = datetime('now'),
           stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
           updated_at = datetime('now')
     WHERE id = ?`,
    id,
  );
  await logActivity(c.env.DB, {
    contactId: id,
    kind: "linkedin_sent",
    channel: "linkedin",
    summary: "LinkedIn message sent by hand",
    actorUserId: c.get("user").id,
  });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- invite wave */

outreachRoutes.get("/wave", async (c) => {
  const state = await readWave(c.env.DB);
  const remaining = await countWaveRemaining(c.env.DB);
  // How many first-invites have gone out since the wave started — the progress
  // number on the card. Counted from the email log, the record of fact.
  const sent = state.startedAt
    ? ((
        await first<{ n: number }>(
          c.env.DB,
          `SELECT COUNT(*) AS n FROM email_log
         WHERE template = 'invite' AND status = 'sent' AND created_at >= ?`,
          state.startedAt,
        )
      )?.n ?? 0)
    : 0;
  return c.json({ ...state, remaining, sentSinceStart: sent, nextRunUtc: "07:00" });
});

outreachRoutes.post("/wave", async (c) => {
  const { action, dailyLimit } = z
    .object({
      action: z.enum(["start", "pause"]),
      dailyLimit: z.number().int().min(1).max(100).optional(),
    })
    .parse(await c.req.json());

  const state = await readWave(c.env.DB);
  if (action === "start") {
    await writeWave(c.env.DB, {
      active: true,
      dailyLimit: clampLimit(dailyLimit ?? state.dailyLimit),
      // A restart after a pause keeps the original start, so the progress
      // number keeps counting the whole wave rather than resetting.
      startedAt: state.startedAt ?? new Date().toISOString(),
      completedAt: null,
    });
  } else {
    await writeWave(c.env.DB, { ...state, active: false });
  }
  return c.json({ ok: true, state: await readWave(c.env.DB) });
});

/* ---------------------------------------------------------- LinkedIn queue */

/**
 * Everyone whose next touch would be a LinkedIn message: prospects with a
 * profile URL who still have touch budget and no email — plus those explicitly
 * queued by a recruiter. Ordered queued-first so "I'll do ten now" starts with
 * the ones somebody already picked.
 */
outreachRoutes.get("/queue", async (c) => {
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const rows = await all<
    OutreachCandidateRow & { linkedin_url: string | null; linkedin_state: string }
  >(
    c.env.DB,
    `SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
            ct.anonymized_at, ct.outreach_count, ct.last_outreach_at, ct.linkedin_url,
            ct.linkedin_state,
            (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
     FROM contacts ct
     WHERE ct.suppressed = 0
       AND ct.anonymized_at IS NULL
       AND ct.linkedin_url IS NOT NULL
       AND ct.linkedin_state != 'sent'
       AND ct.outreach_count < ?
       AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)
     ORDER BY CASE ct.linkedin_state WHEN 'queued' THEN 0 ELSE 1 END,
              ct.email IS NOT NULL, ct.created_at ASC
     LIMIT ?`,
    policyOf(c.env).maxTouches,
    limit,
  );
  return c.json({
    queue: rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`.trim(),
      linkedin_url: r.linkedin_url,
      hasEmail: r.email !== null,
      queued: r.linkedin_state === "queued",
      outreach_count: r.outreach_count,
    })),
  });
});
