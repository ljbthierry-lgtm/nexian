/**
 * Server-rendered pages for email action links, plus the shared HTML escaper and
 * the email shell.
 *
 * These pages are the only HTML the Worker itself produces: someone clicking a
 * button in an email must land on something branded and finished, without the
 * SPA having to boot.
 *
 * The logo is referenced by URL, never as a data: URI — Gmail and Outlook strip
 * inline image data, which would leave every email with a broken header.
 */

export const LOGO_PATH = "/logo.png";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ActionPageOptions {
  title: string;
  heading: string;
  /** Trusted HTML — callers build it from esc()'d values. */
  body: string;
  action?: { label: string; href?: string; method?: "post" };
  secondary?: { label: string; href: string };
  tone?: "normal" | "good" | "warn";
}

export function actionPage(o: ActionPageOptions): string {
  const tone = o.tone ?? "normal";
  const accent = tone === "good" ? "#2e7d4f" : tone === "warn" ? "#a8690f" : "#85509b";
  const button = o.action
    ? o.action.method === "post"
      ? `<form method="post"><button class="btn" type="submit">${esc(o.action.label)}</button></form>`
      : `<a class="btn" href="${esc(o.action.href ?? "/")}">${esc(o.action.label)}</a>`
    : "";
  const secondary = o.secondary
    ? `<p class="alt"><a href="${esc(o.secondary.href)}">${esc(o.secondary.label)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<link rel="icon" href="/favicon.png">
<style>
  :root{color-scheme:light}
  body{margin:0;background:#f4f2f6;color:#25202b;
    font:16px/1.55 "Segoe UI",system-ui,-apple-system,sans-serif;
    display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{background:#fff;border:1px solid #e4dfe9;border-radius:14px;max-width:520px;width:100%;
    padding:0 0 30px;overflow:hidden;box-shadow:0 10px 34px rgba(90,16,76,.10)}
  .brand{padding:22px 28px 0}
  .brand img{height:34px;display:block}
  .inner{padding:20px 28px 0}
  h1{font-size:22px;line-height:1.25;margin:0 0 12px;color:#25202b}
  p{margin:0 0 14px;color:#5c5566}
  .btn{display:inline-block;background:${accent};color:#fff;text-decoration:none;border:0;
    border-radius:8px;padding:13px 26px;font:inherit;font-weight:700;cursor:pointer;margin-top:6px}
  .btn:hover{filter:brightness(1.08)}
  .alt{margin-top:18px;font-size:14px}
  .alt a{color:#85509b}
  .foot{margin:24px 28px 0;padding-top:14px;border-top:1px solid #eee7ef;font-size:12.5px;color:#8a8194}
</style></head>
<body><div class="card">
  <div class="brand"><img src="${LOGO_PATH}" alt="Nexian"></div>
  <div class="inner">
    <h1>${esc(o.heading)}</h1>
    ${o.body}
    ${button}
    ${secondary}
  </div>
  <div class="foot">Nexian &middot; powered by Solvint Group</div>
</div></body></html>`;
}

/** Wrap notification or campaign content in the branded email shell. */
export function emailShell(opts: {
  body: string;
  companyName: string;
  baseUrl: string;
  unsubscribeUrl?: string;
}): string {
  const footerLinks = opts.unsubscribeUrl
    ? ` &middot; <a href="${esc(opts.unsubscribeUrl)}" style="color:#8a8194">Unsubscribe</a>`
    : "";

  return `<div style="margin:0;padding:24px 12px;background:#f4f2f6;
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#25202b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4dfe9;
    border-radius:12px;overflow:hidden">
    <div style="padding:22px 24px 0">
      <img src="${esc(opts.baseUrl)}${LOGO_PATH}" alt="${esc(opts.companyName)}"
        style="height:30px;display:block;border:0">
    </div>
    <div style="padding:20px 24px 4px;font-size:15px;line-height:1.6">${opts.body}</div>
    <div style="padding:14px 24px 20px;border-top:1px solid #eee7ef;font-size:12px;color:#8a8194">
      ${esc(opts.companyName)} &middot; powered by Solvint Group${footerLinks}
    </div>
  </div>
</div>`;
}

/** Primary call-to-action button inside an email body. */
export function emailButton(href: string, label: string, color = "#85509b"): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${color};color:#ffffff;
    text-decoration:none;border-radius:8px;padding:13px 26px;font-weight:700;margin:6px 0">${esc(label)}</a>`;
}

/** Turn the plain text a campaign author typed into safe HTML paragraphs. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px">${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
