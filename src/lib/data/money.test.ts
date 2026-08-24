import { describe, expect, it } from "vitest";
import {
  ageingTotals,
  bucketFor,
  collectionPriority,
  countdownFor,
  daysLeft,
  deductionAtRiskPaise,
  deductionLostPaise,
  moneyAlarms,
  splitByPromise,
  type Payable,
  isPartPaid,
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
    billedPaise: 1_000_00,
    paidPaise: 0,
    taxOnUncollectedPaise: 0,
    itcReversal: { applies: false, reason: "settled" } as const,
    lastContact: null,
    phone: "98200 12345",
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

describe("lapsed is not a big 'counting' (§43B(h))", () => {
  it("switches to lapsed the day after the limit", () => {
    expect(
      countdownFor(payable({ hasWrittenAgreement: false, daysElapsed: 15 }))
        .kind,
    ).toBe("counting");
    expect(
      countdownFor(payable({ hasWrittenAgreement: false, daysElapsed: 16 }))
        .kind,
    ).toBe("lapsed");
  });

  it("keeps already-lost money out of the at-risk figure", () => {
    // The regression this exists for: the headline read "₹64,200 at risk"
    // while ₹26,000 of it was already gone. One number is a warning you can
    // act on, the other is a loss you can only learn from.
    const lost = payable({
      id: "lost",
      hasWrittenAgreement: false,
      daysElapsed: 18,
      amountPaise: 26_000_00,
    });
    const atRisk = payable({
      id: "at-risk",
      hasWrittenAgreement: true,
      daysElapsed: 38,
      amountPaise: 38_200_00,
    });
    expect(deductionAtRiskPaise([lost, atRisk])).toBe(38_200_00);
    expect(deductionLostPaise([lost, atRisk])).toBe(26_000_00);
  });

  it("never counts an unverified vendor as either lost or at risk", () => {
    const unknown = payable({ msmeClass: "UNVERIFIED", amountPaise: 9_800_00 });
    expect(deductionAtRiskPaise([unknown])).toBe(0);
    expect(deductionLostPaise([unknown])).toBe(0);
  });

  it("reports days left only while the clock is still running", () => {
    expect(
      daysLeft(countdownFor(payable({ hasWrittenAgreement: true, daysElapsed: 38 }))),
    ).toBe(7);
    expect(
      daysLeft(countdownFor(payable({ hasWrittenAgreement: false, daysElapsed: 18 }))),
    ).toBeNull();
  });
});

describe("money alarms — what is irreversible or running out", () => {
  it("puts a lost deduction above one that is merely due", () => {
    const lost = payable({ id: "lost", hasWrittenAgreement: false, daysElapsed: 18 });
    const due = payable({ id: "due", hasWrittenAgreement: true, daysElapsed: 40 });
    expect(moneyAlarms([due, lost]).map((a) => a.bill.id)).toEqual([
      "lost",
      "due",
    ]);
  });

  it("orders due alarms by how little time is left", () => {
    const soon = payable({ id: "soon", hasWrittenAgreement: true, daysElapsed: 44 });
    const later = payable({ id: "later", hasWrittenAgreement: true, daysElapsed: 38 });
    expect(
      moneyAlarms([later, soon])
        .filter((a) => a.kind === "deduction_due")
        .map((a) => a.bill.id),
    ).toEqual(["soon", "later"]);
  });

  it("stays quiet about a bill with plenty of time left", () => {
    const relaxed = payable({ hasWrittenAgreement: true, daysElapsed: 5 });
    expect(moneyAlarms([relaxed])).toEqual([]);
  });

  it("never raises an alarm for a vendor the timeline does not cover", () => {
    expect(moneyAlarms([payable({ msmeClass: "NOT_REGISTERED" })])).toEqual([]);
    expect(moneyAlarms([payable({ udyamActivity: "TRADING" })])).toEqual([]);
  });

  it("raises an unverified vendor as its own kind, never as a number", () => {
    const alarms = moneyAlarms([payable({ msmeClass: "UNVERIFIED" })]);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].kind).toBe("unverified_vendor");
  });
});

describe("part paid", () => {
  it("is money in and money still owed, not either alone", () => {
    expect(isPartPaid(receivable({ billedPaise: 7_080_00, paidPaise: 4_000_00 }))).toBe(true);
    // Nothing received: a plain unpaid bill, and a different conversation.
    expect(isPartPaid(receivable({ billedPaise: 7_080_00, paidPaise: 0 }))).toBe(false);
    // Settled in full does not reach this list at all, but the rule holds.
    expect(isPartPaid(receivable({ billedPaise: 7_080_00, paidPaise: 7_080_00 }))).toBe(false);
  });

  it("treats an unknown billed total as not part paid, rather than guessing", () => {
    expect(isPartPaid(receivable({ billedPaise: 0, paidPaise: 0 }))).toBe(false);
  });
});
