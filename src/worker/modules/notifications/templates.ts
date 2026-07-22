/**
 * Email copy.
 *
 * Cold outreach carries two things GDPR requires and that are easy to forget:
 * where we got the person's details, and a working way out in one click. Both
 * are built into the template rather than left to whoever writes the campaign.
 */
import { emailButton, emailShell, esc, textToHtml } from "../../lib/html";

export interface TemplateContext {
  companyName: string;
  baseUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const SOURCE_SENTENCE: Record<string, string> = {
  linkedin: "We found your profile on LinkedIn.",
  referral: "You were recommended to us by someone in our network.",
  event: "We met, or were introduced, at a professional event.",
  import: "Your details reached us through our professional network.",
  manual: "Your details reached us through our professional network.",
  self_signup: "You asked us to get in touch.",
};

function greeting(firstName: string): string {
  const name = firstName.trim();
  return name ? `Hi ${esc(name)},` : "Hello,";
}

/** First contact. One purpose only: explain who we are and invite registration. */
export function inviteEmail(
  ctx: TemplateContext,
  o: {
    firstName: string;
    source: string;
    registerUrl: string;
    optOutUrl: string;
    senderName: string;
  },
): RenderedEmail {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>I'm ${esc(o.senderName)} from ${esc(ctx.companyName)}. We're a consulting firm, and we
       regularly place experienced freelancers on client missions.</p>
    <p>We're building a pool of freelancers we can call on when a mission fits. If that could
       interest you, you can add yourself in about three minutes — your experience, skills,
       day rate, availability and CV. No account or password needed, and you stay in control
       of what we hold.</p>
    <p>${emailButton(o.registerUrl, "Add me to the pool")}</p>
    <p style="font-size:13px;color:#8a8194">
      ${esc(SOURCE_SENTENCE[o.source] ?? SOURCE_SENTENCE.manual)}
      We contact you on the basis of legitimate interest for professional purposes, and we will
      not add you to any mailing list unless you ask us to.
      <a href="${esc(o.optOutUrl)}" style="color:#8a8194">Don't contact me again</a>.
    </p>`;
  return {
    subject: `${ctx.companyName} — freelance missions, if you're interested`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/** The single permitted follow-up. After this the sequence stops for good. */
export function followUpEmail(
  ctx: TemplateContext,
  o: { firstName: string; registerUrl: string; optOutUrl: string; senderName: string },
): RenderedEmail {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>A short follow-up to my earlier message. If joining the ${esc(ctx.companyName)} freelance
       pool is of interest, the form takes about three minutes.</p>
    <p>${emailButton(o.registerUrl, "Add me to the pool")}</p>
    <p>If it isn't, no problem at all — this is the last you'll hear from me.</p>
    <p style="font-size:13px;color:#8a8194">
      <a href="${esc(o.optOutUrl)}" style="color:#8a8194">Don't contact me again</a>.
    </p>`;
  return {
    subject: `Following up — ${ctx.companyName} freelance pool`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/** Sent the moment someone registers: confirms what we stored and how to change it. */
export function welcomeEmail(
  ctx: TemplateContext,
  o: { firstName: string; portalUrl: string; consentSummary: string[] },
): RenderedEmail {
  const list = o.consentSummary.length
    ? `<ul style="margin:0 0 14px;padding-left:20px;color:#5c5566">
         ${o.consentSummary.map((s) => `<li>${esc(s)}</li>`).join("")}
       </ul>`
    : "";
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Thanks — you're in the ${esc(ctx.companyName)} freelance pool. When a mission matches your
       profile, we'll get in touch.</p>
    <p>What you agreed to:</p>
    ${list}
    <p>You can change any of it, update your day rate and availability, replace your CV, or delete
       your profile entirely, at any time:</p>
    <p>${emailButton(o.portalUrl, "Open my profile")}</p>
    <p style="font-size:13px;color:#8a8194">This link is personal and valid for 7 days. You can
       always request a new one from the registration page.</p>`;
  return {
    subject: `You're in the ${ctx.companyName} freelance pool`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/** The "email me my update link" flow. */
export function portalLinkEmail(
  ctx: TemplateContext,
  o: { firstName: string; portalUrl: string },
): RenderedEmail {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Here's your personal link to update your ${esc(ctx.companyName)} profile — your day rate,
       availability, skills and CV.</p>
    <p>${emailButton(o.portalUrl, "Open my profile")}</p>
    <p style="font-size:13px;color:#8a8194">The link works once and expires in 7 days. If you
       didn't ask for it, you can ignore this email.</p>`;
  return {
    subject: `Your ${ctx.companyName} profile link`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/** The quarterly nudge. One click confirms; nothing else is required. */
export function availabilityReminderEmail(
  ctx: TemplateContext,
  o: {
    firstName: string;
    availabilityLine: string;
    confirmUrl: string;
    portalUrl: string;
    unsubscribeUrl: string;
  },
): RenderedEmail {
  const body = `
    <p>${greeting(o.firstName)}</p>
    <p>Your profile in our freelance pool says ${esc(o.availabilityLine)}. Missions come in
       regularly, and an up-to-date profile is the first one we look at.</p>
    <p>${emailButton(o.confirmUrl, "Still correct — keep me as is", "#2e7d4f")}</p>
    <p style="font-size:14px"><a href="${esc(o.portalUrl)}" style="color:#85509b">Something
       changed — update my profile</a></p>`;
  return {
    subject: "Is your availability still up to date?",
    html: emailShell({
      body,
      companyName: ctx.companyName,
      baseUrl: ctx.baseUrl,
      unsubscribeUrl: o.unsubscribeUrl,
    }),
  };
}

/** A campaign written in the back office, wrapped in the branded shell. */
export function campaignEmail(
  ctx: TemplateContext,
  o: {
    firstName: string;
    subject: string;
    body: string;
    portalUrl: string;
    unsubscribeUrl: string;
  },
): RenderedEmail {
  const personalised = o.body.replace(/\{first_name\}/g, o.firstName.trim() || "there");
  const body = `
    ${textToHtml(personalised)}
    <p style="font-size:13px;color:#8a8194;margin-top:18px">
      <a href="${esc(o.portalUrl)}" style="color:#85509b">Update your profile or availability</a>
    </p>`;
  return {
    subject: o.subject,
    html: emailShell({
      body,
      companyName: ctx.companyName,
      baseUrl: ctx.baseUrl,
      unsubscribeUrl: o.unsubscribeUrl,
    }),
  };
}

/**
 * The staff sign-in code.
 *
 * No link and no button anywhere in this email. A second factor that can be
 * completed by clicking is one a phishing page can relay for you; making the
 * recipient carry six digits back to a window they opened themselves is the
 * whole point. It also tells them what to do if they were not signing in,
 * because an unexpected code means somebody already has the password.
 */
export function signInCodeEmail(
  ctx: TemplateContext,
  o: { name: string; code: string; minutes: number },
): RenderedEmail {
  const body = `
    <p>${greeting(o.name)}</p>
    <p>Your sign-in code for the ${esc(ctx.companyName)} talent pool:</p>
    <p style="font-size:34px;font-weight:700;letter-spacing:.18em;margin:18px 0;
       font-family:Consolas,Menlo,monospace;color:#5A104C">${esc(o.code)}</p>
    <p>It expires in ${o.minutes} minutes and can be used once.</p>
    <p style="font-size:13px;color:#8a8194;margin-top:20px">
      If you were not signing in, someone else knows your password. Change it as soon
      as you can, and tell whoever administers the platform.</p>`;
  return {
    subject: `${o.code} is your ${ctx.companyName} sign-in code`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/**
 * A security alert to administrators.
 *
 * Deliberately plain and free of buttons: the recipient should go and look at
 * the access log themselves rather than act on a link in an email, which is the
 * exact habit that makes phishing work.
 */
export function alertEmail(
  ctx: TemplateContext,
  o: { summary: string; detail: string; severity: string; when: string },
): RenderedEmail {
  const body = `
    <p style="font-size:13px;color:#8a8194;margin:0 0 6px;text-transform:uppercase;
       letter-spacing:.08em">${esc(o.severity)}</p>
    <p style="font-size:17px;font-weight:700;margin:0 0 12px">${esc(o.summary)}</p>
    <p>${esc(o.detail)}</p>
    <p style="font-size:13px;color:#8a8194">Recorded ${esc(o.when)}. Open the talent pool and go to
       Settings → Access log to see the full record, including who else has downloaded what.</p>
    <p style="font-size:13px;color:#8a8194">If this was expected, no action is needed — the alert
       stays in the log either way.</p>`;
  return {
    subject: `${ctx.companyName} talent pool — ${o.summary}`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}

/** Staff invitation / password reset. */
export function setPasswordEmail(
  ctx: TemplateContext,
  o: { name: string; url: string },
): RenderedEmail {
  const body = `
    <p>${greeting(o.name)}</p>
    <p>An account was created for you on the ${esc(ctx.companyName)} talent pool.</p>
    <p>${emailButton(o.url, "Choose a password")}</p>
    <p style="font-size:13px;color:#8a8194">This link works once and expires in 14 days.</p>`;
  return {
    subject: `Your ${ctx.companyName} talent pool account`,
    html: emailShell({ body, companyName: ctx.companyName, baseUrl: ctx.baseUrl }),
  };
}
