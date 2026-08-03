/**
 * Reports / Review — PRD §6.14.
 *
 * **The one decision:** *what changed this week and who needs attention?*
 *
 * **A short fixed set, not a builder.** That is the binding constraint: a report
 * builder answers every question badly and none of them by default, and the
 * owner this product serves reviews weekly, not analytically.
 *
 * Two rules from §6.14 that shape the data, not just the render:
 *
 * - **Every report exports with its filters named** (FR-1002). A CSV that does
 *   not say what period and branch produced it is a number with no provenance,
 *   and it will be pasted into a WhatsApp group as fact.
 * - **Charts are permitted here and only here, and every chart is accompanied
 *   by the table it was drawn from.** So every series carries its own rows.
 */
import { z } from "zod";
import { defineQuery, type Fetched } from "./source";

/** Jobs by state, with dwell time — where PARTS_AWAITED loss becomes visible. */
const stateDwellSchema = z.object({
  state: z.string(),
  count: z.number().int().nonnegative(),
  /** Average hours spent in this state before leaving it. */
  avgHours: z.number().nonnegative(),
});

const revenueLineSchema = z.object({
  serviceType: z.string(),
  jobs: z.number().int().nonnegative(),
  revenuePaise: z.number().int().nonnegative(),
});

const technicianLineSchema = z.object({
  name: z.string(),
  completed: z.number().int().nonnegative(),
  /** Null when too few ratings to mean anything — never a fabricated 0.0. */
  avgRating: z.number().nullable(),
  firstVisitFixPct: z.number().nullable(),
});

const conversionLineSchema = z.object({
  source: z.string(),
  /** FR-103: attribution is on `taken_by`, which is what incentives pay on. */
  takenBy: z.string(),
  leads: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
});

export const reportsSchema = z.object({
  /** FR-1002: the filters travel with the data so an export can name them. */
  filters: z.object({
    periodWord: z.string(),
    branch: z.string(),
    comparedWith: z.string(),
  }),
  revenueByService: z.array(revenueLineSchema),
  jobsByState: z.array(stateDwellSchema),
  technicians: z.array(technicianLineSchema),
  conversion: z.array(conversionLineSchema),
});

export type ReportsData = z.infer<typeof reportsSchema>;
export type StateDwell = z.infer<typeof stateDwellSchema>;
export type TechnicianLine = z.infer<typeof technicianLineSchema>;
export type ConversionLine = z.infer<typeof conversionLineSchema>;

/**
 * Conversion rate, or `null` when the denominator is too small to mean
 * anything. Three leads and one win is not a 33% conversion rate; it is three
 * leads. Reporting it as a percentage invites a decision the sample cannot
 * support — and incentives are paid on this table.
 */
export const MIN_LEADS_FOR_RATE = 5;

export function conversionRate(line: ConversionLine): number | null {
  if (line.leads < MIN_LEADS_FOR_RATE) return null;
  return Math.round((line.won / line.leads) * 100);
}

/**
 * The state costing the most time. §6.14 singles this out: dwell time is
 * "where PARTS_AWAITED dwell time gets exposed, usually the biggest hidden loss
 * in the business". Total hours, not average — one job stuck for a month is a
 * different problem from thirty stuck for a day, and the total finds both.
 */
export function worstDwell(states: StateDwell[]): StateDwell | null {
  if (states.length === 0) return null;
  return states.reduce((worst, state) =>
    state.avgHours * state.count > worst.avgHours * worst.count ? state : worst,
  );
}

/** The filter line every export carries (FR-1002). */
export function filterCaption(filters: ReportsData["filters"]): string {
  return `${filters.periodWord} · ${filters.branch} · compared with ${filters.comparedWith}`;
}

const FIXTURE = {
  filters: {
    periodWord: "Week to 2 Aug 2026",
    branch: "All branches",
    comparedWith: "previous week",
  },
  revenueByService: [
    { serviceType: "AMC servicing", jobs: 34, revenuePaise: 2_86_000_00 },
    { serviceType: "AC repair", jobs: 18, revenuePaise: 1_94_500_00 },
    { serviceType: "Installation", jobs: 6, revenuePaise: 1_42_000_00 },
    { serviceType: "Chiller preventive", jobs: 4, revenuePaise: 61_700_00 },
  ],
  jobsByState: [
    { state: "Scheduled", count: 22, avgHours: 6.4 },
    { state: "En route", count: 18, avgHours: 0.7 },
    { state: "On site", count: 18, avgHours: 1.9 },
    // The one that matters: few jobs, enormous dwell.
    { state: "Parts awaited", count: 7, avgHours: 71.5 },
    { state: "Work done", count: 15, avgHours: 12.2 },
  ],
  technicians: [
    { name: "Ramesh Yadav", completed: 26, avgRating: 4.1, firstVisitFixPct: 81 },
    {
      name: "Lakshminarayanan Subramaniam",
      completed: 21,
      avgRating: 4.6,
      firstVisitFixPct: 76,
    },
    {
      name: "Imran Qureshi",
      completed: 2,
      // Too few ratings to be meaningful — must render an em-dash, not 0.0.
      avgRating: null,
      firstVisitFixPct: null,
    },
  ],
  conversion: [
    { source: "WhatsApp", takenBy: "Priya", leads: 21, won: 9 },
    { source: "Referral", takenBy: "Priya", leads: 12, won: 7 },
    { source: "Field/Marketing", takenBy: "Manish", leads: 9, won: 2 },
    // Below the threshold — a rate here would be noise presented as signal.
    { source: "Website", takenBy: "Manish", leads: 3, won: 1 },
  ],
};

export const getReports = defineQuery<void, ReportsData>({
  key: "reports.weekly",
  schema: reportsSchema,
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});
