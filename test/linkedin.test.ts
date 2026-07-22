import { describe, expect, it } from "vitest";
import {
  CONNECTION_NOTE_LIMIT,
  connectionNote,
  directMessage,
} from "../src/worker/modules/outreach/linkedin";

const INPUT = {
  firstName: "Jane",
  companyName: "Nexian",
  senderName: "Laurent Thierry",
  registerUrl: "https://talent.nexian.be/join",
};

describe("LinkedIn message composition", () => {
  it("keeps the connection note inside LinkedIn's character limit", () => {
    expect(connectionNote(INPUT).length).toBeLessThanOrEqual(CONNECTION_NOTE_LIMIT);
  });

  it("stays inside the limit even with a very long sender and company name", () => {
    const note = connectionNote({
      ...INPUT,
      firstName: "Jean-Christophe",
      companyName: "A Very Long Consulting Company Name International",
      senderName: "Someone With An Extremely Long Name Indeed",
    });
    expect(note.length).toBeLessThanOrEqual(CONNECTION_NOTE_LIMIT);
  });

  it("greets politely when no first name is known", () => {
    expect(connectionNote({ ...INPUT, firstName: "" })).toMatch(/^Hello/);
    expect(directMessage({ ...INPUT, firstName: "   " })).toMatch(/^Hello,/);
  });

  it("puts the registration link in the message", () => {
    expect(directMessage(INPUT)).toContain(INPUT.registerUrl);
  });

  it("weaves in a focus when one is given, and omits it otherwise", () => {
    expect(directMessage({ ...INPUT, focus: "procurement in pharma" })).toContain(
      "procurement in pharma",
    );
    expect(directMessage({ ...INPUT, focus: "  " })).not.toContain("background in");
  });

  it("offers an easy way out, which is what keeps cold outreach acceptable", () => {
    expect(directMessage(INPUT)).toContain("not for you");
  });
});
