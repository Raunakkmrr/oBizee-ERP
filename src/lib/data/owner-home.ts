/**
 * Owner Home — PRD §6.10. **Mobile-first, 390px.**
 *
 * **The one decision:** *is anything on fire, and if so what do I pick up?*
 *
 * The owner is "an **exception handler, not a report reader**", so this is "a
 * triage list with two numbers on top, not a dashboard". Charts are one tab
 * away, "because a chart cannot be acted on from a car".
 *
 * **The rule this contract is shaped around** (§6.10.2): *"A false zero on the
 * owner's money tile is the most damaging bug in this product."* So money is
 * `Computed<Paise>` — a genuinely quiet day renders **₹0.00, which is correct**,
 * and a failed aggregate renders **—**. Those two must never be confusable, and
 * a plain `number` cannot express the difference.
 */
import { z } from "zod";
import { asPaise, type Paise } from "@/lib/money";
import { computed, uncomputable, type Computed } from "./result";
import { defineQuery, type Fetched } from "./source";

const computedMoneySchema = z.union([
  z.object({ ok: z.literal(true), value: z.number().int() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);

/**
 * Each counter is "the count of things where **someone has stopped doing their
 * job**", and each tile is a link into the filtered list.
 */
const counterSchema = z.object({
  count: z.number().int().nonnegative(),
  label: z.string(),
  href: z.string(),
});

const callRowSchema = z.object({
  id: z.string(),
  /** `★1` / `Dispute` / `Stuck 3d` — the reason, as a word. */
  badge: z.string(),
  who: z.string(),
  what: z.string(),
  meta: z.string(),
  phone: z.string(),
  href: z.string(),
});

export const ownerHomeSchema = z.object({
  /** Null when this tenant has never had data — a different state entirely. */
  isNewTenant: z.boolean(),
  collectedToday: computedMoneySchema,
  collectedCount: z.number().int().nonnegative(),
  overdue: computedMoneySchema,
  overdueCount: z.number().int().nonnegative(),
  counters: z.array(counterSchema).length(3),
  jobsDone: z.number().int().nonnegative(),
  jobsTotal: z.number().int().nonnegative(),
  /**
   * **Maximum three.** §6.10.1: "Capped at three by design: an owner presented
   * with 20 problems addresses none." Enforced by the schema so a generous
   * backend cannot quietly widen it.
   */
  needsYourCall: z.array(callRowSchema).max(3),
  setupSteps: z.array(z.object({ label: z.string(), done: z.boolean() })),
});

export type OwnerHome = z.infer<typeof ownerHomeSchema>;
export type CallRow = z.infer<typeof callRowSchema>;

export function toComputedMoney(
  value: OwnerHome["collectedToday"],
): Computed<Paise> {
  return value.ok
    ? computed(asPaise(value.value))
    : uncomputable<Paise>(value.reason);
}

/* ----------------------------------------------------------------- fixture */

/**
 * Shaped to show §6.10.2's hardest distinction in one screen: **Collected today
 * loads and Overdue does not.** §6.10.2 calls that partial "very common" —
 * payments arrive but the receivables aggregate times out — and requires the
 * failed tile alone to show `—` with its own retry, leaving the counters and
 * the call list untouched.
 */
const FIXTURE: OwnerHome = {
  isNewTenant: false,
  collectedToday: { ok: true, value: 48_250_00 },
  collectedCount: 6,
  overdue: { ok: false, reason: "Couldn't load overdue total" },
  overdueCount: 14,
  counters: [
    { count: 3, label: "Unassigned jobs", href: "/today" },
    { count: 2, label: "Stuck >1d", href: "/jobs" },
    { count: 4, label: "Follow-ups overdue", href: "/leads" },
  ],
  jobsDone: 9,
  jobsTotal: 14,
  needsYourCall: [
    {
      id: "c1",
      badge: "★1",
      who: "Mrs. Deshpande",
      what: "“AC still not cooling after service”",
      meta: "Ramesh · 2:40 pm",
      phone: "98110 22334",
      href: "/jobs/J-2608-0417",
    },
    {
      id: "c2",
      badge: "Stuck 6d",
      who: "Shakti Industries",
      what: "Waiting on a 45 MFD capacitor",
      meta: "Ramesh · J-2608-0398",
      phone: "98110 55443",
      href: "/jobs/J-2608-0398",
    },
    {
      id: "c3",
      badge: "3 missed",
      who: "Sunil Traders",
      what: "Three missed follow-ups on a ₹48,000 quote",
      meta: "Priya · last contact 12 days ago",
      phone: "98110 77889",
      href: "/leads",
    },
  ],
  setupSteps: [
    { label: "Add your services and prices", done: false },
    { label: "Add your technicians", done: false },
    { label: "Create your first job", done: false },
  ],
};

export const getOwnerHome = defineQuery<void, OwnerHome>({
  key: "owner.home",
  schema: ownerHomeSchema,
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});
