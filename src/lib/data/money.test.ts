import { describe, expect, it } from "vitest";
import {
  ageingTotals,
  bucketFor,
  collectionPriority,
  countdownFor,
  deductionAtRiskPaise,
  splitByPromise,
  type Payable,
  type Receivable,
} from "./money";

function receivable(over: Partial<Receivable> = {}): Receivable {
  return {
    id: "r",
    customer: "C",
    invoiceNumber: "INV-1",
    invoiceDate: "1 Jan 2026",
    daysOverdue: 10,
    amountPaise: 1_000_00,
    lastContact: null,
    promise: null,
    ...over,
  };
}

function payable(over: Partial<Payable> = {}): Payable {
  return {
    id: "p",
    vendor: "V",
    msmeClass: "MICRO",
    udyamNumber: "UDYAM-X",
    udyamActivity: "MANUFACTURING",
    hasWrittenAgreement: true,
    billDate: "1 Jan 2026",
    amountPaise: 10_000_00,
    daysElapsed: 10,
    ...over,
  };
}

describe("ageing buckets (§6.12.1)", () => {
  it("puts each boundary day in the lower bucket", () => {
    // Off-by-one here silently mis-files an invoice into a friendlier cell.
    expect(bucketFor(15)).toBe("0–15");
    expect(bucketFor(16)).toBe("16–30");
    expect(bucketFor(30)).toBe("16–30");
    expect(bucketFor(31)).toBe("31–45");
    expect(bucketFor(45)).toBe("31–45");
    expect(bucketFor(60)).toBe("46–60");
    expect(bucketFor(90)).toBe("61–90");
    expect(bucketFor(91)).toBe("90+");
  });

  it("totals rupees and counts per cell", () => {
    const totals = ageingTotals([
      receivable({ daysOverdue: 5, amountPaise: 100 }),
      receivable({ daysOverdue: 12, amountPaise: 200 }),
      receivable({ daysOverdue: 200, amountPaise: 900 }),
    ]);
    expect(totals["0–15"]).toEqual({ paise: 300, count: 2 });
    expect(totals["90+"]).toEqual({ paise: 900, count: 1 });
    expect(totals["46–60"]).toEqual({ paise: 0, count: 0 });
  });
});

describe("collection order is amount × days (§6.12.1)", () => {
  it("ranks a big recent invoice above a small ancient one", () => {
    // The case a single-key sort gets wrong in both directions.
    const huge = receivable({ amountPaise: 5_00_000_00, daysOverdue: 3 });
    const ancient = receivable({ amountPaise: 5_000_00, daysOverdue: 200 });
    expect(collectionPriority(huge)).toBeGreaterThan(
      collectionPriority(ancient),
    );
  });
});

describe("promise-to-pay restraint (FR-904)", () => {
  it("excludes an unbroken promise from the chase list", () => {
    const promised = receivable({
      id: "kept",
      promise: { dateWord: "5 Aug", broken: false },
    });
    const plain = receivable({ id: "plain" });
    const { chase, promised: group } = splitByPromise([promised, plain]);
    expect(group.map((r) => r.id)).toEqual(["kept"]);
    expect(chase.map((r) => r.id)).toEqual(["plain"]);
  });

  it("returns a broken promise to the chase list", () => {
    // The protection is earned by keeping the promise, not by making one.
    const broken = receivable({
      id: "broken",
      promise: { dateWord: "20 Jul", broken: true },
    });
    const { chase, promised } = splitByPromise([broken]);
    expect(chase.map((r) => r.id)).toEqual(["broken"]);
    expect(promised).toEqual([]);
  });

  it("sorts the chase list by amount × days overdue", () => {
    const small = receivable({ id: "s", amountPaise: 1_000_00, daysOverdue: 5 });
    const big = receivable({ id: "b", amountPaise: 2_00_000_00, daysOverdue: 40 });
    const { chase } = splitByPromise([small, big]);
    expect(chase.map((r) => r.id)).toEqual(["b", "s"]);
  });
});

describe("§43B(h) countdown (§6.12.2)", () => {
  it("uses 15 days with no written agreement and 45 with one", () => {
    const withAgreement = countdownFor(payable({ hasWrittenAgreement: true }));
    const without = countdownFor(payable({ hasWrittenAgreement: false }));
    expect(withAgreement).toMatchObject({ kind: "counting", limit: 45 });
    expect(without).toMatchObject({ kind: "counting", limit: 15 });
  });

  it("states the basis in words, because attaching an agreement changes it", () => {
    const countdown = countdownFor(payable({ hasWrittenAgreement: false }));
    expect(countdown).toMatchObject({
      basis: "15-day limit — no written agreement on record",
    });
  });

  it("suppresses the countdown for a trading Udyam registration", () => {
    const countdown = countdownFor(payable({ udyamActivity: "TRADING" }));
    expect(countdown.kind).toBe("not_applicable");
  });

  it("does not apply to medium or unregistered vendors", () => {
    expect(countdownFor(payable({ msmeClass: "MEDIUM" })).kind).toBe(
      "not_applicable",
    );
    expect(countdownFor(payable({ msmeClass: "NOT_REGISTERED" })).kind).toBe(
      "not_applicable",
    );
  });

  it("reports an unverified vendor as unknown, never as safe", () => {
    // The distinction the union exists to enforce: unknown is not zero risk.
    const countdown = countdownFor(payable({ msmeClass: "UNVERIFIED" }));
    expect(countdown.kind).toBe("unknown");
    expect(countdown.kind).not.toBe("not_applicable");
  });
});

describe("deduction at risk", () => {
  it("counts only bills with a live countdown", () => {
    const total = deductionAtRiskPaise([
      payable({ id: "a", amountPaise: 10_000_00 }),
      payable({ id: "b", amountPaise: 5_000_00, msmeClass: "SMALL" }),
      payable({ id: "c", amountPaise: 99_000_00, msmeClass: "NOT_REGISTERED" }),
    ]);
    expect(total).toBe(15_000_00);
  });

  it("excludes unverified vendors rather than folding them in silently", () => {
    // Including them would make an unquantified risk look quantified; the UI
    // surfaces them as their own above-the-fold group instead.
    const total = deductionAtRiskPaise([
      payable({ amountPaise: 9_800_00, msmeClass: "UNVERIFIED" }),
    ]);
    expect(total).toBe(0);
  });
});
