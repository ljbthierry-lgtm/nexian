/**
 * Delivery events from Resend.
 *
 * Public endpoint, so the signature is the gate — see lib/webhookSignature.ts
 * for why that matters more here than the handling does. Everything after the
 * check is deliberately forgiving: a webhook we cannot make sense of is
 * acknowledged and logged rather than retried forever, because a provider that
 * keeps retrying a message we will never understand is just noise.
 */
import { Hono } from "hono";
import type { AppContext } from "../../env";
import { logActivity } from "../../lib/activity";
import { classifyDeliveryEvent } from "../../lib/deliverability";
import { first, run } from "../../lib/db";
import { log } from "../../lib/log";
import { suppressContact } from "../../lib/suppress";
import { verifyWebhook } from "../../lib/webhookSignature";

export const webhookRoutes = new Hono<AppContext>();

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
    reason?: string;
  };
}

webhookRoutes.post("/resend", async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. An unsigned endpoint that mutates contacts is worse than a
    // missing feature, and answering 503 tells Resend to retry once it is set.
    log.warn("webhook.no_secret");
    return c.json({ error: "not_configured" }, 503);
  }

  const body = await c.req.text();
  const verdict = await verifyWebhook(
    {
      id: c.req.header("svix-id"),
      timestamp: c.req.header("svix-timestamp"),
      signature: c.req.header("svix-signature"),
    },
    body,
    secret,
  );
  if (!verdict.ok) {
    log.warn("webhook.rejected", { reason: verdict.reason });
    return c.json({ error: "invalid_signature" }, 401);
  }

  const eventId = c.req.header("svix-id")!;
  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return c.json({ ok: true, ignored: "unparseable" });
  }

  // Idempotency: providers retry, and processing a complaint twice would write
  // a second suppression row and a second line in someone's history.
  const seen = await first<{ id: string }>(
    c.env.DB,
    `SELECT id FROM webhook_events WHERE id = ?`,
    eventId,
  );
  if (seen) return c.json({ ok: true, duplicate: true });
  await run(
    c.env.DB,
    `INSERT INTO webhook_events (id, provider, kind) VALUES (?, 'resend', ?)`,
    eventId,
    event.type ?? "unknown",
  );

  const result = classifyDeliveryEvent(
    event.type ?? "",
    event.data?.bounce?.type,
    event.data?.bounce?.message ?? event.data?.reason,
  );
  const providerId = event.data?.email_id ?? null;

  // Stamp the message row whatever else happens, so the email log tells the
  // truth even for events that change nothing about the contact.
  if (providerId) {
    await run(
      c.env.DB,
      `UPDATE email_log
         SET delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END,
             bounced_at   = CASE WHEN ? IS NOT NULL AND ? != 'delivered' THEN datetime('now') ELSE bounced_at END,
             bounce_kind  = COALESCE(?, bounce_kind),
             outcome_detail = COALESCE(?, outcome_detail)
       WHERE provider_id = ?`,
      result.contactStatus,
      result.bounceKind,
      result.contactStatus,
      result.bounceKind,
      event.data?.bounce?.message ?? event.data?.reason ?? null,
      providerId,
    );
  }

  // Which contact this concerns: by the message we sent, falling back to the
  // recipient address for events that arrive without a usable message id.
  const recipient = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to;
  const contact = providerId
    ? await first<{ contact_id: string | null }>(
        c.env.DB,
        `SELECT contact_id FROM email_log WHERE provider_id = ?`,
        providerId,
      )
    : null;
  let contactId = contact?.contact_id ?? null;
  if (!contactId && recipient) {
    const byEmail = await first<{ id: string }>(
      c.env.DB,
      `SELECT id FROM contacts WHERE email = ?`,
      recipient.toLowerCase(),
    );
    contactId = byEmail?.id ?? null;
  }
  if (!contactId) {
    log.info("webhook.unmatched", { type: event.type, providerId });
    return c.json({ ok: true, matched: false });
  }

  if (result.contactStatus) {
    await run(
      c.env.DB,
      `UPDATE contacts
         SET email_status = ?,
             email_failed_at = CASE WHEN ? THEN datetime('now') ELSE email_failed_at END,
             updated_at = datetime('now')
       WHERE id = ?`,
      result.contactStatus,
      result.stopEmailing ? 1 : 0,
      contactId,
    );
  }
  if (result.activity) {
    await logActivity(c.env.DB, {
      contactId,
      kind: result.suppress ? "suppressed" : "email_failed",
      channel: "email",
      summary: result.activity,
    });
  }
  // A complaint is a choice, so it gets the full permanent treatment. A bounce
  // never reaches here — see lib/deliverability.ts.
  if (result.suppress) {
    await suppressContact(c.env, {
      contactId,
      reason: "Marked our email as spam",
      source: "unsubscribe_link",
    });
  }

  log.info("webhook.handled", { type: event.type, contact: contactId });
  return c.json({ ok: true });
});
