import { describe, expect, it } from "vitest";
import {
  MIN_LEADS_FOR_RATE,
  conversionRate,
  filterCaption,
  worstDwell,
} from "./reports";

describe("conversion rate suppression (FR-103)", () => {
  it("reports a rate once the sample is large enough", () => {
    expect(
      conversionRate({ source: "s", takenBy: "t", leads: 20, won: 5 }),
    ).toBe(25);
  });

  it("returns null below the threshold rather than a flattering percentage", () => {
    // Three leads and one win is not "33% conversion"; it is three leads.
    // Incentives are paid on this table, so the sample has to earn the rate.
    expect(
      conversionRate({ source: "s", takenBy: "t", leads: 3, won: 1 }),
    ).toBeNull();
  });

  it("applies the threshold inclusively at the boundary", () => {
    expect(
      conversionRate({
        source: "s",
        takenBy: "t",
        leads: MIN_LEADS_FOR_RATE,
        won: 1,
      }),
    ).toBe(20);
  });

  it("does not divide by zero on a source with no leads", () => {
    expect(
      conversionRate({ source: "s", takenBy: "t", leads: 0, won: 0 }),
    ).toBeNull();
  });
});

describe("dwell time (§6.14)", () => {
  it("finds the state costing the most total time, not the highest average", () => {
    // One job stuck for a month and thirty stuck for a day are different
    // problems; total hours finds both, average finds only the first.
    const worst = worstDwell([
      { state: "Parts awaited", count: 7, avgHours: 71.5 },
      { state: "Scheduled", count: 22, avgHours: 6.4 },
      { state: "Stalled once", count: 1, avgHours: 500 },
    ]);
    expect(worst?.state).toBe("Parts awaited");
  });

  it("returns null rather than guessing on an empty period", () => {
    expect(worstDwell([])).toBeNull();
  });
});

describe("exports name their filters (FR-1002)", () => {
  it("puts period, branch and comparison in one caption", () => {
    // A number with no provenance gets pasted into a WhatsApp group as fact.
    expect(
      filterCaption({
        periodWord: "Week to 2 Aug 2026",
        branch: "All branches",
        comparedWith: "previous week",
      }),
    ).toBe("Week to 2 Aug 2026 · All branches · compared with previous week");
  });
});
