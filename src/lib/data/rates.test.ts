import { describe, expect, it } from "vitest";
import {
  SEED_RATES,
  SLABS,
  currentRates,
  effectiveWords,
  historyOf,
  rateOn,
  supersede,
} from "./rates";

describe("rateOn — FR-804's effective dating", () => {
  it("prices an old invoice at the rate that applied then", () => {
    // The whole requirement: an invoice raised in 2024 was correct at 28% and
    // must stay correct at 28%, whether printed that day or two years later.
    expect(rateOn(SEED_RATES, "85321000", new Date("2024-06-01"))!.ratePercent).toBe(28);
  });

  it("prices a new invoice at the current rate", () => {
    expect(rateOn(SEED_RATES, "85321000", new Date("2026-08-06"))!.ratePercent).toBe(18);
  });

  it("treats the effective date as inclusive", () => {
    expect(rateOn(SEED_RATES, "85321000", new Date("2025-09-22"))!.ratePercent).toBe(18);
    expect(rateOn(SEED_RATES, "85321000", new Date("2025-09-21"))!.ratePercent).toBe(28);
  });

  it("returns null rather than guessing when no row covers the date", () => {
    // A silent fallback to 18% is how a nil-rated supply gets taxed.
    expect(rateOn(SEED_RATES, "85321000", new Date("2016-01-01"))).toBeNull();
    expect(rateOn(SEED_RATES, "not-a-code", new Date("2026-08-06"))).toBeNull();
  });
});

describe("nothing edits a row", () => {
  it("supersedes by adding, leaving the old row intact", () => {
    const before = SEED_RATES.length;
    const after = supersede(SEED_RATES, {
      code: "9987",
      description: "Maintenance, repair and installation services",
      ratePercent: 5,
      effectiveFrom: "2027-04-01",
      note: "Hypothetical",
    });
    expect(after).toHaveLength(before + 1);
    // The old row still answers for its own period.
    expect(rateOn(after, "9987", new Date("2026-08-06"))!.ratePercent).toBe(18);
    expect(rateOn(after, "9987", new Date("2027-04-01"))!.ratePercent).toBe(5);
  });

  it("keeps every version of a code, newest first", () => {
    const history = historyOf(SEED_RATES, "85321000");
    expect(history.map((row) => row.ratePercent)).toEqual([18, 28]);
  });

  it("offers only the four current slabs for a new row", () => {
    expect(SLABS).toEqual([0, 5, 18, 40]);
    // 28 is not offered, but the master still holds it — see historyOf above.
    expect(SLABS).not.toContain(28);
  });
});

describe("currentRates", () => {
  it("shows one row per code — what is in force today", () => {
    const current = currentRates(SEED_RATES, new Date("2026-08-06"));
    const codes = current.map((row) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(current.find((row) => row.code === "85321000")!.ratePercent).toBe(18);
  });
});

describe("effectiveWords", () => {
  it("reads as a date", () => {
    expect(effectiveWords("2025-09-22")).toContain("Sep");
  });

  it("returns the input rather than 'Invalid Date'", () => {
    expect(effectiveWords("nope")).toBe("nope");
  });
});
