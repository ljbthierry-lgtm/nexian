/**
 * Channel priority routes a dual-channel prospect to one channel, with the other
 * as a fallback. The SQL fragments and pickChannel must agree, so both are here.
 */
import { describe, expect, it } from "vitest";
import {
  emailChannelSql,
  linkedinChannelSql,
  pickChannel,
} from "../src/worker/modules/outreach/channel";

describe("pickChannel", () => {
  it("prefers email, using LinkedIn only when the address is unusable", () => {
    expect(pickChannel({ emailable: true, hasLinkedin: true }, "email")).toBe("email");
    expect(pickChannel({ emailable: true, hasLinkedin: false }, "email")).toBe("email");
    expect(pickChannel({ emailable: false, hasLinkedin: true }, "email")).toBe("linkedin");
    expect(pickChannel({ emailable: false, hasLinkedin: false }, "email")).toBe("none");
  });

  it("prefers LinkedIn, using email only when there is no profile", () => {
    expect(pickChannel({ emailable: true, hasLinkedin: true }, "linkedin")).toBe("linkedin");
    expect(pickChannel({ emailable: false, hasLinkedin: true }, "linkedin")).toBe("linkedin");
    expect(pickChannel({ emailable: true, hasLinkedin: false }, "linkedin")).toBe("email");
    expect(pickChannel({ emailable: false, hasLinkedin: false }, "linkedin")).toBe("none");
  });
});

describe("channel SQL fragments", () => {
  it("email wave drops people with a LinkedIn profile only when LinkedIn is preferred", () => {
    expect(emailChannelSql("email")).toBe("");
    expect(emailChannelSql("linkedin")).toContain("ct.linkedin_url IS NULL");
  });

  it("LinkedIn queue keeps only the un-emailable when email is preferred", () => {
    expect(linkedinChannelSql("linkedin")).toBe("");
    expect(linkedinChannelSql("email")).toContain("ct.email_status IN ('bounced', 'complained')");
  });
});
