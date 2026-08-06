/**
 * Contracts (AMC) — PRD §4.3, §5.5, §6.14, and FR-1406.
 *
 * **The decision the detail screen serves** (§6.14): *is this contract being
 * delivered, and is it billed?*
 *
 * Two structural points the PRD is emphatic about, and which most tools get
 * wrong:
 *
 * 1. **Billing frequency is independent of the visit schedule** (FR-505). "A
 *    monthly visit schedule with annual upfront billing is the most common
 *    combination in this market and must not be forced into per-visit billing."
 *    So they are two separate fields, never derived from one another.
 *
 * 2. **A contract carries MANY visit schedules** (FR-1406, from the design-partner
 *    research). Frequency is not one recurrence rule — for any scoped commitment
 *    it is a matrix with an independent cadence per cell. A lift firm servicing
 *    four lifts monthly and two quarterly under one AMC has exactly this shape.
 */
import { z } from "zod";
import { asPaise, type Paise } from "@/lib/money";
import { defineQuery, type Fetched } from "./source";

/** FR-501's recurrence list — validated by the design-partner research. */
export const RECURRENCES = [
  "WEEKLY",
  "FORTNIGHTLY",
  "MONTHLY",
  "ALTERNATE_MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
] as const;

export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  WEEKLY: "Weekly",
  FORTNIGHTLY: "Fortnightly",
  MONTHLY: "Monthly",
  // The pattern generic products miss — every two months, six visits a year.
  ALTERNATE_MONTHLY: "Alternate monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  ANNUAL: "Annual",
};

/** FR-505's billing schedule — deliberately its own axis. */
export const BILLING_FREQUENCIES = [
  "UPFRONT_ANNUAL",
  "HALF_YEARLY",
  "QUARTERLY",
  "MONTHLY",
  "PER_VISIT",
] as const;

export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

export const BILLING_LABEL: Record<BillingFrequency, string> = {
  UPFRONT_ANNUAL: "Yearly, upfront",
  HALF_YEARLY: "Half-yearly",
  QUARTERLY: "Quarterly",
  MONTHLY: "Monthly",
  PER_VISIT: "Per visit",
};

/** FR-504: coverage decides whether a consumed part becomes a billable line. */
export const COVERAGES = [
  "COMPREHENSIVE",
  "NON_COMPREHENSIVE",
  "LABOUR_ONLY",
] as const;

export type Coverage = (typeof COVERAGES)[number];

export const COVERAGE_LABEL: Record<Coverage, string> = {
  COMPREHENSIVE: "Comprehensive — parts included",
  NON_COMPREHENSIVE: "Non-comprehensive — parts billed",
  LABOUR_ONLY: "Labour only, with exclusions",
};

/**
 * How many visits a recurrence produces in a year. `ALTERNATE_MONTHLY` is the
 * one worth stating: **six, not twelve** (FR-501's acceptance criterion).
 */
export const VISITS_PER_YEAR: Record<Recurrence, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  ALTERNATE_MONTHLY: 6,
  QUARTERLY: 4,
  HALF_YEARLY: 2,
  ANNUAL: 1,
};

/** How many invoices a billing frequency produces in a year. */
export const INVOICES_PER_YEAR: Record<BillingFrequency, number | "per_visit"> =
  {
    UPFRONT_ANNUAL: 1,
    HALF_YEARLY: 2,
    QUARTERLY: 4,
    MONTHLY: 12,
    PER_VISIT: "per_visit",
  };

/* -------------------------------------------------------- billing schedule */

/**
 * When a contract owes its invoices, and which of them have been raised.
 *
 * **The gap this closes.** The model already knew a monthly AMC produces twelve
 * invoices — `INVOICES_PER_YEAR`, `perInvoiceAmount`, `anchorDay` were all
 * here. Nothing ever produced one. A six-month contract billed monthly sat in
 * the product knowing it owed six invoices, and the only way to raise one was
 * from a *job*, which for an advance-billed contract does not exist yet. So the
 * office either remembered every month or did not bill.
 *
 * Dates are computed from the contract's own start date rather than stored, so
 * a schedule cannot drift from the contract it belongs to.
 */
export type BillingPoint = {
  /** 1-based, as an accountant counts them: "invoice 2 of 12". */
  number: number;
  of: number;
  /** The day the invoice is owed. */
  due: Date;
  amountPaise: number;
  /** Set once an invoice exists for this point. */
  raised: boolean;
};

const MONTHS_BETWEEN: Record<BillingFrequency, number | null> = {
  UPFRONT_ANNUAL: 12,
  HALF_YEARLY: 6,
  QUARTERLY: 3,
  MONTHLY: 1,
  // Per-visit billing follows the visit, not the calendar, so it has no
  // schedule of its own — the job raises the invoice.
  PER_VISIT: null,
};

/** Parses the fixture's `1 Aug 2026`. Null when unreadable, never a guess. */
export function parseDateWord(word: string): Date | null {
  const parsed = Date.parse(word);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Adds whole months, clamping to the end of a short month.
 *
 * A contract anchored on the 31st bills on the 28th in February — not on the
 * 3rd of March, which is what naive date arithmetic produces and what would
 * silently move a GST document into the wrong return period.
 */
function addMonths(from: Date, months: number): Date {
  const target = new Date(from);
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

export function billingSchedule(
  contract: Contract,
  /** Invoice numbers already raised against this contract. */
  raisedCount: number,
): BillingPoint[] {
  const step = MONTHS_BETWEEN[contract.billing];
  const start = parseDateWord(contract.startDate);
  if (step === null || start === null) return [];

  // Over the contract's own term, not a fixed year — a six-month contract owes
  // six monthly invoices, not twelve.
  const months = Math.max(1, Math.round(contract.termDays / 30.44));
  const count = Math.max(1, Math.floor(months / step));

  const visitsPerYear = contract.schedules.reduce(
    (sum, schedule) => sum + VISITS_PER_YEAR[schedule.recurrence],
    0,
  );
  const amount = perInvoiceAmount(
    contract.annualValuePaise,
    contract.billing,
    visitsPerYear || 1,
  );

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    of: count,
    due: addMonths(start, index * step),
    amountPaise: amount,
    raised: index < raisedCount,
  }));
}

export type BillingDue = {
  contract: Contract;
  point: BillingPoint;
  /** Negative means not yet due. */
  daysLate: number;
};

/**
 * Everything a contract owes that has not been raised, soonest first.
 *
 * Upcoming points are included rather than filtered out: an accountant working
 * a week ahead needs to see what is coming, and a list that only ever shows
 * overdue work teaches people that being late is the normal state.
 */
export function billingDue(
  contracts: readonly Contract[],
  raisedByContract: Readonly<Record<string, number>>,
  today: Date,
  /** How far ahead to look. */
  horizonDays = 45,
): BillingDue[] {
  const rows: BillingDue[] = [];

  for (const contract of contracts) {
    if (contract.status !== "ACTIVE") continue;
    const points = billingSchedule(contract, raisedByContract[contract.id] ?? 0);
    for (const point of points) {
      if (point.raised) continue;
      const daysLate = Math.floor(
        (today.getTime() - point.due.getTime()) / 86_400_000,
      );
      if (daysLate < -horizonDays) continue;
      rows.push({ contract, point, daysLate });
    }
  }

  // Most overdue first; the ones that have not come due sit below.
  return rows.sort((a, b) => b.daysLate - a.daysLate);
}

/**
 * FR-810: money received before the service is performed is an **advance for a
 * service**, taxable on receipt, and requires a sequentially-numbered Receipt
 * Voucher. Only upfront schedules trigger it.
 */
export function needsReceiptVoucher(billing: BillingFrequency): boolean {
  return billing === "UPFRONT_ANNUAL" || billing === "HALF_YEARLY";
}

/** Per-invoice amount for a contract value and billing frequency. */
export function perInvoiceAmount(
  annualValuePaise: number,
  billing: BillingFrequency,
  visitsPerYear: number,
): Paise {
  const count =
    INVOICES_PER_YEAR[billing] === "per_visit"
      ? visitsPerYear
      : (INVOICES_PER_YEAR[billing] as number);
  // Integer division in paise; the remainder rides on the first invoice rather
  // than being lost, so the year's invoices sum to the contract value exactly.
  return asPaise(Math.floor(annualValuePaise / count));
}

/**
 * Is a schedule behind, and by how much?
 *
 * **Delivery is measured against elapsed time, not against the annual total.**
 * The first version of this screen flagged a contract as "behind schedule"
 * because 3 of 12 visits were done — on the contract's **second day**. Every
 * healthy new contract would have shown the warning, which trains the owner to
 * ignore it, and the one contract genuinely being under-delivered would be
 * indistinguishable from the eleven that are fine.
 *
 * `termDays` and `daysRemaining` give the elapsed fraction; expected visits is
 * that fraction of the commitment, floored — a visit is a discrete event, and
 * being "0.7 visits behind" is not something anyone can act on.
 */
export type ScheduleProgress = {
  visitsDone: number;
  visitsCommitted: number;
  expectedByNow: number;
  behindBy: number;
  isBehind: boolean;
};

export function scheduleProgress(
  schedule: Pick<ContractSchedule, "visitsDone" | "visitsCommitted">,
  termDays: number,
  daysRemaining: number,
): ScheduleProgress {
  const elapsed = Math.max(0, Math.min(termDays, termDays - daysRemaining));
  const fraction = termDays > 0 ? elapsed / termDays : 0;
  const expectedByNow = Math.floor(schedule.visitsCommitted * fraction);
  const behindBy = Math.max(0, expectedByNow - schedule.visitsDone);
  return {
    visitsDone: schedule.visitsDone,
    visitsCommitted: schedule.visitsCommitted,
    expectedByNow,
    behindBy,
    isBehind: behindBy > 0,
  };
}

/* ---------------------------------------------------------------- contract */

const scheduleSchema = z.object({
  id: z.string(),
  /** What this schedule covers — the "scope" half of FR-1406's matrix. */
  scope: z.string(),
  recurrence: z.enum(RECURRENCES),
  anchorDay: z.number().int().min(1).max(31),
  visitsDone: z.number().int().nonnegative(),
  visitsCommitted: z.number().int().positive(),
});

const contractSchema = z.object({
  id: z.string(),
  reference: z.string(),
  customer: z.string(),
  site: z.string(),
  annualValuePaise: z.number().int(),
  coverage: z.enum(COVERAGES),
  billing: z.enum(BILLING_FREQUENCIES),
  startDate: z.string(),
  endDate: z.string(),
  /** Contract length in days — the denominator for delivery-vs-elapsed. */
  termDays: z.number().int().positive(),
  daysRemaining: z.number().int(),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED"]),
  /** FR-1406: many schedules, each with its own scope and cadence. */
  schedules: z.array(scheduleSchema),
});

export const contractsSchema = z.object({
  contracts: z.array(contractSchema),
});

export type Contract = z.infer<typeof contractSchema>;
export type ContractSchedule = z.infer<typeof scheduleSchema>;

export const SEED_CONTRACTS = {
  contracts: [
    {
      id: "ctr_1",
      reference: "AMC-2627-0031",
      customer: "Shakti Industries",
      site: "Plot 14, MIDC Phase II · Okhla Phase II",
      annualValuePaise: 3_60_000_00,
      coverage: "COMPREHENSIVE" as const,
      billing: "UPFRONT_ANNUAL" as const,
      startDate: "1 Aug 2026",
      endDate: "31 Jul 2027",
      termDays: 365,
      // Day 2 of the term — nothing can be behind yet, which is exactly the
      // false positive the old `pct < 50` rule produced here.
      daysRemaining: 364,
      status: "ACTIVE" as const,
      // FR-1406 in the fixture: one contract, two cadences.
      schedules: [
        {
          id: "sch_1",
          scope: "6 cassette ACs — servicing",
          recurrence: "MONTHLY" as const,
          anchorDay: 15,
          visitsDone: 3,
          visitsCommitted: 12,
        },
        {
          id: "sch_2",
          scope: "2 chillers — preventive",
          recurrence: "QUARTERLY" as const,
          anchorDay: 15,
          visitsDone: 1,
          visitsCommitted: 4,
        },
      ],
    },
    {
      id: "ctr_2",
      reference: "AMC-2627-0028",
      customer: "Deshmukh Hospital",
      site: "Saket",
      annualValuePaise: 7_20_000_00,
      coverage: "NON_COMPREHENSIVE" as const,
      billing: "QUARTERLY" as const,
      startDate: "1 Jun 2026",
      endDate: "31 May 2027",
      termDays: 365,
      daysRemaining: 302,
      status: "ACTIVE" as const,
      schedules: [
        {
          id: "sch_3",
          scope: "Generator AMC",
          recurrence: "ALTERNATE_MONTHLY" as const,
          anchorDay: 1,
          visitsDone: 5,
          visitsCommitted: 6,
        },
      ],
    },
    {
      // S10: a contract that is *genuinely* under-delivered, so the warning
      // state is exercised by a real case rather than by a false positive.
      // Ten months elapsed on a 12-visit commitment with 4 done — six behind.
      id: "ctr_3",
      reference: "AMC-2627-0009",
      customer: "Sunrise Apartments RWA",
      site: "Tower B, Sector 44 · Gurugram",
      annualValuePaise: 1_80_000_00,
      coverage: "LABOUR_ONLY" as const,
      billing: "MONTHLY" as const,
      startDate: "1 Oct 2025",
      endDate: "30 Sep 2026",
      termDays: 364,
      daysRemaining: 59,
      status: "ACTIVE" as const,
      schedules: [
        {
          id: "sch_4",
          scope: "12 split ACs — servicing",
          recurrence: "MONTHLY" as const,
          anchorDay: 1,
          visitsDone: 4,
          visitsCommitted: 12,
        },
        {
          // On track, in the same contract — so the card has to show one
          // schedule failing without tarring the other (FR-1406).
          id: "sch_5",
          scope: "Water tank cleaning",
          recurrence: "QUARTERLY" as const,
          anchorDay: 1,
          visitsDone: 3,
          visitsCommitted: 4,
        },
      ],
    },
  ],
};

export const getContracts = defineQuery<void, z.infer<typeof contractsSchema>>({
  key: "contracts.list",
  schema: contractsSchema,
  fixture: async (): Promise<Fetched<unknown>> => ({
    raw: { contracts: (await import("./store")).getState().contracts },
  }),
});
