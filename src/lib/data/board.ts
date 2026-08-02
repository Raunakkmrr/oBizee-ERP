/**
 * The Today dispatch board's data contract, fixture and query — PRD §6.4.
 *
 * **The one decision this screen serves:** *which unassigned or stuck job do I
 * act on in the next two minutes, and who do I give it to?* Not a dashboard — a
 * work queue with the **supply side visible next to the demand side**, which is
 * why technicians travel in the same payload as jobs rather than being fetched
 * when an assign dialog opens.
 *
 * Two contract decisions follow directly from §6.4:
 *
 * 1. **The five counters are filters, not statistics.** They are modelled as a
 *    closed union of filterable states, so a sixth "Total jobs today" counter is
 *    not expressible — §6.4.1 rejects it by name as "a number nobody acts on".
 * 2. **A job's contract data can fail independently of the job.** §6.4.5 requires
 *    `Visit —/—` with a tooltip in that case and forbids `Visit 0/0`, so
 *    `visit` is nullable rather than defaulted.
 */
import { z } from "zod";
import { asPaise, type Paise } from "@/lib/money";
import { computed, uncomputable, type Computed } from "./result";
import { defineQuery, type Fetched } from "./source";

/* ---------------------------------------------------------------- contract */

/**
 * The five counters. §6.4.1 names each and why it earns its place; the absence
 * of a total is deliberate and enforced by this being a closed union.
 */
export const BOARD_FILTERS = [
  "unassigned", // work with no owner — "the most expensive number on the screen"
  "en_route", // answers "where is my technician"
  "on_site", // used to judge whether to add another job to that technician
  "parts_awaited", // "the state that silently eats revenue"
  "done_not_billed", // "the number that makes an owner buy the product"
] as const;

export type BoardFilter = (typeof BOARD_FILTERS)[number];

export const FILTER_LABEL: Record<BoardFilter, string> = {
  unassigned: "Unassigned",
  en_route: "En route",
  on_site: "On site",
  parts_awaited: "Parts awaited",
  done_not_billed: "Done, not billed",
};

/** Slots render as `9-1`, `1-5`, `5-8`, or an exact time like `11:30`. */
const slotSchema = z.string();

const slaSchema = z.object({
  /** A word, never a bare colour — `Due 2h`, `Late 1d` (§6.4.2, P3). */
  word: z.string(),
  kind: z.enum(["due_soon", "late", "ok"]),
});

const jobRowSchema = z.object({
  id: z.string(),
  /** `J-2607-0431`. Human-speakable and read aloud on calls (FR-210). */
  jobNumber: z.string(),
  slot: slotSchema,
  customer: z.string(),
  /** Locality only — the full address is noise at list level (§6.4.2). */
  locality: z.string(),
  serviceType: z.string(),
  /**
   * Null when the job is not under contract. `{ n: null }` when the contract
   * lookup failed — rendered `Visit —/—`, never `Visit 0/0` (§6.4.5).
   */
  visit: z
    .object({
      n: z.number().int().positive().nullable(),
      of: z.number().int().positive().nullable(),
    })
    .nullable(),
  status: z.string(),
  technician: z
    .object({ id: z.string(), name: z.string() })
    .nullable(),
  priority: z.enum(["normal", "urgent", "breakdown"]),
  sla: slaSchema.nullable(),
  /** `Visit 2` — a second attempt is a customer already let down once. */
  visitAttempt: z.number().int().positive(),
  /** Only sent when the role permits it (§6.4.2, FR-1302). */
  valuePaise: z.number().int().nullable(),
});

const technicianSchema = z.object({
  id: z.string(),
  name: z.string(),
  jobsToday: z.number().int().nonnegative(),
  status: z.object({
    kind: z.enum(["free", "en_route", "on_site", "leave"]),
    /**
     * `On site since 11:42` — §6.4.3 is explicit that **the duration is what
     * tells her whether he is nearly free**, so this is not decorative.
     */
    since: z.string().nullable(),
  }),
  /** Where his other jobs are today — this is what makes clustering possible. */
  localities: z.array(z.string()),
  skills: z.array(z.string()),
});

export const boardSchema = z.object({
  counters: z.object({
    unassigned: z.number().int().nonnegative(),
    en_route: z.number().int().nonnegative(),
    on_site: z.number().int().nonnegative(),
    parts_awaited: z.number().int().nonnegative(),
    done_not_billed: z.number().int().nonnegative(),
  }),
  jobs: z.array(jobRowSchema),
  technicians: z.array(technicianSchema),
  /** Counts used by the empty state's second action and orientation line. */
  tomorrowJobs: z.number().int().nonnegative(),
  leadsDueToday: z.number().int().nonnegative(),
});

export type Board = z.infer<typeof boardSchema>;
export type JobRow = z.infer<typeof jobRowSchema>;
export type Technician = z.infer<typeof technicianSchema>;

/** Which filter a job satisfies, so the counters and rows cannot disagree. */
export function matchesFilter(job: JobRow, filter: BoardFilter): boolean {
  switch (filter) {
    case "unassigned":
      return job.technician === null;
    case "en_route":
      return job.status === "EN_ROUTE";
    case "on_site":
      return job.status === "ON_SITE" || job.status === "IN_PROGRESS";
    case "parts_awaited":
      return job.status === "PARTS_AWAITED";
    case "done_not_billed":
      return job.status === "WORK_DONE" || job.status === "SIGNED_OFF";
  }
}

export function jobValue(job: JobRow): Computed<Paise> | null {
  if (job.valuePaise === null) return null;
  return computed(asPaise(job.valuePaise));
}

/** Does this technician's skill list cover the job's service type? */
export function hasSkillFor(tech: Technician, job: JobRow): boolean {
  const service = job.serviceType.toLowerCase();
  return tech.skills.some((skill) => service.includes(skill.toLowerCase()));
}

/**
 * The single technician to recommend for a job — or `null`.
 *
 * §6.13.2 permits **one primary button per screen**; the assignment panel
 * rendered a filled `[Assign]` beside every technician, which is the same
 * defect already fixed on the job rows: four equal primaries tell a hurried
 * coordinator nothing about where to go.
 *
 * The criteria are the ones the panel already puts on screen, in the order a
 * dispatcher actually reasons:
 *
 * 1. **Not on leave** — a hard exclusion, never a tie-break.
 * 2. **Has the skill** — a plumber sent to a chiller is a wasted visit.
 * 3. **Already working that locality** — §6.4.2 calls clustering "most of a
 *    dispatcher's craft"; a technician already in Okhla beats an idle one
 *    across the city.
 * 4. **Lighter load** — the tie-break, not the headline. Sending the free
 *    technician who cannot do the work is not an assignment, it is a callback.
 *
 * Returns `null` when nobody clears the skill bar. That is deliberate: with no
 * recommendation, **no button is filled**, and the coordinator is told by the
 * absence that this one needs a human judgement. Guessing a primary here would
 * be worse than not offering one.
 */
export function recommendTechnician(
  job: JobRow,
  technicians: Technician[],
): string | null {
  const eligible = technicians.filter(
    (tech) => tech.status.kind !== "leave" && hasSkillFor(tech, job),
  );
  if (eligible.length === 0) return null;

  const scored = eligible.map((tech) => ({
    tech,
    inLocality: tech.localities.includes(job.locality),
  }));

  scored.sort((a, b) => {
    if (a.inLocality !== b.inLocality) return a.inLocality ? -1 : 1;
    return a.tech.jobsToday - b.tech.jobsToday;
  });

  // A tie on every criterion is not a recommendation — say nothing rather than
  // let array order masquerade as a judgement.
  const [best, runnerUp] = scored;
  if (
    runnerUp &&
    runnerUp.inLocality === best.inLocality &&
    runnerUp.tech.jobsToday === best.tech.jobsToday
  ) {
    return null;
  }
  return best.tech.id;
}

/* ----------------------------------------------------------------- fixture */

/**
 * Fourteen jobs — more than the ten §6.4.4 guarantees above the fold, so the
 * list scrolls and the density contract is actually tested rather than assumed.
 *
 * Shaped to exercise the awkward cases rather than the happy path (S10):
 * an unassigned breakdown that is already late; a `PARTS_AWAITED` job on its
 * second visit; a contract job whose contract lookup failed (`Visit —/—`); a
 * customer name long enough to need truncation; and a technician on leave who
 * must not be offered for assignment.
 */
const FIXTURE: Board = {
  counters: {
    unassigned: 3,
    en_route: 2,
    on_site: 3,
    parts_awaited: 2,
    done_not_billed: 4,
  },
  jobs: [
    {
      id: "j1",
      jobNumber: "J-2608-0431",
      slot: "9-1",
      customer: "Shakti Industries",
      locality: "Okhla Phase II",
      serviceType: "AC breakdown",
      visit: null,
      status: "CREATED",
      technician: null,
      priority: "breakdown",
      sla: { word: "Late 2h", kind: "late" },
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j2",
      jobNumber: "J-2608-0432",
      slot: "9-1",
      customer: "Deshmukh Hospital",
      locality: "Saket",
      serviceType: "AMC service",
      visit: { n: 4, of: 12 },
      status: "ON_SITE",
      technician: { id: "usr_0003", name: "Ramesh Yadav" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j3",
      jobNumber: "J-2608-0433",
      slot: "9-1",
      customer: "Mrs. Deshpande",
      locality: "Vasant Kunj",
      serviceType: "AC servicing",
      visit: null,
      status: "EN_ROUTE",
      technician: { id: "usr_0004", name: "Lakshminarayanan Subramaniam" },
      priority: "normal",
      sla: { word: "Due 2h", kind: "due_soon" },
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j4",
      jobNumber: "J-2608-0434",
      slot: "1-5",
      customer: "Bharat Petroleum Nehru Place Depot",
      locality: "Nehru Place",
      serviceType: "Chiller AMC",
      // Contract lookup failed — must render `Visit —/—`, never `Visit 0/0`.
      visit: { n: null, of: null },
      status: "SCHEDULED",
      technician: null,
      priority: "urgent",
      sla: { word: "Due 4h", kind: "due_soon" },
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j5",
      jobNumber: "J-2608-0398",
      slot: "1-5",
      customer: "Shakti Industries",
      locality: "Okhla Phase II",
      serviceType: "AC repair",
      visit: null,
      status: "PARTS_AWAITED",
      technician: { id: "usr_0003", name: "Ramesh Yadav" },
      priority: "normal",
      sla: { word: "Late 6d", kind: "late" },
      visitAttempt: 2,
      valuePaise: 17_500_00,
    },
    {
      id: "j6",
      jobNumber: "J-2608-0435",
      slot: "1-5",
      customer: "Kapoor Residency",
      locality: "Greater Kailash",
      serviceType: "Water purifier service",
      visit: { n: 2, of: 4 },
      status: "ASSIGNED",
      technician: { id: "usr_0004", name: "Lakshminarayanan Subramaniam" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j7",
      jobNumber: "J-2608-0436",
      slot: "1-5",
      customer: "Sunil Traders",
      locality: "Lajpat Nagar",
      serviceType: "AC servicing",
      visit: null,
      status: "CREATED",
      technician: null,
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j8",
      jobNumber: "J-2608-0421",
      slot: "9-1",
      customer: "Deshmukh Hospital",
      locality: "Saket",
      serviceType: "Generator AMC",
      visit: { n: 7, of: 12 },
      status: "WORK_DONE",
      technician: { id: "usr_0003", name: "Ramesh Yadav" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: 9_200_00,
    },
    {
      id: "j9",
      jobNumber: "J-2608-0417",
      slot: "9-1",
      customer: "Mrs. Deshpande",
      locality: "Vasant Kunj",
      serviceType: "AC servicing",
      visit: null,
      status: "SIGNED_OFF",
      technician: { id: "usr_0003", name: "Ramesh Yadav" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: 4_500_00,
    },
    {
      id: "j10",
      jobNumber: "J-2608-0437",
      slot: "5-8",
      customer: "Green Park Clinic",
      locality: "Green Park",
      serviceType: "AC servicing",
      visit: null,
      status: "SCHEDULED",
      technician: { id: "usr_0004", name: "Lakshminarayanan Subramaniam" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j11",
      jobNumber: "J-2608-0438",
      slot: "11:30",
      customer: "Anand Sweets",
      locality: "Karol Bagh",
      serviceType: "Deep freezer repair",
      visit: null,
      status: "IN_PROGRESS",
      technician: { id: "usr_0003", name: "Ramesh Yadav" },
      priority: "urgent",
      sla: null,
      visitAttempt: 1,
      valuePaise: 31_000_00,
    },
    {
      id: "j12",
      jobNumber: "J-2608-0402",
      slot: "5-8",
      customer: "Kapoor Residency",
      locality: "Greater Kailash",
      serviceType: "AC repair",
      visit: null,
      status: "WORK_DONE",
      technician: { id: "usr_0004", name: "Lakshminarayanan Subramaniam" },
      priority: "normal",
      sla: null,
      visitAttempt: 2,
      valuePaise: 6_800_00,
    },
    {
      id: "j13",
      jobNumber: "J-2608-0439",
      slot: "5-8",
      customer: "Sethi Enterprises",
      locality: "Mayapuri",
      serviceType: "Cold room AMC",
      visit: { n: 1, of: 6 },
      status: "SCHEDULED",
      technician: null,
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
    },
    {
      id: "j14",
      jobNumber: "J-2608-0409",
      slot: "9-1",
      customer: "Green Park Clinic",
      locality: "Green Park",
      serviceType: "AC servicing",
      visit: null,
      status: "SIGNED_OFF",
      technician: { id: "usr_0004", name: "Lakshminarayanan Subramaniam" },
      priority: "normal",
      sla: null,
      visitAttempt: 1,
      valuePaise: 4_500_00,
    },
  ],
  technicians: [
    {
      id: "usr_0003",
      name: "Ramesh Yadav",
      jobsToday: 5,
      status: { kind: "on_site", since: "11:42" },
      localities: ["Okhla Phase II", "Saket", "Karol Bagh"],
      skills: ["AC", "Refrigeration"],
    },
    {
      id: "usr_0004",
      name: "Lakshminarayanan Subramaniam",
      jobsToday: 5,
      status: { kind: "en_route", since: "12:05" },
      localities: ["Vasant Kunj", "Greater Kailash", "Green Park"],
      skills: ["AC", "Water treatment"],
    },
    {
      id: "usr_0008",
      name: "Imran Qureshi",
      jobsToday: 0,
      status: { kind: "free", since: null },
      localities: [],
      skills: ["Generator", "Electrical"],
    },
    {
      id: "usr_0007",
      name: "Deepak Verma",
      jobsToday: 0,
      // On leave — must be visible (so she knows why he has no work) but never
      // offered as an assignment target.
      status: { kind: "leave", since: null },
      localities: [],
      skills: ["AC"],
    },
  ],
  tomorrowJobs: 14,
  leadsDueToday: 7,
};

/* ------------------------------------------------------------------- query */

export const getBoard = defineQuery<void, Board>({
  key: "board.today",
  schema: boardSchema,
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});

/** Exposed so the technician-panel-down state can be exercised in review. */
export const uncomputableValue = uncomputable;
