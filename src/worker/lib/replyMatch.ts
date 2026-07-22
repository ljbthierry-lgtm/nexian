/**
 * Deciding whether an incoming email is a real reply, and whose.
 *
 * The trap this module exists for: an out-of-office auto-responder looks
 * exactly like a reply. Treating one as an answer would silently cancel the
 * follow-up to somebody who never read the first email and is simply on
 * holiday — a lost prospect that nobody would ever notice, because the record
 * would say "they replied".
 *
 * So the rule is asymmetric. A message is only allowed to stop the sequence if
 * it looks like a human wrote it; anything carrying an automation marker is
 * recorded and ignored. Pure, so every header shape can be tested cheaply.
 */

/** Pull the bare address out of `Name <a@b.c>`, or return it lowercased. */
export function senderAddress(from: string | null | undefined): string | null {
  const raw = (from ?? "").trim();
  if (!raw) return null;
  const angled = /<([^>]+)>/.exec(raw);
  const candidate = (angled ? angled[1]! : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(candidate) ? candidate : null;
}

export interface IncomingHeaders {
  get(name: string): string | null;
}

/**
 * RFC 3834 and the de-facto headers every mail system adds to machine-generated
 * replies. Checked before the subject, because headers are far harder to get
 * wrong than free text in a dozen languages.
 */
export function isAutomatedReply(headers: IncomingHeaders, subject?: string | null): boolean {
  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;

  const precedence = (headers.get("precedence") ?? "").toLowerCase();
  if (["bulk", "auto_reply", "list", "junk"].includes(precedence)) return true;

  for (const name of ["x-autoreply", "x-autorespond", "x-auto-response-suppress"]) {
    if (headers.get(name)) return true;
  }
  // Microsoft and Google both set this on vacation replies.
  if ((headers.get("x-mailer") ?? "").toLowerCase().includes("autoreply")) return true;

  // Subject is the last resort and covers the languages this pool actually
  // uses. A false positive here only costs one follow-up; a false negative
  // silently ends someone's sequence, so the list leans inclusive.
  const s = (subject ?? "").toLowerCase();
  return /^(automatic reply|auto[- ]?reply|out of (the )?office|afwezig|automatisch antwoord|absence|réponse automatique|abwesenheit)/.test(
    s.trim(),
  );
}

export type ReplyDecision =
  | { kind: "human"; address: string }
  | { kind: "automated"; address: string | null }
  | { kind: "unusable" };

export function classifyIncoming(
  from: string | null | undefined,
  headers: IncomingHeaders,
  subject?: string | null,
): ReplyDecision {
  const address = senderAddress(from);
  if (isAutomatedReply(headers, subject)) return { kind: "automated", address };
  if (!address) return { kind: "unusable" };
  return { kind: "human", address };
}
