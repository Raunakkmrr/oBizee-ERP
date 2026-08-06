import { beforeEach, describe, expect, it, vi } from "vitest";
import { breakerOpen, lookupPin, resetBreaker } from "./pin-lookup";

const OK = (offices: unknown[]) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([{ Status: "Success", PostOffice: offices }]),
  } as Response);

const office = (over: Record<string, string> = {}) => ({
  Name: "Lajpat Nagar",
  District: "South Delhi",
  State: "Delhi",
  ...over,
});

beforeEach(() => resetBreaker());

describe("lookupPin — the happy path", () => {
  it("fills city and state from the directory", async () => {
    const result = await lookupPin("110024", () => OK([office()]));
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.city).toBe("South Delhi");
      expect(result.stateName).toBe("Delhi");
      expect(result.stateCode).toBe("07");
      expect(result.via).toBe("postal_api");
    }
  });

  it("offers the PIN's localities, deduplicated", async () => {
    const result = await lookupPin("110024", () =>
      OK([office(), office({ Name: "Amar Colony" }), office()]),
    );
    if (result.kind === "found") {
      expect(result.localities).toEqual(["Lajpat Nagar", "Amar Colony"]);
    }
  });

  it("maps the directory's older state spellings to a GST code", async () => {
    // The directory writes "Orissa" and "Pondicherry" in places.
    const orissa = await lookupPin("751001", () =>
      OK([office({ State: "Orissa", District: "Khordha" })]),
    );
    expect(orissa.kind === "found" && orissa.stateCode).toBe("21");
  });

  it("keeps the city when the state cannot be coded", async () => {
    // A state we cannot code is not a failure — it is one the reader picks,
    // with the city already filled in.
    const result = await lookupPin("110024", () =>
      OK([office({ State: "Someplace" })]),
    );
    expect(result.kind === "found" && result.stateCode).toBeNull();
    expect(result.kind === "found" && result.city).toBe("South Delhi");
  });
});

describe("when the network is not there", () => {
  it("falls back to the offline prefix guess", async () => {
    const result = await lookupPin("110024", () => Promise.reject(new Error("offline")));
    expect(result.kind).toBe("guessed");
    if (result.kind === "guessed") {
      expect(result.stateCode).toBe("07");
      expect(result.via).toBe("offline_prefix");
      expect(result.reason).toContain("check it");
    }
  });

  it("says so plainly when even the guess is ambiguous", async () => {
    const result = await lookupPin("248001", () => Promise.reject(new Error("offline")));
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("more than one state");
    }
  });

  it("retries once before giving up", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("flaky")));
    await lookupPin("110024", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a valid 'no records' answer", async () => {
    // Retrying an answer is just slower; it is not a failure.
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ Status: "404", Message: "No records found" }]),
      } as Response),
    );
    await lookupPin("110024", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("the breaker", () => {
  it("stops calling out after repeated failure", async () => {
    // A dead endpoint must not add seconds to every keystroke for the rest of
    // the session.
    const fetchImpl = vi.fn(() => Promise.reject(new Error("down")));
    for (let n = 0; n < 3; n += 1) {
      await lookupPin("110024", fetchImpl as unknown as typeof fetch);
    }
    expect(breakerOpen()).toBe(true);

    const callsBefore = fetchImpl.mock.calls.length;
    const result = await lookupPin("110024", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls.length).toBe(callsBefore);
    // And it still answers, from the offline table.
    expect(result.kind).toBe("guessed");
  });

  it("closes again when reset, so 'try again' means something", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("down")));
    for (let n = 0; n < 3; n += 1) {
      await lookupPin("110024", dead as unknown as typeof fetch);
    }
    resetBreaker();
    expect(breakerOpen()).toBe(false);
    const result = await lookupPin("110024", () => OK([office()]));
    expect(result.kind).toBe("found");
  });
});

describe("input the form should never send", () => {
  it("rejects a malformed PIN without touching the network", async () => {
    const fetchImpl = vi.fn();
    const result = await lookupPin("876543678965436789", fetchImpl as unknown as typeof fetch);
    expect(result.kind).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
