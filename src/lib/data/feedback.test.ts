import { describe, expect, it } from "vitest";
import { ageWords, escalations, seedRatings, type LowRating } from "./feedback";

const NOW = new Date("2026-08-06T12:00:00");
const rating = (over: Partial<LowRating> = {}): LowRating => ({
  jobNumber: "J-1",
  customer: "X",
  technician: "R",
  rating: 2,
  comment: null,
  ratedAt: new Date(NOW.getTime() - 30_000),
  acknowledgedBy: null,
  valuePaise: null,
  ...over,
});

describe("FR-1205 escalation", () => {
  it("drops a rating once somebody has picked it up", () => {
    expect(escalations([rating({ acknowledgedBy: "Priya" })], NOW)).toEqual([]);
  });

  it("holds the 60-second promise, and says when it is broken", () => {
    const inside = escalations([rating()], NOW)[0];
    const past = escalations(
      [rating({ ratedAt: new Date(NOW.getTime() - 120_000) })],
      NOW,
    )[0];
    expect(inside.breached).toBe(false);
    expect(past.breached).toBe(true);
  });

  it("puts the angrier customer first", () => {
    // A 1★ from a minute ago outranks a 2★ from this morning: that customer is
    // the one about to tell somebody else.
    const rows = escalations(
      [
        rating({ jobNumber: "two-star", rating: 2, ratedAt: new Date(NOW.getTime() - 3_600_000) }),
        rating({ jobNumber: "one-star", rating: 1 }),
      ],
      NOW,
    );
    expect(rows[0].rating.jobNumber).toBe("one-star");
  });

  it("breaks ties on age, oldest first", () => {
    const rows = escalations(
      [
        rating({ jobNumber: "newer" }),
        rating({ jobNumber: "older", ratedAt: new Date(NOW.getTime() - 600_000) }),
      ],
      NOW,
    );
    expect(rows[0].rating.jobNumber).toBe("older");
  });

  it("never rounds an age below zero", () => {
    // A clock skew must not produce "-3s since rated".
    const rows = escalations([rating({ ratedAt: new Date(NOW.getTime() + 5_000) })], NOW);
    expect(rows[0].age).toBe(0);
  });

  it("reads an age without making anyone do arithmetic", () => {
    expect(ageWords(45)).toBe("45s");
    expect(ageWords(125)).toBe("2m 5s");
    expect(ageWords(3_725)).toBe("1h 2m");
  });

  it("seeds a kept promise, a broken one and an answered one", () => {
    const rows = seedRatings(NOW);
    const open = escalations(rows, NOW);
    expect(rows).toHaveLength(3);
    expect(open).toHaveLength(2);
    expect(open.some((e) => e.breached)).toBe(true);
    expect(open.some((e) => !e.breached)).toBe(true);
  });
});
