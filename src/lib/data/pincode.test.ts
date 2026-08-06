import { describe, expect, it } from "vitest";
import {
  GST_STATES,
  STATE_BY_CODE,
  guessStateFromPin,
  isValidPin,
  selectableStates,
} from "./pincode";

describe("isValidPin", () => {
  it("takes six digits starting 1–8", () => {
    expect(isValidPin("110024")).toBe(true);
    expect(isValidPin("400058")).toBe(true);
  });

  it("rejects the 27-digit number a real form accepted", () => {
    expect(isValidPin("876543678965436789765436789")).toBe(false);
  });

  it("rejects a PIN starting 0 or 9", () => {
    // 9 is the Army Postal Service, not a civilian PIN.
    expect(isValidPin("012345")).toBe(false);
    expect(isValidPin("900001")).toBe(false);
  });

  it("ignores spacing, because people type 110 024", () => {
    expect(isValidPin("110 024")).toBe(true);
  });

  it("rejects letters and short input", () => {
    expect(isValidPin("11002")).toBe(false);
    expect(isValidPin("11002a")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
});

describe("the GST state table", () => {
  it("carries all 36 states and territories, not the six it had", () => {
    // The regression: a site in Punjab printed "State 03" on its own invoice.
    expect(GST_STATES.length).toBeGreaterThanOrEqual(37);
    expect(STATE_BY_CODE["03"]).toBe("Punjab");
    expect(STATE_BY_CODE["19"]).toBe("West Bengal");
    expect(STATE_BY_CODE["38"]).toBe("Ladakh");
  });

  it("keeps obsolete codes resolvable but unpickable", () => {
    // 25 merged into 26 in 2020; 28 was split when Telangana formed. Old
    // records still have to render, new ones must not be created.
    expect(STATE_BY_CODE["25"]).toBeDefined();
    expect(selectableStates().some((entry) => entry.code === "25")).toBe(false);
    expect(selectableStates().some((entry) => entry.code === "37")).toBe(true);
  });

  it("has no duplicate codes", () => {
    const codes = GST_STATES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("guessStateFromPin — the offline fallback", () => {
  it("answers where a prefix means exactly one state", () => {
    expect(guessStateFromPin("110024")).toMatchObject({ kind: "state", code: "07" });
    expect(guessStateFromPin("400058")).toMatchObject({ kind: "state", code: "27" });
    expect(guessStateFromPin("560001")).toMatchObject({ kind: "state", code: "29" });
  });

  it("declines where the block is shared, rather than tossing a coin", () => {
    // 24xxxx is Uttar Pradesh or Uttarakhand; 83xxxx is Bihar or Jharkhand.
    // Guessing here would set the wrong GST head silently.
    expect(guessStateFromPin("248001").kind).toBe("ambiguous");
    expect(guessStateFromPin("834001").kind).toBe("ambiguous");
    expect(guessStateFromPin("500081").kind).toBe("ambiguous");
  });

  it("applies a three-digit exception over its block", () => {
    // Chandigarh sits inside Punjab's 16x block; Sikkim inside Bengal's 73x.
    expect(guessStateFromPin("160017")).toMatchObject({ kind: "state", code: "04" });
    expect(guessStateFromPin("737101")).toMatchObject({ kind: "state", code: "11" });
  });

  it("says why for an unusable PIN", () => {
    const guess = guessStateFromPin("99");
    expect(guess.kind).toBe("unknown");
    expect(guess.kind === "unknown" && guess.reason).toContain("six digits");
  });
});
