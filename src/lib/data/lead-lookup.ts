/**
 * Duplicate / existing-customer detection — FR-102.
 *
 * §6.7.1 puts phone **first** in the form specifically "so the duplicate check
 * can fire while the customer is still talking", and FR-102 calls this
 * behaviour the thing that "prevents the most common data-quality failure in
 * this category".
 *
 * FR-102 defines two distinct matches, with **different primary actions**,
 * because the coordinator's next move differs:
 *
 * - an existing **customer** → she should raise a job, not run a sales cycle;
 * - an existing open **lead** → she must not create a second lead for the same
 *   caller, so the primary becomes "Open existing lead".
 *
 * ⚠️ **The requirement this cannot satisfy under DR-9.** FR-102 is a *latency*
 * requirement — the panel must appear within 500ms of the 10th digit, on a
 * p95 ≤250ms lookup, because Priya is mid-call. A fixture returns instantly and
 * always succeeds, so the behaviour is built and the budget is unproven.
 * Recorded in the registry rather than counted as met.
 */
import { z } from "zod";
import { defineQuery, type Fetched } from "./source";

const customerMatchSchema = z.object({
  kind: z.literal("customer"),
  customerId: z.string(),
  name: z.string(),
  pastJobs: z.number().int().nonnegative(),
  lastJobDate: z.string().nullable(),
  openJobs: z.number().int().nonnegative(),
  /** Null when the ledger could not be reached — renders `—`, never ₹0. */
  outstandingPaise: z.number().int().nullable(),
});

const leadMatchSchema = z.object({
  kind: z.literal("lead"),
  leadId: z.string(),
  reference: z.string(),
  name: z.string(),
  owner: z.string(),
  stage: z.string(),
  nextFollowUp: z.string(),
});

export const lookupSchema = z.object({
  /** Null is the **resting state**, and it renders nothing at all (§6.7.2). */
  match: z.discriminatedUnion("kind", [customerMatchSchema, leadMatchSchema]).nullable(),
});

export type Lookup = z.infer<typeof lookupSchema>;
export type CustomerMatch = z.infer<typeof customerMatchSchema>;
export type LeadMatch = z.infer<typeof leadMatchSchema>;

/**
 * Two seeded numbers so both branches are reachable in review, and everything
 * else resolves to no match — the state that must show **nothing**, rather than
 * "No customer found", which reads as an error (§6.7.2).
 */
const MATCHES: Record<string, Lookup["match"]> = {
  "9811022334": {
    kind: "customer",
    customerId: "cus_1",
    name: "Mrs. Deshpande",
    pastJobs: 7,
    lastJobDate: "1 Aug 2026",
    openJobs: 1,
    outstandingPaise: 4_500_00,
  },
  "9811077889": {
    kind: "lead",
    leadId: "l2",
    reference: "L-2608-0149",
    name: "Sunil Traders",
    owner: "Priya",
    stage: "QUOTED",
    nextFollowUp: "20 Jul 2026 — 12 days late",
  },
};

export const lookupPhone = defineQuery<string, Lookup>({
  key: "lead.lookup",
  schema: lookupSchema,
  fixture: (phone): Fetched<unknown> => ({
    raw: { match: MATCHES[phone.replace(/\D/g, "")] ?? null },
  }),
});
