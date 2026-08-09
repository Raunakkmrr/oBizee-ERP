import { z } from "zod";
import { apiFetch } from "../api/client";
import { defineQuery } from "./source";

/**
 * Document numbering — FR-811.
 *
 * > *"Statutory gapless numbering per (tenant, branch, doc_type, financial
 * > year)."*
 *
 * **What was wrong.** Three modules each rolled their own counter — `jobNumber`,
 * `invoiceNumber`, `receiptVoucherNumber` — off a single flat `seq` object. Two
 * defects followed from that, and both are the kind a filing finds rather than a
 * test:
 *
 * 1. **The counter never reset on 1 April.** The financial-year label rolled to
 *    `27-28` while the number carried on from 149, so the first invoice of the
 *    new year was `SVC/27-28/0150`. A GST series must start at 1 each year.
 * 2. **The branch was not part of the key.** One counter across branches means
 *    two branches issuing the same number, or one branch's series full of gaps
 *    it cannot explain.
 *
 * A gap is not a cosmetic problem: §31 requires a consecutive series, and a
 * missing number is a document the department presumes was issued and
 * suppressed. So the counter is keyed, the year boundary is 1 April, and
 * `gapsIn` exists to prove the series is intact rather than assume it.
 *
 * **What this cannot do without a backend.** Real gaplessness needs a
 * transactional sequence — two people billing at once must not both take 0150.
 * The store is single-writer, so the invariant holds today; DR-9 defers the
 * database sequence, and `SERIES_NEEDS_BACKEND` names that rather than letting
 * an in-memory counter pass for a statutory one.
 */

export const SERIES_NEEDS_BACKEND =
  "Numbers are issued in this browser. A shared statutory sequence needs the backend (FR-811, DR-9).";

export const DOC_TYPES = ["job", "invoice", "receipt_voucher"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** The Indian financial year containing a date — 1 April to 31 March. */
export function financialYear(on: Date): { start: number; label: string } {
  const start = on.getMonth() >= 3 ? on.getFullYear() : on.getFullYear() - 1;
  return {
    start,
    label: `${String(start).slice(2)}-${String(start + 1).slice(2)}`,
  };
}

/** `brn_0001:invoice:2026` — the composite key FR-811 names. */
export function seriesKey(
  branchId: string,
  docType: DocType,
  on: Date,
): string {
  return `${branchId}:${docType}:${financialYear(on).start}`;
}

export const seriesStateSchema = z.record(z.string(), z.number().int().nonnegative());
export type SeriesState = z.infer<typeof seriesStateSchema>;

export type Issued = {
  number: string;
  /** The counter after issuing — the caller stores this back. */
  next: SeriesState;
  sequence: number;
};

/**
 * Take the next number in a series.
 *
 * Pure: it returns the new counter rather than mutating one, so the reducer
 * stays a reducer and "what number would this be" is answerable without
 * issuing it.
 */
export function issue(
  state: SeriesState,
  branch: { id: string; jobSeriesPrefix: string; invoiceSeriesPrefix: string },
  docType: DocType,
  on: Date,
): Issued {
  const key = seriesKey(branch.id, docType, on);
  const sequence = (state[key] ?? 0) + 1;
  return {
    number: format(branch, docType, on, sequence),
    next: { ...state, [key]: sequence },
    sequence,
  };
}

/** What the next number *would* be, without taking it. */
export function peek(
  state: SeriesState,
  branch: { id: string; jobSeriesPrefix: string; invoiceSeriesPrefix: string },
  docType: DocType,
  on: Date,
): string {
  return format(branch, docType, on, (state[seriesKey(branch.id, docType, on)] ?? 0) + 1);
}

function format(
  branch: { jobSeriesPrefix: string; invoiceSeriesPrefix: string },
  docType: DocType,
  on: Date,
  sequence: number,
): string {
  const fy = financialYear(on);
  const nnnn = String(sequence).padStart(4, "0");

  switch (docType) {
    case "job":
      // A job number is spoken on the phone (FR-210), so it stays short and
      // month-shaped rather than carrying a financial year nobody says aloud.
      return `${branch.jobSeriesPrefix}-${String(on.getFullYear()).slice(2)}${String(
        on.getMonth() + 1,
      ).padStart(2, "0")}-${nnnn}`;
    case "invoice":
      return `${branch.invoiceSeriesPrefix}/${fy.label}/${nnnn}`;
    case "receipt_voucher":
      // Its own series — §31(3)(d) makes a Receipt Voucher a different document
      // from a tax invoice, and sharing a counter breaks both.
      return `RV/${fy.label}/${nnnn}`;
  }
}

/**
 * The missing numbers in a range of issued documents.
 *
 * Takes the numbers actually present, not a counter — inferring gaps from a
 * counter would report the counter, not the documents, which is exactly the
 * assurance that is worthless.
 *
 * `from` exists because a real tenant's series does not begin at 1 in the data
 * you happen to hold: this build seeds mid-year at 149, and checking from 1
 * would report 148 fabricated holes on a fresh install. Passing the lowest
 * number actually present keeps the answer about documents that exist.
 */
export function gapsIn(
  issuedSequences: readonly number[],
  from: number,
  to: number,
): number[] {
  const present = new Set(issuedSequences);
  const missing: number[] = [];
  for (let n = from; n <= to; n += 1) {
    if (!present.has(n)) missing.push(n);
  }
  return missing;
}

/** The trailing number of `SVC/26-27/0150` — for gap checking. */
export function sequenceOf(number: string): number | null {
  const match = /(\d+)$/.exec(number);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

export const numberingSchema = z.object({
  financialYear: z.number().int(),
  branches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      jobSeriesPrefix: z.string(),
      invoiceSeriesPrefix: z.string(),
    }),
  ),
  counters: z.array(
    z.object({
      branchId: z.string(),
      docType: z.enum(["job", "invoice", "receipt_voucher"]),
      lastIssued: z.number().int().nonnegative(),
      next: z.number().int().positive(),
      issuedCount: z.number().int().nonnegative(),
      /** Numbers drawn and never used — the §31 question, found before an auditor does. */
      gaps: z.array(z.number().int()),
    }),
  ),
});

export type Numbering = z.infer<typeof numberingSchema>;

/**
 * The series, as the register holds them.
 *
 * Gap detection moved to the API with the data: comparing a counter against
 * whatever a browser happened to have loaded reports absences as gaps.
 */
export const getNumbering = defineQuery<void, Numbering>({
  key: "settings.numbering",
  schema: numberingSchema,
  api: async () => apiFetch<Numbering>("/api/settings/numbering"),
  fixture: async () => ({
    raw: { financialYear: new Date().getFullYear(), branches: [], counters: [] },
  }),
});
