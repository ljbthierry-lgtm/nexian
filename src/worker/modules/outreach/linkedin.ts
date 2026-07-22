/**
 * LinkedIn messages are composed here and sent by a human.
 *
 * LinkedIn has no API for messaging people, and automating its UI breaks their
 * terms and puts the sender's own account at risk. So the app does the part it
 * can do well — writing a personalised message and remembering who got one —
 * and leaves the send button to the recruiter.
 */

export interface LinkedInMessageInput {
  firstName: string;
  companyName: string;
  senderName: string;
  registerUrl: string;
  /** Optional hook, e.g. "procurement in pharma", to make the opener specific. */
  focus?: string;
}

/** LinkedIn connection notes are capped at 300 characters. */
export const CONNECTION_NOTE_LIMIT = 300;

export function connectionNote(input: LinkedInMessageInput): string {
  const name = input.firstName.trim();
  const hello = name ? `Hi ${name}` : "Hello";
  const note = `${hello} — I'm ${input.senderName} at ${input.companyName}. We place experienced freelancers on client missions and are building our pool. Happy to connect.`;
  return note.length <= CONNECTION_NOTE_LIMIT
    ? note
    : `${note.slice(0, CONNECTION_NOTE_LIMIT - 1)}…`;
}

export function directMessage(input: LinkedInMessageInput): string {
  const name = input.firstName.trim();
  const hello = name ? `Hi ${name},` : "Hello,";
  const focus = input.focus?.trim()
    ? ` Your background in ${input.focus.trim()} is the kind of profile our clients ask for.`
    : "";
  return `${hello}

I'm ${input.senderName} from ${input.companyName}. We're a consulting firm and we regularly place experienced freelancers on client missions.${focus}

We're building a pool of freelancers we can call when something fits. If that's of interest, you can add yourself in about three minutes — experience, skills, day rate, availability and CV:

${input.registerUrl}

No account or password needed, and you can update or remove your details whenever you like. If it's not for you, no problem at all.

Best regards,
${input.senderName}`;
}
