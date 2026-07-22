/**
 * Campaigns: news and mission alerts to people who asked for them.
 *
 * The audience always comes from `buildAudienceQuery`, which joins the consent
 * ledger. There is no parameter, flag or admin override in this module that can
 * widen a send beyond people who granted that exact purpose.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppContext, CampaignPurpose } from "../../env";
import { logActivity } from "../../lib/activity";
import { resolveBaseUrl } from "../../lib/baseUrl";
import { all, first, run, uid } from "../../lib/db";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { log } from "../../lib/log";
import { type Segment, buildAudienceQuery, buildPoolFilter, whereClause } from "../../lib/segment";
import { requireAuth } from "../../middleware/auth";
import { sendEmail } from "../notifications/resend";
import { campaignEmail } from "../notifications/templates";
import { createActionToken } from "../notifications/tokens";

export const campaignRoutes = new Hono<AppContext>();
campaignRoutes.use("*", requireAuth());

const segmentSchema = z
  .object({
    skills: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    availability: z.array(z.enum(["now", "from_date", "not_available", "unknown"])).optional(),
    availableWithinDays: z.number().int().min(0).max(3650).optional(),
    rateMin: z.number().int().min(0).optional(),
    rateMax: z.number().int().min(0).optional(),
    minYears: z.number().int().min(0).max(70).optional(),
    stages: z
      .array(z.enum(["prospect", "contacted", "registered", "vetted", "on_mission", "closed"]))
      .optional(),
    staleDays: z.number().int().min(0).max(3650).optional(),
    search: z.string().optional(),
  })
  .default({});

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  purpose: z.enum(["mission_alerts", "news"]),
  segment: segmentSchema,
});

interface AudienceRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

async function loadAudience(
  db: D1Database,
  segment: Segment,
  purpose: CampaignPurpose,
): Promise<AudienceRow[]> {
  const { sql, params } = buildAudienceQuery(segment, purpose);
  return all<AudienceRow>(db, sql, ...params);
}

campaignRoutes.get("/", async (c) => {
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT c.id, c.name, c.subject, c.purpose, c.status, c.created_at, c.sent_at,
            c.sent_count, c.failed_count, u.name AS created_by_name
     FROM campaigns c LEFT JOIN users u ON u.id = c.created_by
     ORDER BY c.created_at DESC LIMIT 100`,
  );
  return c.json({ campaigns: rows });
});

/** How many people this segment reaches — and how many it excludes, and why. */
campaignRoutes.post("/preview", async (c) => {
  const { segment, purpose } = z
    .object({ segment: segmentSchema, purpose: z.enum(["mission_alerts", "news"]) })
    .parse(await c.req.json());

  const audience = await loadAudience(c.env.DB, segment, purpose);

  // The same segment ignoring consent, so the screen can state the gap plainly
  // instead of leaving a recruiter wondering why the number shrank.
  const frag = buildPoolFilter(segment);
  const matching = await first<{ n: number }>(
    c.env.DB,
    `SELECT COUNT(*) AS n FROM contacts ct JOIN profiles p ON p.contact_id = ct.id ${whereClause(frag)}`,
    ...frag.params,
  );

  return c.json({
    eligible: audience.length,
    matchingSegment: matching?.n ?? audience.length,
    excludedForConsent: Math.max((matching?.n ?? 0) - audience.length, 0),
    sample: audience.slice(0, 10).map((a) => ({
      name: `${a.first_name} ${a.last_name}`.trim(),
      email: a.email,
    })),
  });
});

campaignRoutes.post("/", async (c) => {
  const input = campaignSchema.parse(await c.req.json());
  const id = uid();
  await run(
    c.env.DB,
    `INSERT INTO campaigns (id, name, subject, body, purpose, segment, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.subject,
    input.body,
    input.purpose,
    JSON.stringify(input.segment),
    c.get("user").id,
  );
  return c.json({ ok: true, id });
});

campaignRoutes.get("/:id", async (c) => {
  const row = await first<Record<string, unknown>>(
    c.env.DB,
    `SELECT * FROM campaigns WHERE id = ?`,
    c.req.param("id"),
  );
  if (!row) throw notFound("No such campaign");
  const recipients = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT cr.status, cr.error, cr.sent_at, ct.email, ct.first_name, ct.last_name
     FROM campaign_recipients cr JOIN contacts ct ON ct.id = cr.contact_id
     WHERE cr.campaign_id = ? ORDER BY cr.sent_at DESC LIMIT 500`,
    c.req.param("id"),
  );
  return c.json({
    campaign: { ...row, segment: JSON.parse(String(row.segment ?? "{}")) },
    recipients,
  });
});

/**
 * Send. The audience is rebuilt from the consent ledger at this moment — someone
 * who withdrew consent between drafting and sending is simply not in it.
 */
campaignRoutes.post("/:id/send", async (c) => {
  const id = c.req.param("id");
  const campaign = await first<{
    id: string;
    name: string;
    subject: string;
    body: string;
    purpose: CampaignPurpose;
    segment: string;
    status: string;
  }>(c.env.DB, `SELECT * FROM campaigns WHERE id = ?`, id);
  if (!campaign) throw notFound("No such campaign");
  if (campaign.status === "sent") throw conflict("This campaign has already been sent.");

  const segment = JSON.parse(campaign.segment || "{}") as Segment;
  const audience = await loadAudience(c.env.DB, segment, campaign.purpose);
  if (!audience.length) {
    throw badRequest(
      "Nobody in this segment has agreed to receive these emails, so there is nothing to send.",
      "empty_audience",
    );
  }

  await run(c.env.DB, `UPDATE campaigns SET status = 'sending' WHERE id = ?`, id);
  const baseUrl = await resolveBaseUrl(c.env);
  const ctx = { companyName: c.env.COMPANY_NAME, baseUrl };
  let sent = 0;
  let failed = 0;

  for (const person of audience) {
    const unsubToken = await createActionToken(c.env.DB, {
      purpose: "unsubscribe",
      contactId: person.id,
      payload: { scope: campaign.purpose },
    });
    const portalToken = await createActionToken(c.env.DB, {
      purpose: "portal_link",
      contactId: person.id,
    });
    const mail = campaignEmail(ctx, {
      firstName: person.first_name,
      subject: campaign.subject,
      body: campaign.body,
      portalUrl: `${baseUrl}/a/${portalToken}`,
      unsubscribeUrl: `${baseUrl}/a/${unsubToken}`,
    });
    const ok = await sendEmail(c.env, {
      to: person.email,
      subject: mail.subject,
      html: mail.html,
      template: `campaign:${campaign.purpose}`,
      contactId: person.id,
      campaignId: campaign.id,
    });
    ok ? sent++ : failed++;
    await run(
      c.env.DB,
      `INSERT INTO campaign_recipients (campaign_id, contact_id, status, error)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign_id, contact_id) DO UPDATE SET status = excluded.status`,
      campaign.id,
      person.id,
      ok ? "sent" : "failed",
      ok ? null : "Send failed — see the email log",
    );
    await logActivity(c.env.DB, {
      contactId: person.id,
      kind: ok ? "email_sent" : "email_failed",
      channel: "email",
      summary: `${ok ? "Received" : "Failed to receive"} campaign “${campaign.name}”`,
      actorUserId: c.get("user").id,
    });
  }

  await run(
    c.env.DB,
    `UPDATE campaigns SET status = 'sent', sent_at = datetime('now'), sent_count = ?, failed_count = ?
     WHERE id = ?`,
    sent,
    failed,
    id,
  );
  log.info("campaign.sent", { campaign: id, sent, failed });
  return c.json({ ok: true, sent, failed });
});
