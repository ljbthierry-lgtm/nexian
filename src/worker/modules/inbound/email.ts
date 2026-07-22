/**
 * Incoming email, for automatic reply detection.
 *
 * ⚠ DORMANT UNTIL A DOMAIN EXISTS. This is a Cloudflare Email Worker handler:
 * it only ever runs if Email Routing is configured on a real zone to deliver to
 * this Worker. On a *.workers.dev deployment nothing calls it, and that is
 * fine — wiring it now means the domain migration is a Cloudflare setting
 * rather than a code change.
 *
 * To activate, once the Nexian domain is on Cloudflare:
 *   1. Email → Email Routing → enable for the zone
 *   2. add a custom address (e.g. talent@…) with action "Send to a Worker"
 *      pointing at nexian-talent-pool
 *   3. set EMAIL_FROM to that address so replies actually land here
 *
 * What it does NOT do: read the message body. Knowing that somebody answered is
 * enough to stop the sequence; storing what they wrote would put unsolicited
 * personal correspondence in the database for no operational gain.
 */
import type { Env } from "../../env";
import { logActivity } from "../../lib/activity";
import { first, run } from "../../lib/db";
import { log } from "../../lib/log";
import { classifyIncoming } from "../../lib/replyMatch";

interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  setReject(reason: string): void;
  forward(rcptTo: string): Promise<void>;
}

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const subject = message.headers.get("subject");
  const decision = classifyIncoming(message.from, message.headers, subject);

  if (decision.kind === "unusable") {
    log.info("inbound.unusable", { to: message.to });
    return;
  }

  const address = decision.address;
  const contact = address
    ? await first<{ id: string; replied_at: string | null }>(
        env.DB,
        `SELECT id, replied_at FROM contacts WHERE email = ? AND anonymized_at IS NULL`,
        address,
      )
    : null;

  if (!contact) {
    // Someone emailing us who is not in the pool: not an error, just not ours.
    log.info("inbound.unmatched", { automated: decision.kind === "automated" });
    return;
  }

  if (decision.kind === "automated") {
    // Recorded so a recruiter sees "they are away" rather than silence, but the
    // sequence continues: an auto-responder is not an answer.
    await logActivity(env.DB, {
      contactId: contact.id,
      kind: "note",
      channel: "email",
      summary: `Automatic reply received${subject ? ` (${subject.slice(0, 80)})` : ""} — the sequence continues`,
    });
    return;
  }

  if (contact.replied_at) return; // already known to have answered

  await run(
    env.DB,
    `UPDATE contacts SET replied_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    contact.id,
  );
  await logActivity(env.DB, {
    contactId: contact.id,
    kind: "note",
    channel: "email",
    summary: "Replied to our email — no further invitations will be sent",
    detail: subject ? subject.slice(0, 200) : null,
  });
  log.info("inbound.reply", { contact: contact.id });
}
