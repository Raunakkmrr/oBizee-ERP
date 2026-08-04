import { describe, expect, it } from "vitest";
import {
  BLOCKS_EXPORT,
  exportReadiness,
  formatPaiseDelta,
  reconcile,
  type GstPeriod,
} from "./gst";

function period(over: Partial<GstPeriod> = {}): GstPeriod {
  return {
    periodLabel: "July 2026",
    registerTaxablePaise: 1_000_00,
    registerTaxPaise: 180_00,
    registerDocuments: 2,
    tables: [
      {
        code: "B2B",
        label: "Registered",
        documents: 2,
        taxablePaise: 1_000_00,
        taxPaise: 180_00,
        failed: false,
      },
    ],
    readiness: [],
    ...over,
  };
}

describe("reconciliation to the paisa (FR-814)", () => {
  it("balances when the tables agree with the register exactly", () => {
    const result = reconcile(period());
    expect(result.balanced).toBe(true);
    expect(result.taxableDifferencePaise).toBe(0);
    expect(result.taxDifferencePaise).toBe(0);
  });

  it("does NOT balance on a one-paisa gap", () => {
    // The whole point. A tolerance is how a reconciliation stops being one, and
    // a one-paisa gap in a filing is a real defect.
    const result = reconcile(
      period({ registerTaxablePaise: 1_000_01 }),
    );
    expect(result.balanced).toBe(false);
    expect(result.taxableDifferencePaise).toBe(-1);
  });

  it("signs the difference so the reader knows which side is short", () => {
    const over = reconcile(period({ registerTaxablePaise: 900_00 }));
    expect(over.taxableDifferencePaise).toBeGreaterThan(0);
    const short = reconcile(period({ registerTaxablePaise: 1_100_00 }));
    expect(short.taxableDifferencePaise).toBeLessThan(0);
  });

  it("sums credit notes as negatives rather than dropping them", () => {
    const result = reconcile(
      period({
        registerTaxablePaise: 800_00,
        registerTaxPaise: 144_00,
        tables: [
          { code: "B2B", label: "", documents: 2, taxablePaise: 1_000_00, taxPaise: 180_00, failed: false },
          { code: "CDNR", label: "", documents: 1, taxablePaise: -200_00, taxPaise: -36_00, failed: false },
        ],
      }),
    );
    expect(result.balanced).toBe(true);
  });

  it("cannot balance when a table failed, even if the arithmetic agrees", () => {
    // A failed table is not zero. Treating it as zero is exactly how a partial
    // export produces a return that looks filed and is wrong.
    const result = reconcile(
      period({
        tables: [
          { code: "B2B", label: "", documents: 2, taxablePaise: 1_000_00, taxPaise: 180_00, failed: false },
          { code: "AT", label: "", documents: 0, taxablePaise: 0, taxPaise: 0, failed: true },
        ],
      }),
    );
    expect(result.incomplete).toBe(true);
    expect(result.balanced).toBe(false);
  });
});

describe("export readiness (§6.14)", () => {
  it("is ready when nothing blocks and the paper balances", () => {
    expect(exportReadiness(period()).kind).toBe("ready");
  });

  it("blocks on a missing SAC/HSN code and names the count", () => {
    const result = exportReadiness(
      period({ readiness: [{ kind: "MISSING_CODE", count: 3, href: "#" }] }),
    );
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      // Never "validation failed" — the exact unresolved rows (§6.14).
      expect(result.reasons[0]).toContain("3");
      // The acronym must survive: "sac/hsn" reads as a typo to a CA.
      expect(result.reasons[0]).toContain("SAC/HSN");
      expect(result.reasons[0]).toContain("invoices without");
    }
  });

  it("does not block on a legitimate place-of-supply override", () => {
    // An override is stored with a reason. It needs review, which is a
    // different thing from being wrong.
    const result = exportReadiness(
      period({ readiness: [{ kind: "OVERRIDDEN_POS", count: 2, href: "#" }] }),
    );
    expect(result.kind).toBe("ready");
  });

  it("separates blocking rows from informational ones", () => {
    expect(BLOCKS_EXPORT.MISSING_CODE).toBe(true);
    expect(BLOCKS_EXPORT.PENDING_IRN).toBe(true);
    expect(BLOCKS_EXPORT.UNADJUSTED_ADVANCE).toBe(true);
    expect(BLOCKS_EXPORT.CREDIT_NOTE).toBe(false);
    expect(BLOCKS_EXPORT.B2C_SMALL).toBe(false);
    expect(BLOCKS_EXPORT.RCM_INWARD).toBe(false);
  });

  it("blocks and names the table when one failed to compute", () => {
    const result = exportReadiness(
      period({
        tables: [
          { code: "B2B", label: "", documents: 2, taxablePaise: 1_000_00, taxPaise: 180_00, failed: false },
          { code: "HSN", label: "", documents: 0, taxablePaise: 0, taxPaise: 0, failed: true },
        ],
      }),
    );
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reasons.some((r) => r.includes("HSN"))).toBe(true);
    }
  });

  it("blocks on an unbalanced working paper and states the gap, not the totals", () => {
    const result = exportReadiness(period({ registerTaxablePaise: 1_000_20 }));
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reasons[0]).toContain("₹0.20");
      expect(result.reasons[0]).not.toContain("1,000");
    }
  });

  it("lists every blocking reason, not just the first", () => {
    const result = exportReadiness(
      period({
        readiness: [
          { kind: "MISSING_CODE", count: 1, href: "#" },
          { kind: "PENDING_IRN", count: 2, href: "#" },
        ],
      }),
    );
    if (result.kind === "blocked") {
      expect(result.reasons.length).toBe(2);
    }
  });
});

describe("formatPaiseDelta", () => {
  it("renders zero without a direction word", () => {
    expect(formatPaiseDelta(0)).toBe("₹0.00");
  });

  it("says over and short rather than plus and minus", () => {
    expect(formatPaiseDelta(20)).toBe("₹0.20 over");
    expect(formatPaiseDelta(-105)).toBe("₹1.05 short");
  });

  it("groups by the Indian convention", () => {
    expect(formatPaiseDelta(12_34_567_89)).toBe("₹12,34,567.89 over");
  });
});
