/**
 * Whether a personalised invitation (`join_prefill`) token may bind a public
 * registration to the contact it was minted for.
 *
 * The token travels in an email and inside a LinkedIn message, so possession is
 * not proof of identity. Two rules keep a leaked link from doing harm:
 *
 *   1. It never overrides the anti-takeover guard: if what the submitter typed
 *      already belongs to a DIFFERENT record, the token is ignored.
 *   2. It never lets a link rewrite an established address: a token binds only
 *      when the invited contact has no email yet (the normal LinkedIn-only case,
 *      where the person is supplying their address for the first time) or the
 *      submitted email is that same address. So the worst a leaked link plus a
 *      stranger's own new email can reach is a brand-new, separate record — never
 *      the invited person's email, suppression state, or profile.
 *
 * Pure logic, so the rule is tested directly rather than inferred from the route.
 */
export interface PrefillBindInput {
  /** Id of the record the submitted email / LinkedIn already matches, if any. */
  existingId: string | null;
  /** Contact the token was minted for. */
  tokenContactId: string;
  /** That contact's on-file email, lower-cased, or null if none yet. */
  tokenContactEmail: string | null;
  /** The email the caller submitted, lower-cased. */
  submittedEmail: string;
}

export function canAdoptPrefill(input: PrefillBindInput): boolean {
  if (input.existingId && input.existingId !== input.tokenContactId) return false;
  if (input.tokenContactEmail && input.tokenContactEmail !== input.submittedEmail) return false;
  return true;
}
