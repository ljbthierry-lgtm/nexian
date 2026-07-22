import { describe, expect, it } from "vitest";
import { actionPage, emailShell, esc, textToHtml } from "../src/worker/lib/html";

describe("escaping", () => {
  it("neutralises markup in user-supplied values", () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes campaign text before turning newlines into markup", () => {
    const html = textToHtml("Hello <b>world</b>\nsecond line\n\nnew paragraph");
    expect(html).toContain("&lt;b&gt;world&lt;/b&gt;");
    expect(html).toContain("<br>");
    expect(html.match(/<p /g)).toHaveLength(2);
  });
});

describe("action pages", () => {
  it("renders a POST form when the action mutates, so link scanners cannot trigger it", () => {
    const html = actionPage({
      title: "t",
      heading: "h",
      body: "<p>b</p>",
      action: { label: "Confirm", method: "post" },
    });
    expect(html).toContain('<form method="post">');
    expect(html).not.toContain('<a class="btn" href');
  });

  it("renders a plain link when the action only navigates", () => {
    const html = actionPage({
      title: "t",
      heading: "h",
      body: "<p>b</p>",
      action: { label: "Go", href: "/join" },
    });
    expect(html).toContain('href="/join"');
  });

  it("escapes the heading", () => {
    expect(actionPage({ title: "t", heading: "<img src=x onerror=1>", body: "" })).toContain(
      "&lt;img",
    );
  });
});

describe("email shell", () => {
  it("uses an absolute logo URL, because mail clients strip inline image data", () => {
    const html = emailShell({
      body: "<p>hi</p>",
      companyName: "Nexian",
      baseUrl: "https://talent.example.com",
    });
    expect(html).toContain("https://talent.example.com/logo.png");
    expect(html).not.toContain("data:image");
  });

  it("includes an unsubscribe link when one is supplied", () => {
    const html = emailShell({
      body: "",
      companyName: "Nexian",
      baseUrl: "https://x.dev",
      unsubscribeUrl: "https://x.dev/a/tok",
    });
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("https://x.dev/a/tok");
  });

  it("omits the unsubscribe line for transactional mail that has none", () => {
    const html = emailShell({ body: "", companyName: "Nexian", baseUrl: "https://x.dev" });
    expect(html).not.toContain("Unsubscribe");
  });
});
