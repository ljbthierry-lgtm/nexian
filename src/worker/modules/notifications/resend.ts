/**
 * Resend REST client (plain fetch — no SDK dependency).
 *
 * Every send is written to email_log, success or failure. A failed email never
 * throws into the calling flow: a registration must not fail because the mail
 * provider hiccuped.
 */
import type { Env } from "../../env";
import { uid } from "../../lib/db";
import { log } from "../../lib/log";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  /** Template name, for the log and for support questions later. */
  template: string;
  contactId?: string | null;
  campaignId?: string | null;
  replyTo?: string;
}

export async function sendEmail(env: Env, mail: OutgoingEmail): Promise<boolean> {
  let ok = false;
  let providerId: string | null = null;
  let error: string | null = null;

  if (!env.RESEND_API_KEY && env.APP_ENV === "development") {
    // Local dev without a key: pretend success so flows can be exercised end to
    // end without any chance of mailing a real person.
    ok = true;
    providerId = "dev-noop";
    log.info("email.dev_noop", { to: mail.to, template: mail.template, subject: mail.subject });
  } else if (!env.RESEND_API_KEY) {
    error = "RESEND_API_KEY not configured";
    log.warn("email.skipped_no_key", { to: mail.to, template: mail.template });
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          ...(mail.replyTo ? { reply_to: [mail.replyTo] } : {}),
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { id?: string };
        providerId = body.id ?? null;
        ok = true;
      } else {
        error = `Resend ${res.status}: ${(await res.text()).slice(0, 500)}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO email_log (id, to_email, template, subject, contact_id, campaign_id, status, provider_id, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        uid(),
        mail.to,
        mail.template,
        mail.subject,
        mail.contactId ?? null,
        mail.campaignId ?? null,
        ok ? "sent" : "failed",
        providerId,
        error,
      )
      .run();
  } catch (e) {
    log.error("email.log_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  if (!ok) log.warn("email.failed", { to: mail.to, template: mail.template, error });
  return ok;
}
