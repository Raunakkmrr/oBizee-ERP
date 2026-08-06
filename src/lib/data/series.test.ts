import { describe, expect, it } from "vitest";
import {
  financialYear,
  gapsIn,
  issue,
  peek,
  sequenceOf,
  seriesKey,
  type SeriesState,
} from "./series";

const BRANCH = {
  id: "brn_0001",
  jobSeriesPrefix: "J",
  invoiceSeriesPrefix: "SVC",
};

describe("financialYear — the 1 April boundary", () => {
  it("puts 31 March in the year that started the previous April", () => {
    expect(financialYear(new Date("2026-03-31")).label).toBe("25-26");
  });

  it("rolls on 1 April, not 1 January", () => {
    expect(financialYear(new Date("2026-04-01")).label).toBe("26-27");
    expect(financialYear(new Date("2026-01-15")).label).toBe("25-26");
  });
});

describe("issue — FR-811", () => {
  it("restarts at 1 in a new financial year", () => {
    // The defect this pins: the label rolled to 27-28 while the counter carried
    // on from 149, so the new year's first invoice was SVC/27-28/0150.
    let state: SeriesState = {};
    for (let n = 0; n < 149; n += 1) {
      state = issue(state, BRANCH, "invoice", new Date("2026-06-01")).next;
    }
    expect(issue(state, BRANCH, "invoice", new Date("2027-03-31")).number).toBe(
      "SVC/26-27/0150",
    );
    expect(issue(state, BRANCH, "invoice", new Date("2027-04-01")).number).toBe(
      "SVC/27-28/0001",
    );
  });

  it("keeps each branch's series separate", () => {
    const other = { ...BRANCH, id: "brn_0002", invoiceSeriesPrefix: "MUM" };
    const first = issue({}, BRANCH, "invoice", new Date("2026-06-01"));
    const second = issue(first.next, other, "invoice", new Date("2026-06-01"));
    // Two branches billing on the same day must not collide, and neither
    // series may start with a hole.
    expect(first.number).toBe("SVC/26-27/0001");
    expect(second.number).toBe("MUM/26-27/0001");
  });

  it("keeps each document type separate", () => {
    const invoice = issue({}, BRANCH, "invoice", new Date("2026-06-01"));
    const voucher = issue(invoice.next, BRANCH, "receipt_voucher", new Date("2026-06-01"));
    expect(voucher.number).toBe("RV/26-27/0001");
  });

  it("is consecutive with no holes", () => {
    let state: SeriesState = {};
    const numbers: number[] = [];
    for (let n = 0; n < 25; n += 1) {
      const next = issue(state, BRANCH, "invoice", new Date("2026-06-01"));
      state = next.next;
      numbers.push(next.sequence);
    }
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("does not consume a number when only peeked", () => {
    // The form shows the number it *would* take; showing one and then issuing
    // a different one is how a series grows a hole.
    const state: SeriesState = {};
    expect(peek(state, BRANCH, "invoice", new Date("2026-06-01"))).toBe("SVC/26-27/0001");
    expect(issue(state, BRANCH, "invoice", new Date("2026-06-01")).number).toBe(
      "SVC/26-27/0001",
    );
  });

  it("keys on tenant branch, doc type and year, as FR-811 states", () => {
    expect(seriesKey("brn_0001", "invoice", new Date("2026-06-01"))).toBe(
      "brn_0001:invoice:2026",
    );
  });
});

describe("gapsIn — proving the series is intact", () => {
  it("finds nothing in a consecutive run", () => {
    expect(gapsIn([1, 2, 3, 4], 1, 4)).toEqual([]);
  });

  it("names every missing number, because each is a document presumed issued", () => {
    expect(gapsIn([1, 2, 5], 1, 5)).toEqual([3, 4]);
  });

  it("starts where the data starts, not at 1", () => {
    // A tenant seeded mid-year at 149 has no documents numbered 1–148, and
    // reporting 148 holes would make the check worthless on day one.
    expect(gapsIn([150, 151, 152], 150, 152)).toEqual([]);
    expect(gapsIn([150, 152], 150, 152)).toEqual([151]);
  });

  it("reads the sequence off a formatted number", () => {
    expect(sequenceOf("SVC/26-27/0150")).toBe(150);
    expect(sequenceOf("RV/26-27/0007")).toBe(7);
    expect(sequenceOf("nonsense")).toBeNull();
  });
});
