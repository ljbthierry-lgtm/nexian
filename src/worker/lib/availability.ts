/**
 * How availability is described in words.
 *
 * This lived in two places — the reminder email and the page its button leads to
 * — and the two disagreed. A profile with no date could produce an email saying
 * "your availability is not set" and a confirmation page saying "we have you as
 * available", with a green button reading "Yes, still correct". The freelancer
 * would then be confirming a statement the app never made.
 *
 * One vocabulary, two voices: `availabilityPhrase` for third person ("available
 * now") and `availabilitySentence` for second person ("you are available now").
 */

export interface AvailabilityLike {
  availability: string;
  available_from?: string | null;
}

export function availabilityPhrase(profile: AvailabilityLike | null | undefined): string {
  if (!profile) return "not set";
  switch (profile.availability) {
    case "now":
      return "available now";
    case "not_available":
      return "not available at the moment";
    case "from_date":
      return profile.available_from ? `available from ${profile.available_from}` : "not set";
    default:
      return "not set";
  }
}

export function availabilitySentence(profile: AvailabilityLike | null | undefined): string {
  const phrase = availabilityPhrase(profile);
  return phrase === "not set" ? "your availability is not set" : `you are ${phrase}`;
}
