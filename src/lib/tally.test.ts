import { describe, expect, it } from "vitest";
import { tallyXml, type TallyInvoice } from "./tally";

const invoice = (over: Partial<TallyInvoice> = {}): TallyInvoice => ({
  number: "SVC/26-27/0151",
  dateYyyymmdd: "20260806",
  customer: "Deshmukh Hospital",
  head: "CGST_SGST",
  taxablePaise: 4_500_00,
  totalTaxPaise: 810_00,
  grandTotalPaise: 5_310_00,
  narration: "AC servicing",
  ...over,
});

describe("Tally XML", () => {
  it("writes rupees, never paise integers", () => {
    const xml = tallyXml("Shakti Cooling", [invoice()]);
    expect(xml).toContain("<AMOUNT>4500.00</AMOUNT>");
    expect(xml).not.toContain("450000");
  });

  it("debits the party and credits income and tax", () => {
    // Reversing the signs imports a voucher that balances to zero and posts
    // nothing — it fails silently rather than loudly.
    const xml = tallyXml("Shakti Cooling", [invoice()]);
    expect(xml).toContain("<AMOUNT>-5310.00</AMOUNT>");
  });

  it("splits CGST and SGST so the halves sum to the tax exactly", () => {
    // An odd number of paise must not lose one to rounding twice.
    const xml = tallyXml("X", [invoice({ totalTaxPaise: 810_01 })]);
    const amounts = [...xml.matchAll(/<AMOUNT>([\d.]+)<\/AMOUNT>/g)].map((m) =>
      Number(m[1]),
    );
    const cgst = amounts[amounts.length - 2];
    const sgst = amounts[amounts.length - 1];
    expect(Number((cgst + sgst).toFixed(2))).toBe(810.01);
  });

  it("uses a single IGST ledger on an interstate supply", () => {
    const xml = tallyXml("X", [invoice({ head: "IGST" })]);
    expect(xml).toContain("Output IGST");
    expect(xml).not.toContain("Output CGST");
  });

  it("escapes markup in a company or customer name", () => {
    // Tally will not parse a document carrying raw markup characters, and
    // "Sharma & Sons" is an entirely ordinary name.
    const xml = tallyXml("Sharma & Sons", [invoice({ customer: 'A "B" <C>' })]);
    expect(xml).toContain("Sharma &amp; Sons");
    expect(xml).toContain("A &quot;B&quot; &lt;C&gt;");
  });

  it("emits one voucher per invoice", () => {
    const xml = tallyXml("X", [invoice(), invoice({ number: "SVC/26-27/0152" })]);
    expect([...xml.matchAll(/<VOUCHER /g)]).toHaveLength(2);
  });
});
