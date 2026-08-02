/**
 * The primary post-login screen's data contract, fixture and query.
 *
 * The contract is written first and is the single source of truth (DR-9): it
 * validates the fixture today and the API response when the backend phase opens.
 * Contract, fixture and query live together because they are one unit of meaning
 * — a change to any of them must change the other two.
 *
 * Money is integer `Paise`. Anything a service could fail to compute is
 * `Computed<Paise>`, so a failed read renders an em-dash and never a plausible
 * zero (§6.3).
 */
import { z } from "zod";
import { asPaise, type Paise } from "@/lib/money";
import { computed, uncomputable, type Computed } from "./result";
import { defineQuery, type Fetched } from "./source";

/* ---------------------------------------------------------------- contract */

/**
 * Money on the wire: an integer count of paise.
 *
 * Deliberately **not** `z.number().int().brand<"paise">()`. Zod's `.brand()`
 * mints its own nominal type that does not unify with `Paise` from
 * `@/lib/money`, which would leave two incompatible brands for one concept and
 * force casts at every boundary. The schema's job is to enforce the *invariant*
 * — integer, never a float — and `asPaise` applies the app's brand once, at the
 * single point where wire data becomes domain data.
 */
const paiseSchema = z.number().int();

/** A figure that may be unavailable — mirrors `Computed<T>` on the wire. */
const computedPaiseSchema = z.union([
  z.object({ ok: z.literal(true), value: paiseSchema }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

const todaySchema = z.object({
  jobsToday: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  /** Null when nothing is waiting — distinct from "0 minutes". */
  oldestUnassignedMinutes: z.number().int().nonnegative().nullable(),
  collectedToday: computedPaiseSchema,
  collectedCount: z.number().int().nonnegative(),
  overdue: computedPaiseSchema,
  overdueInvoices: z.number().int().nonnegative(),
  overdueOldestDays: z.number().int().nonnegative().nullable(),
});

/** The kinds of thing that can demand a person's attention, in severity order. */
export const ATTENTION_KINDS = [
  "bad_rating",
  "lead_missed_followups",
  "parts_awaited_stalled",
  "sla_breach",
  "unsettled_cash",
] as const;

const attentionSchema = z.object({
  id: z.string(),
  kind: z.enum(ATTENTION_KINDS),
  /** A full sentence naming the person and the consequence. */
  sentence: z.string(),
  /** Supporting line — when it happened, how long it has been stuck. */
  detail: z.string(),
  actionLabel: z.string(),
  href: z.string(),
});

const comparisonSchema = z.object({
  label: z.string(),
  current: z.string(),
  previous: z.string(),
  /** Stated in words because a falling number can be good. */
  changeWord: z.string(),
  direction: z.enum(["up", "down", "flat"]),
  /** Whether this movement is good, which direction alone cannot say. */
  better: z.boolean(),
});

const ageingBucketSchema = z.object({
  label: z.string(),
  amount: computedPaiseSchema,
  count: z.number().int().nonnegative(),
});

const comingUpSchema = z.object({
  ageing: z.array(ageingBucketSchema),
  renewalsDue: z.number().int().nonnegative(),
  renewalsValue: computedPaiseSchema,
  contractsUnderDelivering: z.array(
    z.object({
      id: z.string(),
      customer: z.string(),
      visitsDone: z.number().int().nonnegative(),
      visitsCommitted: z.number().int().positive(),
    }),
  ),
  tomorrowJobs: z.number().int().nonnegative(),
  tomorrowUnassigned: z.number().int().nonnegative(),
});

export const homeSnapshotSchema = z.object({
  today: todaySchema,
  attention: z.array(attentionSchema),
  comparisons: z.array(comparisonSchema),
  comingUp: comingUpSchema,
});

export type HomeSnapshot = z.infer<typeof homeSnapshotSchema>;
export type AttentionItem = z.infer<typeof attentionSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;

/** Narrow the wire shape back to the app's `Computed<Paise>`. */
export function toComputed(
  value: HomeSnapshot["today"]["collectedToday"],
): Computed<Paise> {
  // `asPaise` re-asserts the integer invariant here rather than trusting the
  // schema alone: this is the one place wire data becomes domain money, and a
  // float that somehow reached it should throw loudly rather than render.
  return value.ok
    ? computed(asPaise(value.value))
    : uncomputable<Paise>(value.reason);
}

/* ----------------------------------------------------------------- fixture */

const p = (n: number) => ({ ok: true as const, value: asPaise(n) });

/**
 * Production-shaped, per S10. Specifically not a happy path:
 *
 * - **`overdue` is deliberately uncomputable**, so the screen's most valuable
 *   number renders as an em-dash on first look. That is the state §6.3 calls
 *   the worst defect class if it were rendered as ₹0, and it must be visible in
 *   review rather than discovered in production.
 * - The attention queue carries **all five kinds**, so severity ordering and the
 *   longest sentence are both exercised.
 * - One comparison moves **down and that is good** (time to sign-off), which is
 *   why `better` is a separate field from `direction`.
 */
const FIXTURE: HomeSnapshot = {
  today: {
    jobsToday: 18,
    done: 12,
    inProgress: 4,
    notStarted: 2,
    unassigned: 3,
    oldestUnassignedMinutes: 130,
    collectedToday: p(1_24_500_00),
    collectedCount: 6,
    overdue: { ok: false, reason: "Receivables service unavailable" },
    overdueInvoices: 9,
    overdueOldestDays: 74,
  },
  attention: [
    {
      id: "att_1",
      kind: "bad_rating",
      sentence: "Mrs. Deshpande rated Ramesh 1 star — “Left dirty”",
      detail: "Job J-2607-0417 · signed off 40 minutes ago",
      actionLabel: "Call",
      href: "/jobs",
    },
    {
      id: "att_2",
      kind: "parts_awaited_stalled",
      sentence: "J-2607-0398 is waiting on a 45 MFD capacitor",
      detail: "Stalled 6 days · Shakti Industries, Nagpur · part not in any van",
      actionLabel: "Schedule revisit",
      href: "/jobs",
    },
    {
      id: "att_3",
      kind: "sla_breach",
      sentence: "J-2607-0431 was promised by 1:00 pm",
      detail: "Late 2h 15m · Breakdown priority · technician still on a prior job",
      actionLabel: "Reassign",
      href: "/today",
    },
    {
      id: "att_4",
      kind: "lead_missed_followups",
      sentence: "Sunil Traders has missed 3 follow-ups",
      detail: "Last contact 12 days ago · quoted ₹48,000 · owner Priya",
      actionLabel: "Open lead",
      href: "/leads",
    },
    {
      id: "att_5",
      kind: "unsettled_cash",
      sentence: "Ramesh is holding ₹14,200 in cash",
      detail: "Unsettled 3 days · above the ₹10,000 threshold",
      actionLabel: "Record handover",
      href: "/money",
    },
  ],
  comparisons: [
    {
      label: "Jobs completed",
      current: "62",
      previous: "58",
      changeWord: "4 more",
      direction: "up",
      better: true,
    },
    {
      label: "First-visit fix",
      current: "78%",
      previous: "71%",
      changeWord: "7 points better",
      direction: "up",
      better: true,
    },
    {
      // Down, and good. The reason `better` is not derived from `direction`.
      label: "Time to sign-off",
      current: "1.4 days",
      previous: "2.1 days",
      changeWord: "0.7 days faster",
      direction: "down",
      better: true,
    },
    {
      label: "Collected",
      current: "₹6,84,200.00",
      previous: "₹7,91,000.00",
      changeWord: "₹1,06,800 less",
      direction: "down",
      better: false,
    },
  ],
  comingUp: {
    ageing: [
      { label: "0–15 days", amount: p(2_18_400_00), count: 11 },
      { label: "16–30 days", amount: p(96_200_00), count: 5 },
      { label: "31–45 days", amount: p(48_900_00), count: 3 },
      { label: "46–90 days", amount: p(1_12_300_00), count: 4 },
      { label: "90+ days", amount: p(2_00_100_00), count: 2 },
    ],
    renewalsDue: 3,
    renewalsValue: p(4_32_000_00),
    contractsUnderDelivering: [
      {
        id: "ctr_1",
        customer: "Shakti Industries",
        visitsDone: 3,
        visitsCommitted: 12,
      },
      {
        id: "ctr_2",
        customer: "Deshmukh Hospital",
        visitsDone: 5,
        visitsCommitted: 12,
      },
    ],
    tomorrowJobs: 14,
    tomorrowUnassigned: 5,
  },
};

/* ------------------------------------------------------------------- query */

export const getHomeSnapshot = defineQuery<void, HomeSnapshot>({
  key: "home.snapshot",
  schema: homeSnapshotSchema,
  fixture: (): Fetched<unknown> => ({
    raw: FIXTURE,
    // A designed degraded mode (§9.8): the ledger is down, so the screen shows
    // what it has, labelled, rather than blanking. Exercises the partial state
    // on every load instead of leaving it to be discovered later.
    partialFailures: [
      {
        region: "Receivables",
        stillWorks: "Jobs, dispatch and collections",
        code: "LEDGER_DOWN",
      },
    ],
  }),
});
