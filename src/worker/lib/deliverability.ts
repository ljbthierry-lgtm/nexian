/**
 * What a delivery event means for the person behind the address.
 *
 * The distinction this module exists to hold:
 *
 *   - a HARD BOUNCE is a fact about a mailbox. The address does not work, so we
 *     stop emailing it — but it says nothing about what the person wants, and
 *     if they later register with a working address nothing should stand in
 *     their way. It never touches the suppression list.
 *   - a SPAM COMPLAINT is a decision by a person. It is the bluntest opt-out
 *     there is, and it gets the full permanent treatment: hashed suppression
 *     that survives deletion and blocks a re-import months later.
 *   - a SOFT BOUNCE is neither. A full mailbox or a greylisting server is
 *     temporary, and treating it as permanent would quietly delete reachable
 *     people from the list.
 *
 * Pure, so every branch can be tested without a provider or a database.
 */

/**
 * May we still email this address?
 *
 * One predicate, in both dialects, so the SQL that selects recipients and the
 * check that runs just before sending cannot disagree. Used over `contacts ct`.
 */
export const EMAILABLE_SQL = `ct.email IS NOT NULL AND ct.email_status NOT IN ('bounced', 'complained')`;

export function isEmailable(row: { email: string | null; email_status?: string | null }): boolean {
  if (!row.email) return false;
  return row.email_status !== "bounced" && row.email_status !== "complained";
}

export type DeliveryEvent =
  | "email.sent"
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.delivery_delayed"
  | (string & {});

export interface DeliveryVerdict {
  /** New value for contacts.email_status, or null to leave it alone. */
  contactStatus: "delivered" | "bounced" | "complained" | null;
  /** Stop sending to this address from now on. */
  stopEmailing: boolean;
  /** Add to the permanent, hashed do-not-contact list (a choice, not a failure). */
  suppress: boolean;
  /** Value for email_log.bounce_kind. */
  bounceKind: "permanent" | "transient" | "complaint" | null;
  /** One line for the activity trail, or null when the event is not worth one. */
  activity: string | null;
}

const NOTHING: DeliveryVerdict = {
  contactStatus: null,
  stopEmailing: false,
  suppress: false,
  bounceKind: null,
  activity: null,
};

/**
 * Providers disagree on spelling and casing, and Resend has changed the shape
 * before. Anything not positively recognised as permanent is treated as
 * transient: over-reacting to an ambiguous bounce silently shrinks the list,
 * which is the more expensive mistake and the harder one to notice.
 */
export function isPermanentBounce(bounceType: string | null | undefined): boolean {
  return /permanent|hard/i.test(bounceType ?? "");
}

export function classifyDeliveryEvent(
  type: DeliveryEvent,
  bounceType?: string | null,
  message?: string | null,
): DeliveryVerdict {
  switch (type) {
    case "email.delivered":
      return { ...NOTHING, contactStatus: "delivered" };

    case "email.bounced": {
      const permanent = isPermanentBounce(bounceType);
      return {
        contactStatus: permanent ? "bounced" : null,
        stopEmailing: permanent,
        // Never: a dead mailbox is not consent, and suppression is forever.
        suppress: false,
        bounceKind: permanent ? "permanent" : "transient",
        activity: permanent
          ? `Email address rejected permanently${message ? ` — ${message}` : ""}. No further email will be sent to it.`
          : `Temporary delivery problem${message ? ` — ${message}` : ""}. Will try again.`,
      };
    }

    case "email.complained":
      return {
        contactStatus: "complained",
        stopEmailing: true,
        suppress: true,
        bounceKind: "complaint",
        activity: "Marked our email as spam — added to the permanent do-not-contact list.",
      };

    case "email.delivery_delayed":
      return { ...NOTHING, bounceKind: "transient" };

    default:
      // Opens and clicks are deliberately ignored: tracking who opened what is
      // extra personal data with no use in this application.
      return NOTHING;
  }
}
