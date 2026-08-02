import { describe, expect, it } from "vitest";
import {
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
