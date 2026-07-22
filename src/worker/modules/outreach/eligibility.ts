/**
 * Who may be contacted, and with what.
 *
 * Cold outreach here rests on legitimate interest, which is only defensible if
 * it stays small and stops on its own: a maximum number of touches, a waiting
 * period between them, and a hard stop the moment someone opts out or registers.
 * That is all decided here, as pure logic, so it can be tested exhaustively and
 * cannot drift between the manual "Send invite" button and the nightly cron.
 */

export interface OutreachCandidate {
  suppressed: boolean;
  anonymized: boolean;
  /** Registered freelancers are never cold-contacted again. */
  hasProfile: boolean;
  outreachCount: number;
  lastOutreachAt: string | null;
  /** Set once they answer, however the answer reached us. */
  replied?: boolean;
  /** The address bounced permanently or the person pressed "spam". */
  emailUndeliverable?: boolean;
}

export interface OutreachPolicy {
  maxTouches: number;
  followUpAfterDays: number;
}

export type OutreachKind = "invite" | "followup";

export type OutreachDecision =
  { allowed: true; kind: OutreachKind } | { allowed: false; reason: string };

export function decideOutreach(
  candidate: OutreachCandidate,
  policy: OutreachPolicy,
  now = new Date(),
): OutreachDecision {
  if (candidate.suppressed) return { allowed: false, reason: "Marked do-not-contact" };
  if (candidate.anonymized) return { allowed: false, reason: "Record has been anonymised" };
  if (candidate.hasProfile) return { allowed: false, reason: "Already registered in the pool" };
  // Someone who answered has been served by the sequence, whatever they said.
  // Chasing a person who already replied is the rudest thing this app could do.
  if (candidate.replied) return { allowed: false, reason: "They have already replied" };
  if (candidate.emailUndeliverable) {
    return { allowed: false, reason: "Email address is undeliverable" };
  }
  if (candidate.outreachCount >= policy.maxTouches) {
    return {
      allowed: false,
      reason: `Already contacted ${candidate.outreachCount}× — limit reached`,
    };
  }
  if (candidate.outreachCount === 0) return { allowed: true, kind: "invite" };

  if (!candidate.lastOutreachAt) return { allowed: true, kind: "followup" };
  const last = Date.parse(candidate.lastOutreachAt);
  if (Number.isNaN(last)) return { allowed: true, kind: "followup" };
  const daysSince = (now.getTime() - last) / 86400000;
  if (daysSince < policy.followUpAfterDays) {
    const wait = Math.ceil(policy.followUpAfterDays - daysSince);
    return { allowed: false, reason: `Follow-up is due in ${wait} day${wait === 1 ? "" : "s"}` };
  }
  return { allowed: true, kind: "followup" };
}
