/**
 * Leads — PRD §6.6. **The one decision:** *who do I call right now?*
 *
 * §6.6.1's central claim, and the reason this screen is not a kanban:
 * **"a lead's stage does not tell you who to call today. Only the follow-up date
 * does."** A kanban with 60 cards forces scanning every column and opening cards
 * to find dates. So the default view is a **dated follow-up queue**, and the
 * stage board exists as a second always-visible tab for the owner's Monday
 * review.
 *
 * The group order encodes a judgement worth preserving: **`UNASSIGNED` is pinned
 * above `OVERDUE`**, because "a lead with no owner is a worse failure than a
 * lead whose owner is late — nobody is even responsible for it".
 */
import { z } from "zod";
import { defineQuery, type Fetched } from "./source";

/* ---------------------------------------------------------------- contract */

export const LEAD_GROUPS = [
  "unassigned",
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "later",
] as const;

export type LeadGroup = (typeof LEAD_GROUPS)[number];

export const GROUP_LABEL: Record<LeadGroup, string> = {
  unassigned: "Unassigned",
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  this_week: "This week",
  later: "Later",
};

/** §6.6.1: Later is collapsed by default — it is not today's work. */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<LeadGroup> = new Set(["later"]);

const leadSchema = z.object({
  id: z.string(),
  reference: z.string(),
  name: z.string(),
  locality: z.string(),
  phone: z.string(),
  stage: z.string(),
  /** The sort key made legible — `3 days late`, `Due today` (§6.6.2). */
  dueWord: z.string(),
  group: z.enum(LEAD_GROUPS),
  daysOverdue: z.number().int(),
  /**
   * "The highest-value element in the row" (§6.6.2) — without it she opens the
   * record before every call. Null when the activity lookup failed, which
   * renders "Activity unavailable" and leaves the row fully actionable.
   */
  lastActivity: z.object({ date: z.string(), text: z.string() }).nullable(),
  /**
   * Only when `QUOTED`. A failed lookup is `null` and renders `—`, **never
   * ₹0** (§6.6.4).
   */
  quotedPaise: z.number().int().nullable(),
  quotedUnavailable: z.boolean(),
  /** Visible even in a "my leads" view, because coordinators cover for each other. */
  owner: z.string().nullable(),
  source: z.string(),
  /**
   * FR-103: incentives are paid on who *took* the lead, and it is immutable.
   * §6.6.2 calls it "the one thing on this screen allowed to be secondary" and
   * suggests hover — but §6.13.9 forbids hover-only affordances outright, and
   * §3.2's coordinator uses a touch laptop. Defect **D6**: rendered as a real
   * column at wide widths, never hover-gated.
   */
  takenBy: z.string(),
});

export const leadsSchema = z.object({
  leads: z.array(leadSchema),
  tomorrowCount: z.number().int().nonnegative(),
});

export type Lead = z.infer<typeof leadSchema>;
export type LeadsData = z.infer<typeof leadsSchema>;

/** §6.6.3's closed outcome list — free text alone is useless for reporting. */
export const OUTCOMES = [
  "Spoke",
  "No answer",
  "Busy",
  "Asked to call later",
  "Sent quote",
  "Won",
  "Lost",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

/**
 * Outcomes that take the lead out of the follow-up queue.
 *
 * FR-104 blocks a save without a next follow-up date because "a lead without a
 * date gets forgotten" — but that reasoning only holds for a lead still in play.
 * A won lead becomes a job or a contract; a lost lead is closed. Neither has a
 * next call, so neither is asked for a date.
 */
export function isTerminalOutcome(outcome: string): boolean {
  return outcome === "Won" || outcome === "Lost";
}

/* ---------------------------------------------------------------- pipeline */

/**
 * The stage board — §6.6.1's **second** tab, "for the owner's Monday review".
 *
 * A different reader with a different question. The queue answers *who do I
 * call today*; this answers *where is the money sitting and what has stopped
 * moving*. So the columns carry **value and age**, not follow-up dates, and
 * nothing here is sorted by when the next call is due.
 *
 * `WON` and `LOST` are deliberately **not columns**. A board whose right-hand
 * column grows forever stops being a board — closed deals dominate the width
 * and the live pipeline gets squeezed into the left third. They leave the queue
 * (`isTerminalOutcome`) and belong in reporting, where the conversion table
 * already counts them.
 *
 * `PARKED` *is* a column, at the end, because a parked lead is where deals go
 * to die quietly and an owner reviewing on Monday needs to see the pile.
 */
export const PIPELINE_STAGES = [
  "NEW",
  "CONTACTED",
  "SURVEY_SCHEDULED",
  "QUOTED",
  "ASSIGNED",
  "PARKED",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABEL: Record<PipelineStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SURVEY_SCHEDULED: "Survey scheduled",
  QUOTED: "Quoted",
  ASSIGNED: "Assigned",
  PARKED: "Parked",
};

/**
 * Days with no contact before a lead counts as stalled.
 *
 * Seven, not thirty: a quote that has been silent for a week is the one an
 * owner can still rescue on a Monday. Thirty days finds corpses.
 */
export const STALL_DAYS = 7;

export type PipelineColumn = {
  stage: PipelineStage;
  rows: Lead[];
  /** Null when no lead in the column carries a value — never a fabricated 0. */
  valuePaise: number | null;
  /** How many have had no contact for `STALL_DAYS` or more. */
  stalled: number;
};

/**
 * Days since a lead was last touched.
 *
 * `daysOverdue` is the follow-up clock, not the contact clock — a lead due in
 * four days has `-4` and may still have been silent for a fortnight. Using it
 * here would report the healthiest-looking leads as the freshest, which is
 * backwards. With no activity recorded, staleness is unknown, not zero.
 */
export function daysSinceContact(lead: Lead, today: Date): number | null {
  if (lead.lastActivity === null) return null;
  const parsed = Date.parse(`${lead.lastActivity.date} ${today.getFullYear()}`);
  if (Number.isNaN(parsed)) return null;
  const days = Math.floor((today.getTime() - parsed) / 86_400_000);
  return days < 0 ? 0 : days;
}

export function isStalled(lead: Lead, today: Date): boolean {
  const days = daysSinceContact(lead, today);
  // Unknown is not stalled. Flagging a lead whose activity lookup failed sends
  // the owner chasing a data problem, not a deal.
  return days !== null && days >= STALL_DAYS;
}

/** Build the board, highest value first within each column. */
export function pipelineColumns(leads: Lead[], today: Date): PipelineColumn[] {
  return PIPELINE_STAGES.map((stage) => {
    const rows = leads
      .filter((lead) => lead.stage === stage)
      .sort((a, b) => (b.quotedPaise ?? 0) - (a.quotedPaise ?? 0));

    const valued = rows.filter((lead) => lead.quotedPaise !== null);

    return {
      stage,
      rows,
      valuePaise:
        valued.length === 0
          ? null
          : valued.reduce((sum, lead) => sum + (lead.quotedPaise ?? 0), 0),
      stalled: rows.filter((lead) => isStalled(lead, today)).length,
    };
  });
}

/**
 * Group ordering. `unassigned` first by design (§6.6.1), then by urgency.
 * Within a group: days overdue descending, then quoted value descending — so
 * two equally late leads are separated by what they are worth.
 */
export function groupLeads(leads: Lead[]): { group: LeadGroup; rows: Lead[] }[] {
  return LEAD_GROUPS.map((group) => ({
    group,
    rows: leads
      .filter((lead) => lead.group === group)
      .sort(
        (a, b) =>
          b.daysOverdue - a.daysOverdue ||
          (b.quotedPaise ?? 0) - (a.quotedPaise ?? 0),
      ),
  })).filter((section) => section.rows.length > 0);
}

/* ----------------------------------------------------------------- fixture */

export const SEED_LEADS: LeadsData = {
  tomorrowCount: 5,
  leads: [
    {
      id: "l1",
      reference: "L-2608-0151",
      name: "Grand Plaza Hotel",
      locality: "Connaught Place",
      phone: "98110 44556",
      stage: "NEW",
      dueWord: "No owner",
      group: "unassigned",
      daysOverdue: 0,
      lastActivity: {
        date: "1 Aug",
        text: "WhatsApp: “Need AMC quote for 40 ACs”",
      },
      quotedPaise: null,
      quotedUnavailable: false,
      owner: null,
      source: "WhatsApp",
      takenBy: "System",
    },
    {
      id: "l2",
      reference: "L-2608-0149",
      name: "Sunil Traders",
      locality: "Lajpat Nagar",
      phone: "98110 77889",
      stage: "QUOTED",
      dueWord: "12 days late",
      group: "overdue",
      daysOverdue: 12,
      lastActivity: { date: "20 Jul", text: "Asked for quote for 4 ACs" },
      quotedPaise: 4_800_000,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Referral",
      takenBy: "Priya",
    },
    {
      id: "l3",
      reference: "L-2608-0142",
      name: "Verma Dental Clinic",
      locality: "Rajouri Garden",
      phone: "98110 33221",
      stage: "CONTACTED",
      dueWord: "4 days late",
      group: "overdue",
      daysOverdue: 4,
      // The activity service failed for this row only — §6.6.4's partial.
      lastActivity: null,
      quotedPaise: null,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Phone",
      takenBy: "Priya",
    },
    {
      id: "l4",
      reference: "L-2608-0155",
      name: "Mehta Residence",
      locality: "Punjabi Bagh",
      phone: "98110 66554",
      stage: "QUOTED",
      dueWord: "Due today",
      group: "today",
      daysOverdue: 0,
      lastActivity: { date: "29 Jul", text: "Sent quote for split AC install" },
      // Quoted value lookup failed — renders `—`, never ₹0 (§6.6.4).
      quotedPaise: null,
      quotedUnavailable: true,
      owner: "Priya",
      source: "Website",
      takenBy: "Priya",
    },
    {
      id: "l5",
      reference: "L-2608-0156",
      name: "Kapoor Residency RWA",
      locality: "Greater Kailash",
      phone: "98110 11223",
      stage: "SURVEY_SCHEDULED",
      dueWord: "Due today",
      group: "today",
      daysOverdue: 0,
      lastActivity: { date: "31 Jul", text: "Survey booked for 2 Aug morning" },
      quotedPaise: null,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Repeat customer",
      takenBy: "Priya",
    },
    {
      id: "l6",
      reference: "L-2608-0158",
      name: "Anand Sweets",
      locality: "Karol Bagh",
      phone: "98110 99001",
      stage: "ASSIGNED",
      dueWord: "Due tomorrow",
      group: "tomorrow",
      daysOverdue: -1,
      lastActivity: { date: "1 Aug", text: "Left voicemail" },
      quotedPaise: null,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Walk-in",
      takenBy: "Manish",
    },
    {
      id: "l8",
      reference: "L-2608-0159",
      name: "Bharat Petroleum Nehru Place Depot",
      locality: "Nehru Place",
      phone: "98110 12312",
      stage: "QUOTED",
      dueWord: "Due today",
      group: "today",
      daysOverdue: 0,
      lastActivity: {
        date: "30 Jul",
        text: "Sent revised AMC quote after site survey",
      },
      quotedPaise: 2_40_000_00,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Field/Marketing",
      takenBy: "Priya",
    },
    {
      id: "l9",
      reference: "L-2608-0160",
      name: "Sethi Enterprises",
      locality: "Mayapuri",
      phone: "98110 45678",
      stage: "CONTACTED",
      dueWord: "Due today",
      group: "today",
      daysOverdue: 0,
      lastActivity: { date: "31 Jul", text: "Wants cold room AMC pricing" },
      quotedPaise: null,
      quotedUnavailable: false,
      owner: "Manish",
      source: "Referral",
      takenBy: "Priya",
    },
    {
      id: "l10",
      reference: "L-2608-0161",
      name: "Green Park Clinic",
      locality: "Green Park",
      phone: "98110 88990",
      stage: "ASSIGNED",
      dueWord: "In 3 days",
      group: "this_week",
      daysOverdue: -3,
      lastActivity: { date: "1 Aug", text: "Asked to call after 5pm" },
      quotedPaise: null,
      quotedUnavailable: false,
      owner: "Priya",
      source: "Repeat customer",
      takenBy: "Priya",
    },
    {
      id: "l11",
      reference: "L-2608-0162",
      name: "Deshmukh Hospital",
      locality: "Saket",
      phone: "98110 32100",
      stage: "QUOTED",
      dueWord: "In 4 days",
      group: "this_week",
      daysOverdue: -4,
      lastActivity: { date: "28 Jul", text: "Quote sent for generator AMC" },
      quotedPaise: 3_60_000_00,
      quotedUnavailable: false,
      owner: "Manish",
      source: "AMC renewal",
      takenBy: "Manish",
    },
    {
      id: "l7",
      reference: "L-2608-0120",
      name: "Shakti Industries",
      locality: "Okhla Phase II",
      phone: "98110 55443",
      stage: "PARKED",
      dueWord: "In 3 weeks",
      group: "later",
      daysOverdue: -21,
      lastActivity: { date: "10 Jul", text: "“Call after Diwali budget”" },
      quotedPaise: 12_00_000,
      quotedUnavailable: false,
      owner: "Manish",
      source: "AMC renewal",
      takenBy: "Manish",
    },
  ],
};

export const getLeads = defineQuery<void, LeadsData>({
  key: "leads.queue",
  schema: leadsSchema,
  // Reads from the local store, whose seed is SEED_LEADS. Deferred import so
  // the static graph stays acyclic: the store imports this module for its seed,
  // and a static import back would be a cycle waiting to bite the first person
  // who adds a top-level const that reads state.
  fixture: async (): Promise<Fetched<unknown>> => ({
    raw: (await import("./store")).getState().leads,
    partialFailures: [
      {
        region: "Last activity for 1 lead",
        stillWorks: "Calling, WhatsApp and logging outcomes",
        code: "ACTIVITY_DOWN",
      },
    ],
  }),
});
