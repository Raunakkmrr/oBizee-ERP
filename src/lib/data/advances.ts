import { z } from "zod";
import { apiFetch } from "../api/client";
import { defineQuery } from "./source";

/**
 * Advances received, and the Receipt Voucher that has to accompany them —
 * FR-810.
 *
 * **The gap this closes.** An AMC billed `UPFRONT_ANNUAL` or `UPFRONT_HALF`
 * takes the customer's money before a single visit has happened. Under GST that
 * receipt is itself a taxable event for a *service*: tax falls due on receipt,
 * and §31(3)(d) requires a **Receipt Voucher** — its own sequential series,
 * not an invoice number — at the moment the money arrives. The advance is then
 * reported in GSTR-1 until an invoice adjusts it.
 *
 * The product already *said* this on the contract form. Nothing produced the
 * voucher, so the sentence was a warning about work the software left to the
 * accountant — which is the failure mode this module exists to remove.
 *
 * **Why the tax is back-calculated.** A customer paying "₹3,60,000 for the
 * year" pays a gross figure; they have not separately handed over the tax. So
 * the receipt is treated as inclusive and split, rather than grossed up — which
 * would collect tax the customer never sent and leave the ledger short.
 */

export const ADVANCE_STATUSES = ["OPEN", "ADJUSTED"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const advanceSchema = z.object({
  id: z.string(),
  /** RV series — deliberately not the invoice series (§31(3)(d)). */
  voucherNumber: z.string(),
  contractId: z.string().nullable(),
  customer: z.string(),
  receivedOn: z.string(),
  /** What the customer actually paid, tax included. */
  receiptPaise: z.number().int().positive(),
  ratePercent: z.number(),
  head: z.enum(["CGST_SGST", "IGST"]),
  status: z.enum(ADVANCE_STATUSES),
  /** The invoice that consumed it, once one exists. */
  adjustedByInvoice: z.string().nullable(),
});

export type Advance = z.infer<typeof advanceSchema>;

/** Just enough of an invoice to offer it as the one an advance settles into. */
const settlementTargetSchema = z.object({
  id: z.string(),
  /** Null until issued. */
  number: z.string().nullable(),
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]),
  customerId: z.string(),
  grandTotalPaise: z.number().int(),
  /*
    What each invoice settles. The billing chooser reads these to work out
    which completed jobs and which contract instalments are still unraised —
    an invoice register that cannot say what it billed cannot answer that.
  */
  jobId: z.string().nullable(),
  contractId: z.string().nullable(),
  contractPoint: z.number().int().nullable(),
  /* Enough to build the Tally envelope without a second read. */
  customer: z.string(),
  issueDate: z.string(),
  head: z.enum(["CGST_SGST", "IGST"]),
  explanation: z.string(),
  taxablePaise: z.number().int(),
  totalTaxPaise: z.number().int(),
  /* Per-line, because the Tally and Zoho envelopes are per-line documents. */
  lines: z.array(
    z.object({
      description: z.string(),
      code: z.string(),
      kind: z.enum(["service", "goods"]),
      qty: z.number(),
      ratePaise: z.number().int(),
      ratePercent: z.number(),
    }),
  ),
});

export type SettlementTarget = z.infer<typeof settlementTargetSchema>;

/**
 * A row that has been issued, and therefore has a number.
 *
 * The narrowing is a type predicate rather than a comment, so a screen cannot
 * hand a draft to something that prints an invoice number.
 */
export type IssuedInvoice = SettlementTarget & { number: string };

export function isIssued(row: SettlementTarget): row is IssuedInvoice {
  return row.status === "ISSUED" && row.number !== null;
}

/** The register's row: the voucher, plus who it came from. */
export const advanceRowSchema = advanceSchema.extend({ customerId: z.string() });
export type AdvanceRow = z.infer<typeof advanceRowSchema>;

export const advancesSchema = z.object({
  advances: z.array(advanceRowSchema),
  /**
   * Tax already paid on work not yet done — real money out of the bank against
   * a service still owed. Nobody reading "who owes us" would otherwise see it,
   * which is what makes a cash position flattering rather than true.
   */
  unadjustedTaxPaise: z.number().int().nonnegative(),
});

export type AdvancesData = z.infer<typeof advancesSchema>;

export const getAdvances = defineQuery<void, AdvancesData>({
  key: "advances.list",
  schema: advancesSchema,
  api: async () => apiFetch<AdvancesData>("/api/advances"),
  fixture: async () => {
    const state = (await import("./store")).getState();
    return { raw: { advances: state.advances, unadjustedTaxPaise: 0 } };
  },
});

export const settlementTargetsSchema = z.object({
  invoices: z.array(settlementTargetSchema),
});

/**
 * The invoice register.
 *
 * Named for what it is rather than for the first screen that wanted it: the
 * billing chooser asks what has been billed, the GST workspace builds an
 * export from it, and the advances panel picks a settlement target out of it.
 *
 * Fetched so the panel can offer **that customer's own** bills. It used to
 * offer whichever invoice was newest in the register, which is how an advance
 * came to be closable against a different customer entirely.
 */
export const getInvoiceRegister = defineQuery<void, { invoices: SettlementTarget[] }>({
  key: "invoices.register",
  schema: settlementTargetsSchema,
  api: async () => apiFetch<{ invoices: SettlementTarget[] }>("/api/invoices"),
  fixture: async () => ({ raw: { invoices: (await import("./store")).getState().invoices } }),
});

export type AdvanceTax = {
  /** The taxable value hiding inside the receipt. */
  taxablePaise: number;
  totalTaxPaise: number;
  cgstPaise: number | null;
  sgstPaise: number | null;
  igstPaise: number | null;
};

/**
 * Split a gross receipt into value and tax.
 *
 * The taxable value is rounded and the tax is taken as the remainder, so the
 * two always sum back to exactly what the customer paid — the same discipline
 * FR-812 imposes on an invoice, for the same reason.
 */
export function advanceTax(
  receiptPaise: number,
  ratePercent: number,
  head: "CGST_SGST" | "IGST",
): AdvanceTax {
  const taxablePaise = Math.round(
    (receiptPaise * 100) / (100 + ratePercent),
  );
  const totalTaxPaise = receiptPaise - taxablePaise;

  if (head === "IGST") {
    return {
      taxablePaise,
      totalTaxPaise,
      cgstPaise: null,
      sgstPaise: null,
      igstPaise: totalTaxPaise,
    };
  }

  // Halve, then give the odd paisa to CGST — never create or destroy one.
  const cgstPaise = Math.round(totalTaxPaise / 2);
  return {
    taxablePaise,
    totalTaxPaise,
    cgstPaise,
    sgstPaise: totalTaxPaise - cgstPaise,
    igstPaise: null,
  };
}

/**
 * `2026-04-18` as `18 Apr` — stored sortable, read as a date.
 *
 * The record keeps ISO because the list sorts on it; every other date in this
 * product is shown the way an Indian office writes one, and a raw ISO string in
 * the middle of that reads as a database leak.
 */
export function receivedWord(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** `RV/26-27/0007` — financial year, 1 April boundary, its own counter. */
export function receiptVoucherNumber(seq: number, now: Date): string {
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 3 ? year : year - 1;
  const label = `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
  return `RV/${label}/${String(seq).padStart(4, "0")}`;
}

/**
 * What still sits unadjusted, oldest first.
 *
 * Oldest first because an advance that has been open for months is the one
 * carrying tax already paid against a service still owed — the position an
 * auditor asks about.
 */
export function openAdvances<T extends Advance>(advances: readonly T[]): T[] {
  return advances
    .filter((advance) => advance.status === "OPEN")
    .slice()
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
}

/** Tax already paid on money for work not yet done. */
export function unadjustedTaxPaise(advances: readonly Advance[]): number {
  return openAdvances(advances).reduce(
    (sum, advance) =>
      sum + advanceTax(advance.receiptPaise, advance.ratePercent, advance.head).totalTaxPaise,
    0,
  );
}

/**
 * Adjust an open advance against an invoice.
 *
 * Returns the list unchanged when the advance is already adjusted — closing a
 * voucher twice would double-count the credit, and silently.
 */
export function adjustAdvance(
  advances: readonly Advance[],
  voucherNumber: string,
  invoiceNumber: string,
): Advance[] {
  return advances.map((advance) =>
    advance.voucherNumber === voucherNumber && advance.status === "OPEN"
      ? { ...advance, status: "ADJUSTED" as const, adjustedByInvoice: invoiceNumber }
      : advance,
  );
}

/** Two open, one already closed — enough to show both states at once. */
export const SEED_ADVANCES: Advance[] = [
  {
    id: "adv_1",
    voucherNumber: "RV/26-27/0005",
    contractId: "ctr_1",
    customer: "Shakti Industries",
    receivedOn: "2026-04-18",
    receiptPaise: 4_24_800_00,
    ratePercent: 18,
    head: "CGST_SGST",
    status: "OPEN",
    adjustedByInvoice: null,
  },
  {
    id: "adv_2",
    voucherNumber: "RV/26-27/0006",
    contractId: null,
    customer: "Grand Plaza Hotel",
    receivedOn: "2026-07-02",
    receiptPaise: 1_18_000_00,
    ratePercent: 18,
    head: "CGST_SGST",
    status: "OPEN",
    adjustedByInvoice: null,
  },
  {
    id: "adv_3",
    voucherNumber: "RV/26-27/0004",
    contractId: null,
    customer: "Mehta Textiles",
    receivedOn: "2026-04-05",
    receiptPaise: 59_000_00,
    ratePercent: 18,
    head: "IGST",
    status: "ADJUSTED",
    adjustedByInvoice: "SVC/26-27/0142",
  },
];
