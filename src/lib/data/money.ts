/**
 * Money — PRD §6.12. Two sides of one screen: *they owe us* and *we owe them*.
 *
 * The two rules that make this more than a dunning module:
 *
 * 1. **A customer with an unbroken promise is excluded from reminders** and
 *    shown in a `Promised` group (FR-904). "Auto-reminding someone who has
 *    already promised is how MSMEs damage relationships." A generic collections
 *    tool does not have this restraint; it is deliberate.
 *
 * 2. **§43B(h)**: pay a micro or small supplier late and the expense stops being
 *    deductible **this year**. The owner's CA tells him in October about an
 *    April bill. The rupee figure at the top of the payables tab is the whole
 *    pitch of the screen.
 */
import { z } from "zod";
import { apiFetch } from "../api/client";
import { defineQuery, type Fetched } from "./source";

/* ------------------------------------------------------------ receivables */

/** §6.12.1's six ageing buckets, in order. Each cell is a filter. */
/**
 * Something has been received, and something is still owed.
 *
 * Not `paidPaise > 0` alone: an invoice settled in full is not on this list at
 * all, so the interesting case is strictly between the two — and it is the one
 * FR-901 calls normal and the one the firm keeps issuing a second invoice for.
 */
export function isPartPaid(row: { billedPaise: number; paidPaise: number }): boolean {
  return row.paidPaise > 0 && row.paidPaise < row.billedPaise;
}

export const AGEING_BUCKETS = [
  "0–15",
  "16–30",
  "31–45",
  "46–60",
  "61–90",
  "90+",
] as const;

export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function bucketFor(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 15) return "0–15";
  if (daysOverdue <= 30) return "16–30";
  if (daysOverdue <= 45) return "31–45";
  if (daysOverdue <= 60) return "46–60";
  if (daysOverdue <= 90) return "61–90";
  return "90+";
}

const receivableSchema = z.object({
  id: z.string(),
  customer: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  daysOverdue: z.number().int().nonnegative(),
  amountPaise: z.number().int(),
  /**
   * What the invoice was for, and what has come in against it.
   *
   * A ₹3,080 balance on a ₹7,080 invoice and a ₹3,080 invoice nobody has
   * touched are the same number and completely different conversations. Without
   * these the collections list could not tell a customer who has paid most of
   * it from one who has paid nothing.
   *
   * Defaulted so older fixtures still parse; `billedPaise` of 0 simply means
   * "unknown", and the part-paid test below treats it as not part-paid.
   */
  billedPaise: z.number().int().nonnegative().default(0),
  paidPaise: z.number().int().nonnegative().default(0),
  /**
   * The GST already handed over against this uncollected money.
   *
   * §13(2) made the whole liability fall due when the invoice was issued,
   * whatever had been collected, so this is the share of it sitting against
   * money that has not arrived.
   */
  taxOnUncollectedPaise: z.number().int().nonnegative().default(0),
  lastContact: z.string().nullable(),
  /**
   * The number to chase on. Added because `Remind` and `Log call` existed as
   * buttons with nothing behind them — a chase list whose rows carry no phone
   * number cannot do the one thing it is for.
   */
  phone: z.string().nullable(),
  /**
   * A promise, if one was made. `broken` is derived by the caller against
   * today's date — a promise whose date has passed is no protection.
   */
  promise: z
    .object({ dateWord: z.string(), broken: z.boolean() })
    .nullable(),
});

export type Receivable = z.infer<typeof receivableSchema>;

/**
 * §6.12.1's sort: **amount × days overdue**. Neither alone is the right order —
 * a ₹5,000 invoice 200 days late and a ₹5,00,000 invoice 3 days late are both
 * mis-ranked by a single-key sort.
 */
export function collectionPriority(row: Receivable): number {
  return row.amountPaise * row.daysOverdue;
}

/**
 * FR-904. Splits the queue into who may be chased and who has promised.
 * An **unbroken** promise protects; a broken one returns the row to the chase
 * list, because the restraint was earned by the promise, not by having made one.
 */
export function splitByPromise(rows: Receivable[]): {
  chase: Receivable[];
  promised: Receivable[];
} {
  const chase: Receivable[] = [];
  const promised: Receivable[] = [];
  for (const row of rows) {
    if (row.promise !== null && !row.promise.broken) promised.push(row);
    else chase.push(row);
  }
  const byPriority = (a: Receivable, b: Receivable) =>
    collectionPriority(b) - collectionPriority(a);
  return { chase: chase.sort(byPriority), promised: promised.sort(byPriority) };
}

export function ageingTotals(
  rows: Receivable[],
): Record<AgeingBucket, { paise: number; count: number }> {
  const totals = Object.fromEntries(
    AGEING_BUCKETS.map((b) => [b, { paise: 0, count: 0 }]),
  ) as Record<AgeingBucket, { paise: number; count: number }>;
  for (const row of rows) {
    const cell = totals[bucketFor(row.daysOverdue)];
    cell.paise += row.amountPaise;
    cell.count += 1;
  }
  return totals;
}

/* --------------------------------------------------------------- payables */

/** §6.12.2's MSME classes, rendered as words on every row. */
export const MSME_CLASSES = [
  "MICRO",
  "SMALL",
  "MEDIUM",
  "NOT_REGISTERED",
  "UNVERIFIED",
] as const;

export type MsmeClass = (typeof MSME_CLASSES)[number];

export const MSME_LABEL: Record<MsmeClass, string> = {
  MICRO: "Micro",
  SMALL: "Small",
  MEDIUM: "Medium",
  NOT_REGISTERED: "Not registered",
  UNVERIFIED: "Unverified",
};

const payableSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  msmeClass: z.enum(MSME_CLASSES),
  udyamNumber: z.string().nullable(),
  /** §6.12.2: a trading registration does not attract the MSMED timeline. */
  udyamActivity: z.enum(["MANUFACTURING", "SERVICE", "TRADING"]).nullable(),
  hasWrittenAgreement: z.boolean(),
  billDate: z.string(),
  amountPaise: z.number().int(),
  daysElapsed: z.number().int().nonnegative(),
});

export type Payable = z.infer<typeof payableSchema>;

/**
 * The §43B(h) countdown for one bill.
 *
 * Modelled as a discriminated union so that **"we cannot calculate this"** is a
 * different shape from **"day 38 of 45"** — a suppressed countdown must never be
 * mistaken for a comfortable one, and an unverified vendor must never render a
 * confident number. FR-1301's reasoning applied to money.
 */
export type Countdown =
  | { kind: "counting"; day: number; limit: 15 | 45; basis: string }
  /**
   * Past the limit. **A separate shape, not a `counting` with a big number.**
   *
   * The deduction for this expense is gone for the financial year and no
   * payment now brings it back — which makes it categorically different from a
   * bill on day 38 of 45, where paying today still saves the money. Folding
   * both into `counting` let `deductionAtRiskPaise` add already-lost money to
   * the "at risk" headline: it understated the loss and overstated what could
   * still be saved, on the one screen where that distinction is the whole
   * point. The type now makes the mistake impossible to repeat.
   */
  | { kind: "lapsed"; day: number; limit: 15 | 45; basis: string }
  | { kind: "not_applicable"; reason: string }
  | { kind: "unknown"; reason: string };

export function countdownFor(bill: Payable): Countdown {
  if (bill.msmeClass === "UNVERIFIED") {
    // §6.12.2: grouped above the fold, because an unverified vendor is an
    // unquantified risk — not a zero one.
    return {
      kind: "unknown",
      reason: "Udyam status unknown — verify to see the deduction risk",
    };
  }
  if (bill.msmeClass === "MEDIUM" || bill.msmeClass === "NOT_REGISTERED") {
    return {
      kind: "not_applicable",
      reason: `${MSME_LABEL[bill.msmeClass]} — the MSMED payment timeline does not apply`,
    };
  }
  if (bill.udyamActivity === "TRADING") {
    return {
      kind: "not_applicable",
      reason:
        "Udyam registration is for trading — the MSMED payment timeline does not apply",
    };
  }
  // §15 of the MSMED Act: 45 days where there is a written agreement, 15 where
  // there is not. The basis is stated in words on the row, because the number
  // alone is not actionable — attaching an agreement changes it.
  const limit = bill.hasWrittenAgreement ? 45 : 15;
  const basis = bill.hasWrittenAgreement
    ? "45-day limit — written agreement on file"
    : "15-day limit — no written agreement on record";
  return {
    kind: bill.daysElapsed > limit ? "lapsed" : "counting",
    day: bill.daysElapsed,
    limit,
    basis,
  };
}

/** Days remaining, or `null` where a countdown is not running. */
export function daysLeft(countdown: Countdown): number | null {
  return countdown.kind === "counting" ? countdown.limit - countdown.day : null;
}

/**
 * How much deduction can **still be saved** by paying.
 *
 * Only `counting` bills contribute. A lapsed bill is money already gone, and an
 * unknown vendor's amount is not silently folded in either — that would make an
 * unquantified risk look quantified.
 */
export function deductionAtRiskPaise(bills: Payable[]): number {
  return bills.reduce((sum, bill) => {
    const countdown = countdownFor(bill);
    return countdown.kind === "counting" ? sum + bill.amountPaise : sum;
  }, 0);
}

/**
 * How much deduction is **already lost** for the year.
 *
 * Reported separately and never added to the at-risk figure: one number is a
 * warning you can act on, the other is a loss you can only learn from, and
 * summing them tells the owner neither.
 */
export function deductionLostPaise(bills: Payable[]): number {
  return bills.reduce((sum, bill) => {
    const countdown = countdownFor(bill);
    return countdown.kind === "lapsed" ? sum + bill.amountPaise : sum;
  }, 0);
}

/* ----------------------------------------------------------------- alarms */

/**
 * What is irreversible or running out — the band at the top of the screen.
 *
 * The §43B(h) clock used to live on the *second tab* of this screen, so a
 * deduction that had already lapsed was one click away from never being seen.
 * A deadline with a legal consequence does not belong behind a tab.
 *
 * Receivables are deliberately not alarms. An invoice ninety days late is bad,
 * but it is bad in a way that a chase list already handles and that does not
 * expire at midnight; putting it here would make the band routine, and a band
 * that is always full is a band nobody reads.
 */
export type MoneyAlarm =
  | { kind: "deduction_lost"; bill: Payable; day: number; limit: number }
  | { kind: "deduction_due"; bill: Payable; daysLeft: number }
  | { kind: "unverified_vendor"; bill: Payable };

/** Bills inside this many days of their limit are surfaced as an alarm. */
const DEADLINE_WINDOW_DAYS = 10;

export function moneyAlarms(bills: Payable[]): MoneyAlarm[] {
  const alarms: MoneyAlarm[] = [];

  for (const bill of bills) {
    const countdown = countdownFor(bill);
    if (countdown.kind === "lapsed") {
      alarms.push({
        kind: "deduction_lost",
        bill,
        day: countdown.day,
        limit: countdown.limit,
      });
    } else if (countdown.kind === "counting") {
      const left = countdown.limit - countdown.day;
      if (left <= DEADLINE_WINDOW_DAYS) {
        alarms.push({ kind: "deduction_due", bill, daysLeft: left });
      }
    } else if (countdown.kind === "unknown") {
      alarms.push({ kind: "unverified_vendor", bill });
    }
  }

  // Lost first — it is the most expensive sentence on the screen — then by how
  // little time is left, then by amount.
  const rank = { deduction_lost: 0, deduction_due: 1, unverified_vendor: 2 };
  return alarms.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.kind === "deduction_due" && b.kind === "deduction_due"
        ? a.daysLeft - b.daysLeft
        : 0) ||
      b.bill.amountPaise - a.bill.amountPaise,
  );
}

/* ---------------------------------------------------------------- queries */

export const moneySchema = z.object({
  receivables: z.array(receivableSchema),
  /**
   * GST already paid on money that has not arrived — totalled server-side so
   * every screen showing it shows the same figure.
   *
   * This is the number the firm asked about first, and nothing in the product
   * could answer it.
   */
  taxOnUncollectedPaise: z.number().int().nonnegative().default(0),
  payables: z.array(payableSchema),
  /** §6.12.3's empty state needs the upcoming figure, not just a zero. */
  dueNext15Paise: z.number().int(),
  /** §6.12.3's partial state: a stored status with a date is honest. */
  udyamVerifiedAsOf: z.string().nullable(),
});

export type MoneyData = z.infer<typeof moneySchema>;

export const SEED_MONEY = {
  receivables: [
    {
      id: "rcv_1",
      customer: "Grand Plaza Hotel",
      invoiceNumber: "INV-2627-0104",
      invoiceDate: "12 Jun 2026",
      daysOverdue: 21,
      amountPaise: 1_18_000_00,
      lastContact: "24 Jul — spoke to accounts, said next week",
      phone: "98110 34567",
      promise: null,
    },
    {
      id: "rcv_2",
      customer: "Deshmukh Hospital",
      invoiceNumber: "INV-2627-0098",
      invoiceDate: "2 Jun 2026",
      daysOverdue: 31,
      amountPaise: 2_40_000_00,
      // Unbroken promise — excluded from reminders (FR-904).
      lastContact: "24 Jul — promised 5 Aug",
      phone: "98110 77120",
      promise: { dateWord: "5 Aug", broken: false },
    },
    {
      id: "rcv_3",
      customer: "Sunrise Apartments",
      invoiceNumber: "INV-2627-0071",
      invoiceDate: "18 Apr 2026",
      daysOverdue: 96,
      amountPaise: 42_500_00,
      // A promise that has passed is no protection — back on the chase list.
      lastContact: "10 Jul — promised 20 Jul",
      phone: "98200 12345",
      promise: { dateWord: "20 Jul", broken: true },
    },
    {
      id: "rcv_4",
      customer: "Metro Retail",
      invoiceNumber: "INV-2627-0112",
      invoiceDate: "1 Jul 2026",
      daysOverdue: 8,
      amountPaise: 64_000_00,
      lastContact: null,
      phone: "98111 20455",
      promise: null,
    },
    {
      id: "rcv_5",
      customer: "Shakti Industries",
      invoiceNumber: "INV-2627-0089",
      invoiceDate: "26 May 2026",
      daysOverdue: 52,
      amountPaise: 86_400_00,
      lastContact: "19 Jul — no answer",
      phone: "98200 99887",
      promise: null,
    },
  ],
  payables: [
    {
      id: "pay_1",
      vendor: "Kumar Refrigeration Spares",
      msmeClass: "MICRO" as const,
      udyamNumber: "UDYAM-DL-05-0012345",
      udyamActivity: "MANUFACTURING" as const,
      hasWrittenAgreement: true,
      billDate: "26 Jun 2026",
      amountPaise: 38_200_00,
      daysElapsed: 38,
    },
    {
      id: "pay_2",
      vendor: "Delhi Chemical Traders",
      msmeClass: "SMALL" as const,
      udyamNumber: "UDYAM-DL-05-0067890",
      // Trading activity — countdown suppressed, stated in words.
      udyamActivity: "TRADING" as const,
      hasWrittenAgreement: false,
      billDate: "20 Jul 2026",
      amountPaise: 12_400_00,
      daysElapsed: 14,
    },
    {
      id: "pay_3",
      vendor: "Nehru Place Electricals",
      msmeClass: "SMALL" as const,
      udyamNumber: "UDYAM-DL-03-0044556",
      udyamActivity: "SERVICE" as const,
      // No agreement — 15 days, not 45. Already past it.
      hasWrittenAgreement: false,
      billDate: "16 Jul 2026",
      amountPaise: 26_000_00,
      daysElapsed: 18,
    },
    {
      id: "pay_4",
      vendor: "Ashoka Transport",
      msmeClass: "UNVERIFIED" as const,
      udyamNumber: null,
      udyamActivity: null,
      hasWrittenAgreement: false,
      billDate: "10 Jul 2026",
      amountPaise: 9_800_00,
      daysElapsed: 24,
    },
    {
      id: "pay_5",
      vendor: "Bharat Tools Pvt Ltd",
      msmeClass: "NOT_REGISTERED" as const,
      udyamNumber: null,
      udyamActivity: null,
      hasWrittenAgreement: true,
      billDate: "4 Jul 2026",
      amountPaise: 55_000_00,
      daysElapsed: 30,
    },
  ],
  dueNext15Paise: 86_400_00,
  udyamVerifiedAsOf: "12 Jul 2026",
};

export const getMoney = defineQuery<void, MoneyData>({
  key: "money.overview",
  schema: moneySchema,
  api: async () => apiFetch<MoneyData>("/api/money/overview"),
  /**
   * Read from the store, not from the constant.
   *
   * `Mark paid` is the action that saves a §43B(h) deduction — the single most
   * consequential button in the product — and it cannot be real while this
   * screen reads a frozen fixture. Money now lives in the store like leads and
   * the board, so paying a bill survives a reload and the alarm band recomputes
   * from the same facts.
   */
  fixture: async (): Promise<Fetched<unknown>> => {
    const { getState } = await import("./store");
    return { raw: getState().money };
  },
});

/**
 * An invoice as a screen renders it.
 *
 * The type existed in `store.ts` and was never a schema, because nothing
 * crossed a boundary to reach it. Now one does, and a document with a wrong
 * total is not something to find out about at print time.
 */
const invoiceLineSchema = z.object({
  description: z.string(),
  /** SAC for services, HSN for goods — one column, labelled `SAC/HSN`. */
  code: z.string(),
  kind: z.enum(["service", "goods"]),
  qty: z.number(),
  ratePaise: z.number().int(),
  /** Slab in whole percent: 0, 5, 18 or 40 (FR-804, GST 2.0). */
  ratePercent: z.number(),
});

export const invoiceSchema = z.object({
  id: z.string(),
  /** Null until issued — a draft is not a document anybody can refer to. */
  number: z.string().nullable(),
  jobId: z.string().nullable(),
  jobNumber: z.string().nullable(),
  contractId: z.string().nullable(),
  contractPoint: z.number().int().nullable(),
  customer: z.string(),
  /**
   * Who the bill is addressed to, as it stood when it was issued.
   *
   * Null when the customer is not on file — the screen says so rather than
   * printing somebody else's GSTIN, which is the defect this replaced.
   */
  billTo: z
    .object({
      gstin: z.string().nullable(),
      billingStateCode: z.string(),
      siteAddress: z.string(),
      siteLocality: z.string(),
      siteStateCode: z.string(),
      sitePincode: z.string(),
    })
    .nullable(),
  dateWord: z.string(),
  /**
   * The visit this bill is evidence for — §6.11.1's reason the accountant can
   * bill without opening the job.
   *
   * Optional on the schema, not because it is optional in the product, but
   * because the list endpoint does not carry it and the same shape validates
   * both. Null on an ad-hoc invoice, which has no visit behind it.
   */
  fromJob: z
    .object({
      dateWord: z.string().nullable(),
      technician: z.string().nullable(),
      serviceType: z.string().nullable(),
      signerName: z.string().nullable(),
      rating: z.number().int().nullable(),
      comment: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /**
   * What has been received against it, and what is still owed — FR-901.
   *
   * Derived from the payments, never stored, because partial payment is normal
   * in this business: an invoice carries many payments and its balance is the
   * arithmetic. A status field somebody has to remember to flip is the version
   * that goes wrong.
   *
   * Optional because the list endpoint does not carry them and one shape
   * validates both.
   */
  paidPaise: z.number().int().nonnegative().optional(),
  /**
   * What credit notes have taken off it — issued ones only.
   *
   * A draft credit note has promised the customer nothing and must not reduce
   * what they owe; a cancelled one never did.
   */
  creditedPaise: z.number().int().nonnegative().default(0),
  /**
   * The notes themselves, because the total cannot say the thing that matters.
   *
   * Since Rule 67B an issued credit note the customer has ignored has NOT
   * reduced the tax, and looks identical in a total to one that has.
   */
  /**
   * How long is left to raise a credit note — §34(2).
   *
   * `assumed` is the important field: when nobody has recorded the GSTR-9
   * filing date, this is the statute's outside date and the real window may be
   * months shorter. Presenting an assumption as a fact is how somebody misses
   * the deadline by six weeks and loses the tax for good.
   */
  creditWindow: z
    .object({
      deadline: z.string(),
      financialYear: z.number().int(),
      assumed: z.boolean(),
      daysLeft: z.number().int(),
      closed: z.boolean(),
    })
    .nullable()
    .optional(),
  creditNotes: z
    .array(
      z.object({
        id: z.string(),
        number: z.string().nullable(),
        grandTotalPaise: z.number().int(),
        reason: z.string(),
        status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]),
        imsState: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
        issueDate: z.string(),
      }),
    )
    .default([]),
  outstandingPaise: z.number().int().nonnegative().optional(),
  payments: z
    .array(
      z.object({
        id: z.string(),
        amountPaise: z.number().int(),
        method: z.string(),
        reference: z.string().nullable(),
        recordedBy: z.string().nullable(),
        dateWord: z.string(),
      }),
    )
    .optional(),
  head: z.enum(["CGST_SGST", "IGST"]),
  explanation: z.string(),
  lines: z.array(invoiceLineSchema),
  taxablePaise: z.number().int(),
  totalTaxPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  grandTotalPaise: z.number().int(),
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]),
});

export type Invoice = z.infer<typeof invoiceSchema>;

/**
 * One invoice, by id — the document a screen was sent to show.
 *
 * The review screen used to read "the latest invoice in the browser store".
 * That was fine while the store held every invoice the app had made; once the
 * register started issuing them the store stopped receiving any, and the
 * screen showed the cold-start example instead of the bill just raised. A
 * screen that was sent somewhere to show a specific document should be told
 * which one.
 */
export const getInvoice = defineQuery<string, Invoice>({
  key: "invoice.one",
  schema: invoiceSchema,
  api: async (id) => apiFetch<Invoice>(`/api/invoices/${id}`),
  fixture: async () => {
    const state = (await import("./store")).getState();
    const latest = state.invoices[state.invoices.length - 1];
    if (!latest) throw new Error("no invoice on file");
    return { raw: latest };
  },
});

/**
 * What the work has earned and nobody has billed.
 *
 * The flow this serves: a visit is booked, dated, assigned and done — and then
 * that period's invoice becomes available. Nothing here raises it. FR-805 makes
 * an invoice immutable once issued, so a document created by a rule is a
 * mistake that can only be cancelled, leaving a hole in a statutory series
 * somebody has to explain. This is the prompt; a person is still the author.
 */
export type BillablePeriod = {
  contractId: string;
  reference: string;
  customerId: string;
  customer: string;
  billing: string;
  /** Which instalment of the contract — the API numbers it, not the browser. */
  instalment: number;
  periodStart: string;
  periodEnd: string;
  valuePaise: number;
  visits: number;
  visitsDone: number;
  /**
   * `visits_complete` is a bill the customer is expecting. `period_closed` is
   * a period that ran out with visits missed — still owed, because cover was
   * sold and cover was available, but a conversation to have before sending.
   */
  reason: "visits_complete" | "period_closed";
};

const dueSchema = z.object({
  due: z.array(
    z.object({
      contractId: z.string(),
      reference: z.string(),
      customerId: z.string(),
      customer: z.string(),
      billing: z.string(),
      instalment: z.number().int().positive(),
      periodStart: z.string(),
      periodEnd: z.string(),
      valuePaise: z.number().int(),
      visits: z.number().int().nonnegative(),
      visitsDone: z.number().int().nonnegative(),
      reason: z.enum(["visits_complete", "period_closed"]),
    }),
  ),
  totalPaise: z.number().int(),
});

export const getDueInvoices = defineQuery<void, { due: BillablePeriod[]; totalPaise: number }>({
  key: "invoices.due",
  schema: dueSchema,
  api: async () => apiFetch<{ due: BillablePeriod[]; totalPaise: number }>("/api/invoices/due"),
  // Nothing in the browser store models a contract billing period, and an
  // invented one would put fictional money on the screen that matters most.
  fixture: async () => ({ raw: { due: [], totalPaise: 0 } }),
});
