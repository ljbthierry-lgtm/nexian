/**
 * Cross-site request detection for the email action links.
 *
 * `POST /a/:token` needs no cookie to succeed — the token in the URL is the
 * whole credential — and one of its outcomes is *setting* a portal session
 * cookie. That combination is what makes it worth guarding: a page on another
 * origin could auto-submit a form carrying the attacker's own link, quietly
 * signing a visiting freelancer into the attacker's profile. Anything the
 * visitor then typed — day rate, availability, CV — would land in a record the
 * attacker can read. SameSite=Lax does not help, because the cookie is being
 * issued rather than sent.
 *
 * The check is deliberately conservative in the other direction: a legitimate
 * click must never be turned away, so anything ambiguous is allowed. Only a
 * request the browser positively labels as cross-site, or one carrying an Origin
 * that disagrees with the host it was sent to, is refused.
 */

export interface OriginCheckInput {
  /** `Sec-Fetch-Site` — set by every current browser, and not forgeable by a page. */
  secFetchSite?: string | null;
  /** `Origin` — the fallback for browsers too old to send the header above. */
  origin?: string | null;
  /** The URL the request arrived at. */
  requestUrl: string;
}

export function isCrossSiteRequest(input: OriginCheckInput): boolean {
  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) {
    // `none` is a direct navigation (typed, bookmarked, opened from a mail
    // client); `same-site` covers a sibling subdomain. Neither is an attack.
    return site === "cross-site";
  }

  const origin = input.origin?.trim();
  // No Origin at all: an old browser on a same-origin form post, or a non-browser
  // client. Nothing to compare, so nothing to refuse.
  if (!origin || origin === "null") return false;

  try {
    return new URL(origin).origin !== new URL(input.requestUrl).origin;
  } catch {
    // An unparseable Origin is not something a real browser sends.
    return true;
  }
}
