import { describe, expect, it } from "vitest";
import { ZOHO_COLUMNS, zohoDate, zohoRows } from "./zoho";
import type { Invoice } from "./data/store";

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: "inv_1",
  number: "SVC/26-27/0150",
  jobId: null,
  jobNumber: null,
  contractId: null,
  contractPoint: null,
  customer: "Shakti Industries",
  dateWord: "6 Aug",
  head: "CGST_SGST",
  explanation: "Site in Delhi (07) · your GSTIN in Delhi (07) → CGST + SGST",
  lines: [
    {
      description: "AC AMC — visit 3 of 12",
      code: "9987",
      kind: "service",
      qty: 1,
      ratePaise: 4_500_00,
      ratePercent: 18,
    },
    {
      description: "Capacitor 45 MFD",
      code: "85321000",
      kind: "goods",
      qty: 2,
      ratePaise: 340_00,
      ratePercent: 18,
    },
  ],
  taxablePaise: 5_180_00,
  totalTaxPaise: 932_40,
  roundOffPaise: -40,
  grandTotalPaise: 6_112_00,
  status: "DRAFT",
  ...over,
});

const ON = new Date("2026-08-06");

describe("zohoRows — FR-1001", () => {
  it("emits one row per line, not per invoice", () => {
    // Collapsing to one row loses the HSN and the rate — exactly what an
    // accountant then re-enters by hand.
    expect(zohoRows([invoice()], ON, "Delhi")).toHaveLength(2);
  });

  it("exports rupees, never paise", () => {
    // Paise would import cleanly and inflate every figure a hundredfold, which
    // is worse than failing.
    const rows = zohoRows([invoice()], ON, "Delhi");
    expect(rows[0][6]).toBe(4500);
    expect(rows[1][6]).toBe(340);
  });

  it("writes ISO dates, so no locale can reorder them", () => {
    expect(zohoDate(ON)).toBe("2026-08-06");
    // 06/08/2026 would book an August invoice into June on a US locale.
    expect(zohoDate(ON)).not.toContain("/");
  });

  it("tells Zoho which kind of supply it is, so it splits the tax itself", () => {
    expect(zohoRows([invoice()], ON, "Delhi")[0][8]).toBe("Intra State");
    expect(zohoRows([invoice({ head: "IGST" })], ON, "Gujarat")[0][8]).toBe(
      "Inter State",
    );
  });

  it("repeats the invoice header on every line", () => {
    const rows = zohoRows([invoice()], ON, "Delhi");
    expect(rows[0][0]).toBe(rows[1][0]);
    expect(rows[0][2]).toBe(rows[1][2]);
  });

  it("uses Zoho's own column names so the importer auto-matches", () => {
    expect(ZOHO_COLUMNS[0]).toBe("Invoice Number");
    expect(ZOHO_COLUMNS).toContain("HSN/SAC");
    expect(ZOHO_COLUMNS).toHaveLength(11);
  });

  it("keeps the row width equal to the header width", () => {
    // A row one cell short shifts every column after it, silently.
    for (const row of zohoRows([invoice()], ON, "Delhi")) {
      expect(row).toHaveLength(ZOHO_COLUMNS.length);
    }
  });

  it("carries the place-of-supply reasoning into the notes", () => {
    expect(String(zohoRows([invoice()], ON, "Delhi")[0][10])).toContain("CGST + SGST");
  });
});
