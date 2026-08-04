/**
 * GST workspace — PRD §6.14, FR-814.
 *
 * **The one decision:** *can I file this period, and what is unresolved?*
 *
 * Not "here are your numbers". The accountant already has numbers; what he has
 * never had is a machine willing to say **no** with a reason. So the load-bearing
 * parts of this module are the two that refuse:
 *
 * 1. **`reconcile()`** — FR-814 requires a footing line proving the working
 *    paper agrees with the invoice register **to the paisa**. Not "approximately",
 *    not "rounded to the nearest rupee". A one-paisa gap is a real defect in a
 *    filing and the number that finds it is the difference, not the total.
 *
 * 2. **`exportReadiness()`** — §6.14: *"a partial GST export is worse than
 *    none"*. An export that silently omits two overridden invoices produces a
 *    return that looks filed and is wrong, and the taxpayer carries that. So the
 *    export is **blocked with the exact unresolved rows listed**, never a generic
 *    "validation failed".
 */
import { z } from "zod";
import { defineQuery, type Fetched } from "./source";

/* ------------------------------------------------------------- readiness */

/**
 * The checklist rows §6.14 names. A closed union because each one has a
 * different remedy, a different screen to open, and a different answer to "does
 * this stop me filing".
 */
export const READINESS_KINDS = [
  "MISSING_CODE",
  "OVERRIDDEN_POS",
  "UNADJUSTED_ADVANCE",
  "CREDIT_NOTE",
  "RCM_INWARD",
  "PENDING_IRN",
  "B2C_SMALL",
] as const;

export type ReadinessKind = (typeof READINESS_KINDS)[number];

export const READINESS_LABEL: Record<ReadinessKind, string> = {
  MISSING_CODE: "Invoices without a SAC/HSN code",
  OVERRIDDEN_POS: "Invoices with an overridden place of supply",
  UNADJUSTED_ADVANCE: "Advances received, not yet adjusted",
  CREDIT_NOTE: "Credit notes issued",
  RCM_INWARD: "Reverse-charge inward supplies",
  PENDING_IRN: "Documents pending IRN",
  B2C_SMALL: "B2C-small, aggregated",
};

/**
 * Whether a non-zero count **stops the filing**.
 *
 * The distinction that makes the checklist worth reading: a credit note is
 * information, a missing HSN code is a blocker. Rendering them identically —
 * which every generic "validation summary" does — forces the accountant to
 * remember which is which, and that is the job this screen took off him.
 */
export const BLOCKS_EXPORT: Record<ReadinessKind, boolean> = {
  MISSING_CODE: true,
  // Not a blocker: an override is legitimate and stored with a reason. It needs
  // review before filing, which is a different thing from being wrong.
  OVERRIDDEN_POS: false,
  UNADJUSTED_ADVANCE: true,
  CREDIT_NOTE: false,
  RCM_INWARD: false,
  PENDING_IRN: true,
  B2C_SMALL: false,
};

/** What to do about it — a link with a verb, never a bare count. */
export const READINESS_ACTION: Record<ReadinessKind, string> = {
  MISSING_CODE: "Add codes",
  OVERRIDDEN_POS: "Review overrides",
  UNADJUSTED_ADVANCE: "Adjust advances",
  CREDIT_NOTE: "See credit notes",
  RCM_INWARD: "See inward supplies",
  PENDING_IRN: "Retry IRN",
  B2C_SMALL: "See aggregation",
};

const readinessSchema = z.object({
  kind: z.enum(READINESS_KINDS),
  count: z.number().int().nonnegative(),
  href: z.string(),
});

export type ReadinessRow = z.infer<typeof readinessSchema>;

/* --------------------------------------------------------- GSTR-1 tables */

const tableSchema = z.object({
  /** `B2B`, `B2CS`, `CDNR`, `AT`, `HSN` — the return's own table names. */
  code: z.string(),
  label: z.string(),
  documents: z.number().int().nonnegative(),
  taxablePaise: z.number().int(),
  taxPaise: z.number().int(),
  /**
   * Null when this table failed to compute. §6.14's partial state: the table
   * shows an inline error and the export is disabled with the reason named —
   * it is **not** silently treated as zero, which would export a wrong return.
   */
  failed: z.boolean(),
});

export type Gstr1Table = z.infer<typeof tableSchema>;

export const gstPeriodSchema = z.object({
  periodLabel: z.string(),
  /** What the invoice register says, independently of the tables. */
  registerTaxablePaise: z.number().int(),
  registerTaxPaise: z.number().int(),
  registerDocuments: z.number().int().nonnegative(),
  tables: z.array(tableSchema),
  readiness: z.array(readinessSchema),
});

export type GstPeriod = z.infer<typeof gstPeriodSchema>;

/**
 * FR-814's footing line.
 *
 * Sums the tables and compares with the register **in paise**. `balanced` is an
 * exact equality, deliberately: a tolerance is how a reconciliation stops being
 * one. The differences are signed so the reader knows which side is short.
 */
export type Reconciliation = {
  tableTaxablePaise: number;
  tableTaxPaise: number;
  taxableDifferencePaise: number;
  taxDifferencePaise: number;
  balanced: boolean;
  /** True when any table failed, so the sum is not even a candidate. */
  incomplete: boolean;
};

export function reconcile(period: GstPeriod): Reconciliation {
  const usable = period.tables.filter((table) => !table.failed);
  const incomplete = usable.length !== period.tables.length;

  const tableTaxablePaise = usable.reduce((sum, t) => sum + t.taxablePaise, 0);
  const tableTaxPaise = usable.reduce((sum, t) => sum + t.taxPaise, 0);

  const taxableDifferencePaise = tableTaxablePaise - period.registerTaxablePaise;
  const taxDifferencePaise = tableTaxPaise - period.registerTaxPaise;

  return {
    tableTaxablePaise,
    tableTaxPaise,
    taxableDifferencePaise,
    taxDifferencePaise,
    // A failed table cannot balance, even if the arithmetic happens to agree.
    balanced:
      !incomplete && taxableDifferencePaise === 0 && taxDifferencePaise === 0,
    incomplete,
  };
}

/**
 * Can this period be exported, and if not, exactly why.
 *
 * §6.14 forbids a generic failure message here. Every reason is a specific,
 * countable thing with somewhere to go, because "validation failed" sends the
 * accountant back to the invoice list to guess.
 */
export type ExportReadiness =
  | { kind: "ready" }
  | { kind: "blocked"; reasons: string[] };

export function exportReadiness(period: GstPeriod): ExportReadiness {
  const reasons: string[] = [];

  for (const row of period.readiness) {
    if (row.count > 0 && BLOCKS_EXPORT[row.kind]) {
      // Lower-case only the first character. `.toLowerCase()` on the whole
      // label turned "SAC/HSN" into "sac/hsn", which reads as a typo in a
      // document an accountant may forward to a CA.
      const label = READINESS_LABEL[row.kind];
      reasons.push(`${row.count} ${label.charAt(0).toLowerCase()}${label.slice(1)}`);
    }
  }

  for (const table of period.tables) {
    if (table.failed) {
      reasons.push(`Table ${table.code} could not be computed`);
    }
  }

  const balance = reconcile(period);
  if (!balance.incomplete && !balance.balanced) {
    // The difference, not the totals. "₹0.20 out" is actionable; two large
    // numbers that happen to differ are not.
    reasons.push(
      `Working paper is out by ${formatPaiseDelta(balance.taxableDifferencePaise)} taxable and ${formatPaiseDelta(balance.taxDifferencePaise)} tax`,
    );
  }

  return reasons.length === 0 ? { kind: "ready" } : { kind: "blocked", reasons };
}

/** `₹0.20 over` / `₹1.05 short` — a signed gap read as a word. */
export function formatPaiseDelta(paise: number): string {
  if (paise === 0) return "₹0.00";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `₹${rupees.toLocaleString("en-IN")}.${fraction} ${paise > 0 ? "over" : "short"}`;
}

/* ---------------------------------------------------------------- query */

const FIXTURE: GstPeriod = {
  periodLabel: "July 2026",
  // Deliberately reconciles exactly — the happy path has to be provable too,
  // otherwise the footing line is never seen in its passing state.
  registerTaxablePaise: 18_42_600_00,
  registerTaxPaise: 3_31_668_00,
  registerDocuments: 64,
  tables: [
    {
      code: "B2B",
      label: "Registered customers",
      documents: 41,
      taxablePaise: 14_20_000_00,
      taxPaise: 2_55_600_00,
      failed: false,
    },
    {
      code: "B2CS",
      label: "Unregistered, small — aggregated by state and rate",
      documents: 18,
      taxablePaise: 3_10_600_00,
      taxPaise: 55_908_00,
      failed: false,
    },
    {
      code: "CDNR",
      label: "Credit notes, registered",
      documents: 3,
      taxablePaise: -22_000_00,
      taxPaise: -3_960_00,
      failed: false,
    },
    {
      code: "AT",
      label: "Advances received, tax paid",
      documents: 2,
      taxablePaise: 1_34_000_00,
      taxPaise: 24_120_00,
      failed: false,
    },
  ],
  readiness: [
    { kind: "MISSING_CODE", count: 0, href: "/money" },
    // Non-zero but not blocking — legitimate, needs review before filing.
    { kind: "OVERRIDDEN_POS", count: 2, href: "/money" },
    { kind: "UNADJUSTED_ADVANCE", count: 0, href: "/money" },
    { kind: "CREDIT_NOTE", count: 3, href: "/money" },
    { kind: "RCM_INWARD", count: 1, href: "/money" },
    { kind: "PENDING_IRN", count: 0, href: "/money" },
    { kind: "B2C_SMALL", count: 18, href: "/money" },
  ],
};

export const getGstPeriod = defineQuery<void, GstPeriod>({
  key: "gst.period",
  schema: gstPeriodSchema,
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});
