/** Sending the invite sequence, and running the manual LinkedIn queue. */
import { Hono } from "hono";
import { z } from "zod";
import { type Env, intVar } from "../../env";
import type { AppContext } from "../../env";
import { logActivity } from "../../lib/activity";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { all, first, run } from "../../lib/db";
import { notFound } from "../../lib/errors";
import { sendEmail } from "../notifications/resend";
import { followUpEmail, inviteEmail } from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";
import { requireAuth } from "../../middleware/auth";
import { type OutreachCandidate, decideOutreach } from "./eligibility";
import { connectionNote, directMessage } from "./linkedin";

export const outreachRoutes = new Hono<AppContext>();
outreachRoutes.use("*", requireAuth());

export function policyOf(env: Env) {
  return {
    maxTouches: intVar(env.MAX_OUTREACH_TOUCHES, 2),
    followUpAfterDays: intVar(env.FOLLOWUP_AFTER_DAYS, 10),
  };
}

interface CandidateRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  source: string;
  suppressed: number;
  anonymized_at: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
  has_profile: number;
}

const CANDIDATE_SELECT = `
  SELECT ct.id, ct.email, ct.first_name, ct.last_name, ct.source, ct.suppressed,
         ct.anonymized_at, ct.outreach_count, ct.last_outreach_at,
         (SELECT COUNT(*) FROM profiles p WHERE p.contact_id = ct.id) AS has_profile
  FROM contacts ct`;

function toCandidate(row: CandidateRow): OutreachCandidate {
  return {
    suppressed: row.suppressed === 1,
    anonymized: row.anonymized_at !== null,
    hasProfile: row.has_profile > 0,
    outreachCount: row.outreach_count,
    lastOutreachAt: row.last_outreach_at,
  };
}

/**
 * Send the next step of the sequence to each named contact.
 *
 * The decision is re-taken here, server-side, for every recipient — the client
 * may believe someone is eligible, but this is what decides.
 */
export async function sendOutreachTo(
  env: Env,
  row: CandidateRow,
  senderName: string,
  actorUserId: string | null,
  now = new Date(),
): Promise<{ id: string; email: string; sent: boolean; reason?: string; kind?: string }> {
  const decision = decideOutreach(toCandidate(row), policyOf(env), now);
  if (!decision.allowed) {
    return { id: row.id, email: row.email, sent: false, reason: decision.reason };
  }

  const baseUrl = await resolveBaseUrl(env);
  const ctx = { companyName: env.COMPANY_NAME, baseUrl };
  const optOutToken = await createActionToken(env.DB, {
    purpose: "unsubscribe",
    contactId: row.id,
    payload: { scope: "all" },
  });
  const registerUrl = `${baseUrl}/join`;
  const optOutUrl = `${baseUrl}/a/${optOutToken}`;

  const mail =
    decision.kind === "invite"
      ? inviteEmail(ctx, {
          firstName: row.first_name,
          source: row.source,
          registerUrl,
          optOutUrl,
          senderName,
        })
      : followUpEmail(ctx, {
          firstName: row.first_name,
          registerUrl,
          optOutUrl,
          senderName,
        });

  const ok = await sendEmail(env, {
    to: row.email,
    subject: mail.subject,
    html: mail.html,
    template: decision.kind,
    contactId: row.id,
  });

  if (ok) {
    await run(
      env.DB,
      `UPDATE contacts
         SET outreach_count = outreach_count + 1,
             first_outreach_at = COALESCE(first_outreach_at, datetime('now')),
             last_outreach_at = datetime('now'),
             stage = CASE WHEN stage = 'prospect' THEN 'contacted' ELSE stage END,
             updated_at = datetime('now')
       WHERE id = ?`,
      row.id,
    );
  }
  await logActivity(env.DB, {
    contactId: row.id,
    kind: ok ? "email_sent" : "email_failed",
    channel: "email",
    summary: ok
      ? `Sent the ${decision.kind === "invite" ? "invitation" : "follow-up"} email`
      : `Failed to send the ${decision.kind} email`,
    actorUserId,
  });

  return {
    id: row.id,
    email: row.email,
    sent: ok,
    kind: decision.kind,
    reason: ok ? undefined : "The email provider rejected the message",
  };
}

outreachRoutes.post("/send", async (c) => {
  const { contactIds } = z
    .object({ contactIds: z.array(z.string().min(1)).min(1).max(200) })
    .parse(await c.req.json());

  const rows = await all<CandidateRow>(
    c.env.DB,
    `${CANDIDATE_SELECT} WHERE ct.id IN (${contactIds.map(() => "?").join(", ")})`,
    ...contactIds,
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
  const input = {
    firstName: row.first_name,
    companyName: c.env.COMPANY_NAME,
    senderName: user.name,
    registerUrl: `${baseUrl}/join`,
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
