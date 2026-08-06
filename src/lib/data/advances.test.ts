import { describe, expect, it } from "vitest";
import {
  SEED_ADVANCES,
  adjustAdvance,
  advanceTax,
  openAdvances,
  receiptVoucherNumber,
  unadjustedTaxPaise,
} from "./advances";

describe("advanceTax — FR-810", () => {
  it("splits a gross receipt back to exactly what the customer paid", () => {
    const tax = advanceTax(4_24_800_00, 18, "CGST_SGST");
    expect(tax.taxablePaise + tax.totalTaxPaise).toBe(4_24_800_00);
    // ₹4,24,800 inclusive of 18% is ₹3,60,000 + ₹64,800.
    expect(tax.taxablePaise).toBe(3_60_000_00);
    expect(tax.totalTaxPaise).toBe(64_800_00);
  });

  it("back-calculates rather than grossing up", () => {
    // Grossing up would produce 18% *on top* — tax the customer never sent.
    const tax = advanceTax(1_18_000_00, 18, "CGST_SGST");
    expect(tax.taxablePaise).toBeLessThan(1_18_000_00);
    expect(tax.taxablePaise).toBe(1_00_000_00);
  });

  it("never creates or destroys a paisa when halving", () => {
    // An odd total tax is where a naive /2 loses one.
    const tax = advanceTax(1_00_001, 5, "CGST_SGST");
    expect(tax.cgstPaise! + tax.sgstPaise!).toBe(tax.totalTaxPaise);
    expect(tax.taxablePaise + tax.totalTaxPaise).toBe(1_00_001);
  });

  it("puts the whole tax on IGST across a state line", () => {
    const tax = advanceTax(59_000_00, 18, "IGST");
    expect(tax.igstPaise).toBe(tax.totalTaxPaise);
    expect(tax.cgstPaise).toBeNull();
  });
});

describe("receiptVoucherNumber", () => {
  it("uses its own RV series, not the invoice series", () => {
    // §31(3)(d): a Receipt Voucher is a different document from a tax invoice,
    // and sharing a counter with invoices breaks both series.
    expect(receiptVoucherNumber(7, new Date("2026-08-06"))).toBe("RV/26-27/0007");
  });

  it("rolls the financial year on 1 April, not 1 January", () => {
    expect(receiptVoucherNumber(1, new Date("2026-03-31"))).toBe("RV/25-26/0001");
    expect(receiptVoucherNumber(1, new Date("2026-04-01"))).toBe("RV/26-27/0001");
  });
});

describe("openAdvances and adjustment", () => {
  it("lists only what is unadjusted, oldest first", () => {
    const open = openAdvances(SEED_ADVANCES);
    expect(open.map((a) => a.voucherNumber)).toEqual([
      "RV/26-27/0005",
      "RV/26-27/0006",
    ]);
  });

  it("counts tax already paid on work not yet done", () => {
    // 64,800 + 18,000 — the position an auditor asks about.
    expect(unadjustedTaxPaise(SEED_ADVANCES)).toBe(64_800_00 + 18_000_00);
  });

  it("closes an advance against the invoice that consumed it", () => {
    const next = adjustAdvance(SEED_ADVANCES, "RV/26-27/0005", "SVC/26-27/0150");
    const closed = next.find((a) => a.voucherNumber === "RV/26-27/0005")!;
    expect(closed.status).toBe("ADJUSTED");
    expect(closed.adjustedByInvoice).toBe("SVC/26-27/0150");
  });

  it("refuses to adjust the same voucher twice", () => {
    // Double-counting the credit would understate the liability, silently.
    const once = adjustAdvance(SEED_ADVANCES, "RV/26-27/0005", "SVC/26-27/0150");
    const twice = adjustAdvance(once, "RV/26-27/0005", "SVC/26-27/0151");
    expect(
      twice.find((a) => a.voucherNumber === "RV/26-27/0005")!.adjustedByInvoice,
    ).toBe("SVC/26-27/0150");
  });
});
