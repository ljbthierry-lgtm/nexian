/**
 * The webhook signature check.
 *
 * This is the whole security of a public endpoint that can mark an address dead
 * and permanently suppress a person. Every way of getting in without a valid
 * signature gets its own test, because each one is a way for a stranger to
 * delete our ability to contact whoever they name.
 */
import { describe, expect, it } from "vitest";
import {
  REPLAY_TOLERANCE_SECONDS,
  computeSignature,
  decodeSecret,
  signedPayload,
  verifyWebhook,
} from "../src/worker/lib/webhookSignature";

const SECRET = `whsec_${btoa("a-shared-secret-of-some-length")}`;
const NOW = 1_780_000_000;
const BODY = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });

async function sign(body: string, id = "msg_1", ts = String(NOW), secret = SECRET) {
  const bytes = decodeSecret(secret)!;
  const sig = await computeSignature(bytes, signedPayload(id, ts, body));
  return { id, timestamp: ts, signature: `v1,${sig}` };
}

describe("a genuine call is accepted", () => {
  it("accepts a correctly signed request", async () => {
    const headers = await sign(BODY);
    expect(await verifyWebhook(headers, BODY, SECRET, NOW)).toEqual({ ok: true });
  });

  it("accepts when the header carries several signatures (key rotation)", async () => {
    const { signature } = await sign(BODY);
    const headers = { id: "msg_1", timestamp: String(NOW), signature: `v1,otherkey ${signature}` };
    expect(await verifyWebhook(headers, BODY, SECRET, NOW)).toEqual({ ok: true });
  });

  it("accepts a secret given without the whsec_ prefix", async () => {
    const bare = SECRET.slice(6);
    const headers = await sign(BODY, "msg_1", String(NOW), bare);
    expect(await verifyWebhook(headers, BODY, bare, NOW)).toEqual({ ok: true });
  });
});

describe("forgery is refused", () => {
  it("refuses a body changed after signing", async () => {
    const headers = await sign(BODY);
    const tampered = JSON.stringify({ type: "email.complained", data: { email_id: "abc" } });
    expect(await verifyWebhook(headers, tampered, SECRET, NOW)).toMatchObject({
      reason: "no_match",
    });
  });

  it("refuses a signature made with a different secret", async () => {
    const headers = await sign(BODY, "msg_1", String(NOW), `whsec_${btoa("the-wrong-secret-xx")}`);
    expect(await verifyWebhook(headers, BODY, SECRET, NOW)).toMatchObject({ reason: "no_match" });
  });

  it("refuses when the id or timestamp is swapped (they are part of the signature)", async () => {
    const headers = await sign(BODY);
    expect(await verifyWebhook({ ...headers, id: "msg_2" }, BODY, SECRET, NOW)).toMatchObject({
      reason: "no_match",
    });
  });

  it("refuses an unsigned request", async () => {
    expect(
      await verifyWebhook({ id: null, timestamp: null, signature: null }, BODY, SECRET, NOW),
    ).toMatchObject({ reason: "missing_headers" });
  });

  it("refuses an unknown signature version", async () => {
    const { signature } = await sign(BODY);
    const headers = {
      id: "msg_1",
      timestamp: String(NOW),
      signature: signature.replace("v1,", "v9,"),
    };
    expect(await verifyWebhook(headers, BODY, SECRET, NOW)).toMatchObject({ reason: "no_match" });
  });
});

describe("replay is refused", () => {
  it("refuses a capture replayed after the tolerance window", async () => {
    const headers = await sign(BODY);
    const later = NOW + REPLAY_TOLERANCE_SECONDS + 1;
    expect(await verifyWebhook(headers, BODY, SECRET, later)).toMatchObject({ reason: "stale" });
  });

  it("refuses a timestamp forged into the future", async () => {
    const future = String(NOW + 86_400);
    const headers = await sign(BODY, "msg_1", future);
    expect(await verifyWebhook(headers, BODY, SECRET, NOW)).toMatchObject({ reason: "stale" });
  });

  it("still accepts inside the window (clock skew is normal)", async () => {
    const headers = await sign(BODY);
    expect(await verifyWebhook(headers, BODY, SECRET, NOW + 60)).toEqual({ ok: true });
    expect(await verifyWebhook(headers, BODY, SECRET, NOW - 60)).toEqual({ ok: true });
  });

  it("refuses a non-numeric timestamp", async () => {
    const headers = await sign(BODY);
    expect(
      await verifyWebhook({ ...headers, timestamp: "yesterday" }, BODY, SECRET, NOW),
    ).toMatchObject({ reason: "bad_timestamp" });
  });
});

describe("a broken secret fails closed", () => {
  it("reports a bad secret rather than accepting", async () => {
    const headers = await sign(BODY);
    expect(await verifyWebhook(headers, BODY, "whsec_!!!not base64!!!", NOW)).toMatchObject({
      ok: false,
    });
  });

  it("treats an empty secret as unusable", () => {
    expect(decodeSecret("whsec_")).toBeNull();
  });
});
