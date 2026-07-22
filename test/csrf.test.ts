/**
 * The guard on `POST /a/:token`.
 *
 * Two failure modes matter here and they pull in opposite directions: letting a
 * hostile page drive the endpoint, and turning away a real freelancer clicking a
 * button in their email. Both are covered.
 */
import { describe, expect, it } from "vitest";
import { isCrossSiteRequest } from "../src/worker/lib/csrf";

const SITE = "https://talent.nexian.example/a/abc123";

describe("cross-site detection", () => {
  it("refuses a submission a browser labels cross-site", () => {
    expect(isCrossSiteRequest({ secFetchSite: "cross-site", requestUrl: SITE })).toBe(true);
  });

  it("allows the form on our own action page", () => {
    expect(isCrossSiteRequest({ secFetchSite: "same-origin", requestUrl: SITE })).toBe(false);
  });

  it("allows a sibling subdomain and a direct navigation", () => {
    expect(isCrossSiteRequest({ secFetchSite: "same-site", requestUrl: SITE })).toBe(false);
    expect(isCrossSiteRequest({ secFetchSite: "none", requestUrl: SITE })).toBe(false);
  });

  it("ignores the case a header arrives in", () => {
    expect(isCrossSiteRequest({ secFetchSite: "Cross-Site", requestUrl: SITE })).toBe(true);
    expect(isCrossSiteRequest({ secFetchSite: " SAME-ORIGIN ", requestUrl: SITE })).toBe(false);
  });

  describe("browsers too old to send Sec-Fetch-Site", () => {
    it("refuses an Origin from somewhere else", () => {
      expect(isCrossSiteRequest({ origin: "https://evil.example", requestUrl: SITE })).toBe(true);
    });

    it("accepts an Origin matching the host it was sent to", () => {
      expect(
        isCrossSiteRequest({ origin: "https://talent.nexian.example", requestUrl: SITE }),
      ).toBe(false);
    });

    it("treats a different port or scheme on the same host as cross-site", () => {
      expect(isCrossSiteRequest({ origin: "http://talent.nexian.example", requestUrl: SITE })).toBe(
        true,
      );
      expect(
        isCrossSiteRequest({ origin: "https://talent.nexian.example:8443", requestUrl: SITE }),
      ).toBe(true);
    });

    it("refuses an Origin no real browser would send", () => {
      expect(isCrossSiteRequest({ origin: "not a url", requestUrl: SITE })).toBe(true);
    });

    it("allows a request carrying neither header rather than break an old client", () => {
      expect(isCrossSiteRequest({ requestUrl: SITE })).toBe(false);
      expect(isCrossSiteRequest({ origin: "null", requestUrl: SITE })).toBe(false);
    });
  });

  it("prefers Sec-Fetch-Site over Origin when both are present", () => {
    // A page cannot set Sec-Fetch-Site, so it is the more trustworthy of the two.
    expect(
      isCrossSiteRequest({
        secFetchSite: "same-origin",
        origin: "https://evil.example",
        requestUrl: SITE,
      }),
    ).toBe(false);
  });
});
