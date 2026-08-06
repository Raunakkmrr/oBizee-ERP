/**
 * Tally XML export — FR-1001.
 *
 * **Why this is XML and not a spreadsheet.** Tally imports through its own
 * `<ENVELOPE>` format; a CSV means the accountant re-keys, which is the manual
 * fixing FR-1001 exists to remove. The CA is a veto-holder on this pilot and a
 * month-end handover that needs re-typing is where a pilot stalls.
 *
 * **What this deliberately does not do.** It does not invent ledger names. A
 * voucher pointing at a ledger the company does not have fails on import with a
 * message the accountant has to decode, so the party ledger is the customer's
 * own name — which is what a service firm's Tally almost always uses — and the
 * sales and tax ledgers are named explicitly so a mismatch is visible in the
 * file rather than surprising at import.
 */

export type TallyLedgers = {
  /** Usually "Sales Accounts" or a service-specific ledger. */
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
};

export const DEFAULT_TALLY_LEDGERS: TallyLedgers = {
  sales: "Sales - Services",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
};

export type TallyInvoice = {
  number: string;
  /** `20260806` — Tally's own date format, not ISO. */
  dateYyyymmdd: string;
  customer: string;
  head: "CGST_SGST" | "IGST";
  taxablePaise: number;
  totalTaxPaise: number;
  grandTotalPaise: number;
  narration: string;
};

/** Tally will not parse a document whose text carries raw markup characters. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Rupees with two decimals — Tally reads amounts, not paise integers. */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * One sales voucher.
 *
 * Signs are Tally's convention and are not cosmetic: the party ledger is debited
 * (positive) and the income and tax ledgers are credited (negative). Reversing
 * them imports a voucher that balances to zero and posts nothing.
 */
function voucher(invoice: TallyInvoice, ledgers: TallyLedgers): string {
  const taxLines =
    invoice.head === "IGST"
      ? [[ledgers.igst, invoice.totalTaxPaise]]
      : [
          [ledgers.cgst, Math.round(invoice.totalTaxPaise / 2)],
          // The remainder rides on SGST so the two halves sum to the tax
          // exactly, rather than losing a paisa to rounding twice.
          [ledgers.sgst, invoice.totalTaxPaise - Math.round(invoice.totalTaxPaise / 2)],
        ];

  const entries = [
    `      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(invoice.customer)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-${rupees(invoice.grandTotalPaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`,
    `      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(ledgers.sales)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(invoice.taxablePaise)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`,
    ...taxLines.map(
      ([name, paise]) => `      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(String(name))}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${rupees(Number(paise))}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`,
    ),
  ].join("\n");

  return `    <TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
        <DATE>${invoice.dateYyyymmdd}</DATE>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${esc(invoice.number)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${esc(invoice.customer)}</PARTYLEDGERNAME>
        <NARRATION>${esc(invoice.narration)}</NARRATION>
${entries}
      </VOUCHER>
    </TALLYMESSAGE>`;
}

export function tallyXml(
  companyName: string,
  invoices: readonly TallyInvoice[],
  ledgers: TallyLedgers = DEFAULT_TALLY_LEDGERS,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${invoices.map((invoice) => voucher(invoice, ledgers)).join("\n")}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
