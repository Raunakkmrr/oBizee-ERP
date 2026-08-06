import { describe, expect, it } from "vitest";
import {
  billingDue,
  billingSchedule,
  type Contract,
  INVOICES_PER_YEAR,
  VISITS_PER_YEAR,
  needsReceiptVoucher,
  perInvoiceAmount,
  scheduleProgress,
} from "./contracts";

describe("recurrence → visits per year (FR-501)", () => {
  it("gives ALTERNATE_MONTHLY six visits, not twelve", () => {
    // FR-501's acceptance criterion verbatim: an alternate-monthly AMC starting
    // 15 Aug generates 15 Aug, Oct, Dec, Feb, Apr, Jun — "six visits, not
    // twelve". It is the pattern generic products miss.
    expect(VISITS_PER_YEAR.ALTERNATE_MONTHLY).toBe(6);
    expect(VISITS_PER_YEAR.MONTHLY).toBe(12);
  });

  it("covers the rest of the list the market actually sells", () => {
    expect(VISITS_PER_YEAR.QUARTERLY).toBe(4);
    expect(VISITS_PER_YEAR.HALF_YEARLY).toBe(2);
    expect(VISITS_PER_YEAR.ANNUAL).toBe(1);
  });
});

describe("billing frequency is independent of the visit schedule (FR-505)", () => {
  it("allows monthly visits with a single upfront annual invoice", () => {
    // FR-505: "A monthly visit schedule with annual upfront billing is the most
    // common combination in this market and must not be forced into per-visit
    // billing." Twelve visits, one invoice.
    expect(VISITS_PER_YEAR.MONTHLY).toBe(12);
    expect(INVOICES_PER_YEAR.UPFRONT_ANNUAL).toBe(1);
  });

  it("splits a contract value across its invoices, not its visits", () => {
    // ₹3,60,000 a year billed quarterly = ₹90,000 an invoice, regardless of
    // whether there are 6 visits or 52.
    expect(perInvoiceAmount(3_60_000_00, "QUARTERLY", 6)).toBe(90_000_00);
    expect(perInvoiceAmount(3_60_000_00, "QUARTERLY", 52)).toBe(90_000_00);
  });

  it("bills the whole value once on an upfront annual contract", () => {
    expect(perInvoiceAmount(3_60_000_00, "UPFRONT_ANNUAL", 12)).toBe(3_60_000_00);
  });

  it("divides by visit count only when billing is PER_VISIT", () => {
    expect(perInvoiceAmount(3_60_000_00, "PER_VISIT", 6)).toBe(60_000_00);
    expect(perInvoiceAmount(3_60_000_00, "PER_VISIT", 12)).toBe(30_000_00);
  });

  it("computes monthly billing to the paisa", () => {
    expect(perInvoiceAmount(3_60_000_00, "MONTHLY", 12)).toBe(30_000_00);
  });
});

describe("delivery is measured against elapsed time (§6.14)", () => {
  it("does not call a two-day-old contract behind schedule", () => {
    // The false positive this function exists to kill: 3 of 12 visits on day 2
    // of a 365-day term is ahead, not behind. The old `pct < 50` rule flagged
    // every healthy new contract, which trains the owner to ignore the warning.
    const progress = scheduleProgress(
      { visitsDone: 3, visitsCommitted: 12 },
      365,
      364,
    );
    expect(progress.expectedByNow).toBe(0);
    expect(progress.isBehind).toBe(false);
  });

  it("reports how many visits behind, not just that it is behind", () => {
    // Ten months into a year, 12 monthly visits committed, 4 delivered.
    const progress = scheduleProgress(
      { visitsDone: 4, visitsCommitted: 12 },
      364,
      59,
    );
    expect(progress.expectedByNow).toBe(10);
    expect(progress.behindBy).toBe(6);
    expect(progress.isBehind).toBe(true);
  });

  it("floors expected visits — nobody can act on being 0.7 visits behind", () => {
    const progress = scheduleProgress(
      { visitsDone: 0, visitsCommitted: 4 },
      365,
      300,
    );
    // 65/365 of 4 = 0.71 → 0 expected, so not behind.
    expect(progress.expectedByNow).toBe(0);
    expect(progress.isBehind).toBe(false);
  });

  it("never reports a negative shortfall when ahead of schedule", () => {
    const progress = scheduleProgress(
      { visitsDone: 9, visitsCommitted: 12 },
      365,
      180,
    );
    expect(progress.behindBy).toBe(0);
    expect(progress.isBehind).toBe(false);
  });

  it("handles the last day of a term without dividing past the end", () => {
    const progress = scheduleProgress(
      { visitsDone: 12, visitsCommitted: 12 },
      365,
      0,
    );
    expect(progress.expectedByNow).toBe(12);
    expect(progress.isBehind).toBe(false);
  });
});

describe("advances (FR-810)", () => {
  it("requires a receipt voucher when money arrives before the service", () => {
    // FR-810: for services GST is payable when the advance is received, and a
    // sequentially-numbered Receipt Voucher must be issued.
    expect(needsReceiptVoucher("UPFRONT_ANNUAL")).toBe(true);
    expect(needsReceiptVoucher("HALF_YEARLY")).toBe(true);
  });

  it("does not require one where billing follows delivery", () => {
    expect(needsReceiptVoucher("MONTHLY")).toBe(false);
    expect(needsReceiptVoucher("PER_VISIT")).toBe(false);
  });
});

describe("recurring billing — the schedule a contract owes", () => {
  const base = (over: Partial<Contract> = {}): Contract =>
    ({
      id: "ctr_x",
      reference: "AMC-2627-0099",
      customer: "Deshmukh Hospital",
      site: "Saket",
      annualValuePaise: 7_20_000_00,
      coverage: "COMPREHENSIVE",
      billing: "MONTHLY",
      startDate: "1 Aug 2026",
      endDate: "31 Jul 2027",
      termDays: 365,
      daysRemaining: 300,
      status: "ACTIVE",
      schedules: [
        {
          id: "s1",
          scope: "Generator AMC",
          recurrence: "MONTHLY",
          visitsDone: 0,
          visitsTotal: 12,
          nextVisit: null,
        },
      ],
      ...over,
    }) as Contract;

  it("bills a six-month contract six times, not twelve", () => {
    // The scenario the whole feature exists for: one order, monthly invoices,
    // and nobody creating an order every month.
    const half = base({ termDays: 182 });
    expect(billingSchedule(half, 0)).toHaveLength(6);
  });

  it("spaces monthly, quarterly and annual correctly over a year", () => {
    expect(billingSchedule(base({ billing: "MONTHLY" }), 0)).toHaveLength(12);
    expect(billingSchedule(base({ billing: "QUARTERLY" }), 0)).toHaveLength(4);
    expect(billingSchedule(base({ billing: "HALF_YEARLY" }), 0)).toHaveLength(2);
    expect(billingSchedule(base({ billing: "UPFRONT_ANNUAL" }), 0)).toHaveLength(1);
  });

  it("has no calendar schedule for per-visit billing", () => {
    // Per-visit follows the visit, not the month — the job raises that invoice.
    expect(billingSchedule(base({ billing: "PER_VISIT" }), 0)).toEqual([]);
  });

  it("clamps a month-end anchor instead of sliding into the next month", () => {
    // A 31 Jan anchor bills 28 Feb, not 3 Mar — sliding would move a GST
    // document into the wrong return period.
    const points = billingSchedule(
      base({ startDate: "31 Jan 2027", termDays: 90, billing: "MONTHLY" }),
      0,
    );
    expect(points[1].due.getMonth()).toBe(1); // February
    expect(points[1].due.getDate()).toBe(28);
  });

  it("marks the ones already raised", () => {
    const points = billingSchedule(base(), 2);
    expect(points[0].raised).toBe(true);
    expect(points[1].raised).toBe(true);
    expect(points[2].raised).toBe(false);
  });

  it("numbers them the way an accountant counts", () => {
    const points = billingSchedule(base({ billing: "QUARTERLY" }), 0);
    expect(points[1]).toMatchObject({ number: 2, of: 4 });
  });
});

describe("what is owed right now", () => {
  const contract = (over: Partial<Contract> = {}): Contract =>
    ({
      id: "c1",
      reference: "AMC-1",
      customer: "X",
      site: "Y",
      annualValuePaise: 1_20_000_00,
      coverage: "COMPREHENSIVE",
      billing: "MONTHLY",
      startDate: "1 Jun 2026",
      endDate: "31 May 2027",
      termDays: 365,
      daysRemaining: 300,
      status: "ACTIVE",
      schedules: [
        { id: "s", scope: "AMC", recurrence: "MONTHLY", visitsDone: 0, visitsTotal: 12, nextVisit: null },
      ],
      ...over,
    }) as Contract;

  const TODAY = new Date("2026-08-06T10:00:00");

  it("puts the most overdue first", () => {
    const rows = billingDue([contract()], {}, TODAY);
    expect(rows[0].daysLate).toBeGreaterThan(rows[1].daysLate);
  });

  it("skips what has already been raised", () => {
    const all = billingDue([contract()], {}, TODAY);
    const some = billingDue([contract()], { c1: 2 }, TODAY);
    expect(some.length).toBe(all.length - 2);
  });

  it("shows what is coming, not only what is late", () => {
    // A list that only ever shows overdue work teaches people that being late
    // is the normal state.
    const rows = billingDue([contract()], {}, TODAY);
    expect(rows.some((row) => row.daysLate < 0)).toBe(true);
  });

  it("does not look further ahead than the horizon", () => {
    const rows = billingDue([contract()], {}, TODAY, 45);
    expect(rows.every((row) => row.daysLate >= -45)).toBe(true);
  });

  it("ignores a contract that is not active", () => {
    expect(billingDue([contract({ status: "EXPIRED" })], {}, TODAY)).toEqual([]);
  });
});
