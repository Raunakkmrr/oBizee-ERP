import { beforeEach, describe, expect, it } from "vitest";

import { accessTokenIsStale, endSession, startSession } from "./session";

/**
 * A token expiring at `seconds` from now, in the shape the API issues.
 *
 * Unsigned: nothing here verifies a signature, and nothing should — the claim
 * is read to decide *when to refresh*, and the server remains the only
 * authority on whether a token is any good.
 */
function tokenExpiringIn(seconds: number): string {
  const payload = { sub: "u1", exp: Math.floor(Date.now() / 1000) + seconds };
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.signature`;
}

describe("knowing when to refresh", () => {
  beforeEach(() => endSession());

  it("is not stale with plenty of life left", () => {
    startSession({ accessToken: tokenExpiringIn(15 * 60) });
    expect(accessTokenIsStale()).toBe(false);
  });

  it("is stale inside the margin, so the refresh happens before the refusal", () => {
    // Thirty seconds left is a token that will be rejected by the time the
    // request lands. That round trip is the one being removed.
    startSession({ accessToken: tokenExpiringIn(30) });
    expect(accessTokenIsStale()).toBe(true);
  });

  it("is stale once expired", () => {
    startSession({ accessToken: tokenExpiringIn(-10) });
    expect(accessTokenIsStale()).toBe(true);
  });

  it("says no when there is no session at all", () => {
    // Never true without a token: a signed-out visitor must not trigger a
    // refresh on every read.
    expect(accessTokenIsStale()).toBe(false);
  });

  it("says no for a token it cannot read, falling back to 401-and-retry", () => {
    /*
      An unreadable token is not an emergency. Refusing to guess means the old
      reactive path handles it — which is the behaviour that worked before this
      existed, so the failure mode is "no improvement", never "no session".
    */
    startSession({ accessToken: "not-a-jwt" });
    expect(accessTokenIsStale()).toBe(false);
  });

  it("honours a caller's own margin", () => {
    startSession({ accessToken: tokenExpiringIn(120) });
    expect(accessTokenIsStale(60_000)).toBe(false);
    expect(accessTokenIsStale(180_000)).toBe(true);
  });
});
