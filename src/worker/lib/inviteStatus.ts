/**
 * The one answer to "where does this person stand in the invitation funnel?".
 *
 * Derived, never stored: every input is a fact the database already holds, so
 * the status cannot drift from reality or need backfilling. The Invitations
 * screen, the contact list and the wave engine all read this single function —
 * three screens disagreeing about who was invited would be worse than no
 * status at all.
 */

export interface InviteStatusInput {
  hasEmail: boolean;
  hasLinkedin: boolean;
  hasProfile: boolean;
  suppressed: boolean;
  anonymized: boolean;
  outreachCount: number;
  linkedinState: "none" | "queued" | "sent";
  /** They answered, however the answer reached us. */
  replied?: boolean;
  /** What they said, when we know. */
  replyOutcome?: "interested" | "not_now" | "not_interested" | null;
  /** Address bounced permanently, or they pressed "spam". */
  emailUndeliverable?: boolean;
}

export type InviteStatusKey =
  | "registered"
  | "declined"
  | "replied"
  | "undeliverable"
  | "invited_2"
  | "invited_1"
  | "queued_linkedin"
  | "not_invited"
  | "no_channel";

export interface InviteStatus {
  key: InviteStatusKey;
  label: string;
  /** Pill tone for the UI: good / warn / neutral / bad. */
  tone: "good" | "warn" | "neutral" | "bad";
}

export function deriveInviteStatus(input: InviteStatusInput): InviteStatus {
  // Outcomes first: once someone has registered or declined, how many touches
  // it took stops mattering.
  if (input.hasProfile) {
    return { key: "registered", label: "Registered", tone: "good" };
  }
  if (input.suppressed || input.anonymized) {
    return { key: "declined", label: "Declined / do not contact", tone: "bad" };
  }
  // An answer outranks the touch count: "invited twice, awaiting reply" would be
  // untrue and would invite a recruiter to chase somebody who already answered.
  if (input.replied) {
    const label =
      input.replyOutcome === "interested"
        ? "Replied — interested"
        : input.replyOutcome === "not_now"
          ? "Replied — not right now"
          : input.replyOutcome === "not_interested"
            ? "Replied — not interested"
            : "Replied";
    return {
      key: "replied",
      label,
      tone: input.replyOutcome === "interested" ? "good" : "neutral",
    };
  }
  // A dead address is not "awaiting reply" either — nothing ever arrived.
  if (input.emailUndeliverable && !input.hasLinkedin) {
    return { key: "undeliverable", label: "Email undeliverable", tone: "bad" };
  }
  if (input.outreachCount >= 2) {
    return { key: "invited_2", label: "Invited 2× — awaiting reply", tone: "warn" };
  }
  if (input.outreachCount === 1) {
    return { key: "invited_1", label: "Invited — awaiting reply", tone: "warn" };
  }
  if (input.linkedinState === "queued") {
    return { key: "queued_linkedin", label: "In the LinkedIn queue", tone: "neutral" };
  }
  if (!input.hasEmail && !input.hasLinkedin) {
    // Importing such a row is refused, but an old contact can end up here after
    // an edit. Saying "not invited yet" would hide that nobody CAN invite them.
    return { key: "no_channel", label: "No email or LinkedIn — unreachable", tone: "bad" };
  }
  return { key: "not_invited", label: "Not invited yet", tone: "neutral" };
}

/** Facts for the funnel cards, phrased as SQL fragments over `contacts ct`. */
export const INVITE_FUNNEL_SQL = {
  notInvited: `ct.suppressed = 0 AND ct.anonymized_at IS NULL AND ct.outreach_count = 0
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)`,
  awaitingReply: `ct.suppressed = 0 AND ct.anonymized_at IS NULL AND ct.outreach_count > 0
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)`,
  registered: `EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)`,
  declined: `ct.suppressed = 1
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.contact_id = ct.id)`,
} as const;
