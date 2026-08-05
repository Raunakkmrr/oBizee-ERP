/**
 * Job detail — PRD §6.5.
 *
 * **The one decision:** *what does this job need from me right now?* — assign,
 * reschedule, chase a part, call the customer, or bill it.
 *
 * The above-the-fold ordering in §6.5.1 is not a layout preference, and the
 * contract mirrors it: status carries an **elapsed duration** because "On site
 * since 11:42 answers the question she is about to be asked on the phone. A bare
 * 'On site' does not." Contract visit position is present because `Visit 3 of
 * 12` tells her whether the visit is contractually owed, "which changes whether
 * she is allowed to bump it". Asset warranty is above the fold because the
 * answer changes what she is allowed to charge.
 */
import { z } from "zod";
import { DataSourceError, defineQuery, type Fetched } from "./source";

/* ---------------------------------------------------------------- contract */

const contactSchema = z.object({
  name: z.string(),
  /** Role label is required — §6.4/§6.5 never show a bare number. */
  role: z.string(),
  phone: z.string(),
});

const serviceRecordSchema = z.object({
  date: z.string(),
  technician: z.string(),
  summary: z.string(),
});

const timelineEventSchema = z.object({
  id: z.string(),
  label: z.string(),
  actor: z.string(),
  at: z.string(),
  /** §4.2 rule 3: every event records whether it originated offline. */
  offline: z.boolean(),
  /** Coarse location, where the event captured one. */
  place: z.string().nullable(),
});

export const jobDetailSchema = z.object({
  id: z.string(),
  jobNumber: z.string(),
  status: z.string(),
  /** `since 11:42` — the elapsed part §6.5.1 insists on. Null when not in flight. */
  statusSince: z.string().nullable(),
  priority: z.enum(["normal", "urgent", "breakdown"]),
  customer: z.string(),
  serviceType: z.string(),
  visit: z.object({ n: z.number(), of: z.number() }).nullable(),
  /**
   * Who is on it. Carried from the board row rather than the fixture, so this
   * screen and the board can never name different people — and because the
   * detail page previously did not say who the technician was *at all*, which
   * is the second thing anyone asks about a job.
   */
  technician: z.object({ id: z.string(), name: z.string() }).nullable(),
  valuePaise: z.number().int().nullable(),

  site: z.object({
    addressLine: z.string(),
    /** §6.5.1: on its own line — "a landmark is how an Indian address is actually resolved". */
    landmark: z.string().nullable(),
    locality: z.string(),
    pincode: z.string(),
    mapQuery: z.string(),
    accessNotes: z.string().nullable(),
    contacts: z.array(contactSchema),
  }),

  asset: z
    .object({
      description: z.string(),
      serial: z.string().nullable(),
      warrantyTo: z.string().nullable(),
      lastServices: z.array(serviceRecordSchema),
      repeatFailure: z.string().nullable(),
    })
    .nullable(),

  timeline: z.array(timelineEventSchema),
  parts: z.array(
    z.object({ name: z.string(), qty: z.number(), unit: z.string() }),
  ),
  signOff: z
    .object({
      signerName: z.string(),
      at: z.string(),
      rating: z.number().int().min(1).max(5),
      /** §6.5.2: a pending image "must read as normal, not as an error". */
      signatureUploaded: z.boolean(),
    })
    .nullable(),
  invoiceNumber: z.string().nullable(),
});

export type JobDetail = z.infer<typeof jobDetailSchema>;

/* --------------------------------------------- §6.5.3 primary action table */

export type PrimaryAction = { label: string; href: string } | null;

/**
 * Exactly one primary action, determined by state — §6.5.3.
 *
 * "always the same colour and position (top-right of the action bar) so muscle
 * memory works". `PAID` and `CLOSED` deliberately return **null**: the spec says
 * follow-up is secondary only and those states get **no primary**, because
 * offering one invents work on a job that is finished.
 */
export function primaryActionFor(status: string): PrimaryAction {
  switch (status) {
    case "CREATED":
      return { label: "Schedule", href: "#schedule" };
    case "SCHEDULED":
      return { label: "Assign technician", href: "#assign" };
    case "ASSIGNED":
    case "EN_ROUTE":
    case "ON_SITE":
    case "IN_PROGRESS":
      // The office's only useful action while work is in progress.
      return { label: "Call technician", href: "#call-technician" };
    case "PARTS_AWAITED":
      return { label: "Schedule revisit", href: "#revisit" };
    case "CUSTOMER_UNAVAILABLE":
      return { label: "Reschedule", href: "#reschedule" };
    case "WORK_DONE":
      return { label: "Send sign-off link", href: "#signoff-link" };
    case "SIGNED_OFF":
      return { label: "Create invoice", href: "#invoice" };
    case "INVOICED":
      return { label: "Send payment reminder", href: "#reminder" };
    case "PAID":
    case "CLOSED":
      return null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ stage */

/**
 * What the screen is *for*, at this moment in the job's life.
 *
 * **The defect this fixes.** The detail screen was static across the whole
 * lifecycle: `Where` and `Asset` took the top row whether the technician was
 * still travelling or had finished two hours ago. But an address is what
 * matters *before* a visit and dead weight *after* it, and parts and sign-off
 * are exactly the reverse. Worst of it: on a finished job the only question is
 * "can I bill this?", and `Bill this job` was a tertiary outline button, fourth
 * in a row of five, while the filled primary was `Send sign-off link`.
 *
 * So the stage decides the question, the evidence for answering it, and which
 * sections are worth the top of the screen. The primary *action* still comes
 * from `primaryActionFor` — §6.5.3 fixes that table, and duplicating it here
 * would let the two drift.
 */
export type StageKey =
  | "unassigned"
  | "before_visit"
  | "at_site"
  | "blocked"
  | "to_bill"
  | "billed";

/** One line of evidence for the stage's question. */
export type Check = {
  label: string;
  /** `pending` is not `failed` — a customer who has not signed yet has not refused. */
  state: "done" | "pending" | "blocked";
  detail: string | null;
};

export type Stage = {
  key: StageKey;
  /** Asked as a question, because the screen exists to answer exactly one. */
  question: string;
  checks: Check[];
  /** Sections worth the top of the screen at this stage; the rest collapse. */
  lead: Array<"where" | "asset" | "timeline" | "parts" | "signoff">;
};

export function stageFor(
  job: JobDetail,
  policy: { allowBillingWithoutSignoff: boolean },
): Stage {
  if (job.invoiceNumber) {
    return {
      key: "billed",
      question: "Billed",
      checks: [
        { label: "Invoiced", state: "done", detail: job.invoiceNumber },
      ],
      lead: ["timeline", "parts"],
    };
  }

  if (job.status === "PARTS_AWAITED") {
    return {
      key: "blocked",
      question: "What is it waiting for?",
      checks: [
        {
          label: "Held for parts",
          state: "blocked",
          detail: job.statusSince ? `${job.statusSince} so far` : null,
        },
      ],
      lead: ["timeline", "parts", "where"],
    };
  }

  if (job.status === "WORK_DONE" || job.status === "SIGNED_OFF") {
    const signed = job.signOff !== null;
    return {
      key: "to_bill",
      question: "Can you bill this?",
      checks: [
        {
          label: "Work finished",
          state: "done",
          detail: job.statusSince ? `${job.statusSince} ago` : null,
        },
        {
          label: job.parts.length > 0 ? "Parts logged" : "No parts used",
          state: "done",
          detail:
            job.parts.length > 0 ? `${job.parts.length} recorded` : null,
        },
        {
          label: signed ? "Customer signed" : "Customer has not signed",
          state: signed ? "done" : "pending",
          detail: signed
            ? `${job.signOff?.signerName} · ${job.signOff?.at}`
            : // FR-1303: whether this actually stops her is a tenant policy,
              // so the copy states the consequence rather than guessing.
              policy.allowBillingWithoutSignoff
              ? "Your settings allow billing anyway"
              : "Required before invoicing, by your settings",
        },
      ],
      lead: ["timeline", "parts", "signoff"],
    };
  }

  if (
    job.status === "ON_SITE" ||
    job.status === "IN_PROGRESS" ||
    job.status === "EN_ROUTE"
  ) {
    return {
      key: "at_site",
      question: "What is happening at site?",
      checks: [
        {
          label: job.status === "EN_ROUTE" ? "On the way" : "At site",
          state: "pending",
          detail: [job.technician?.name, job.statusSince && `since ${job.statusSince}`]
            .filter(Boolean)
            .join(" · ") || null,
        },
      ],
      lead: ["timeline", "where", "asset"],
    };
  }

  if (job.technician === null) {
    return {
      key: "unassigned",
      question: "Who is going?",
      checks: [
        { label: "Nobody assigned", state: "blocked", detail: null },
      ],
      lead: ["where", "asset"],
    };
  }

  return {
    key: "before_visit",
    question: "Is he going to make it?",
    checks: [
      {
        label: "Assigned",
        state: "done",
        detail: job.technician.name,
      },
    ],
    // Before the visit the address *is* the job — this is the only stage where
    // it leads.
    lead: ["where", "asset"],
  };
}

/**
 * Whether the bill button should be offered as the way forward.
 *
 * Deliberately not "is the job done" — a tenant that permits billing without a
 * sign-off (FR-1303) can invoice a finished job today, and one that does not
 * cannot, and the screen must not offer an action that its own settings forbid.
 */
export function canBillNow(
  job: JobDetail,
  policy: { allowBillingWithoutSignoff: boolean },
): boolean {
  if (job.invoiceNumber) return false;
  if (job.signOff) return true;
  return job.status === "WORK_DONE" && policy.allowBillingWithoutSignoff;
}

/* ----------------------------------------------------------------- fixture */

/**
 * The depth a board row does not carry.
 *
 * A job created in this session has no site record, asset history or timeline
 * yet — so those sections render **legitimately empty** rather than borrowing
 * another job's. Every nullable field here is null on purpose; none of them is
 * a placeholder pretending to be data.
 */
const EMPTY_DEPTH: Omit<
  JobDetail,
  | "id"
  | "jobNumber"
  | "status"
  | "priority"
  | "customer"
  | "serviceType"
  | "valuePaise"
> = {
  statusSince: null,
  visit: null,
  technician: null,
  site: {
    addressLine: "Address not recorded yet",
    landmark: null,
    locality: "",
    pincode: "",
    mapQuery: "",
    accessNotes: null,
    contacts: [],
  },
  asset: null,
  timeline: [],
  parts: [],
  signOff: null,
  invoiceNumber: null,
};

const FIXTURES: Record<string, JobDetail> = {
  "J-2608-0398": {
    id: "j5",
    jobNumber: "J-2608-0398",
    status: "PARTS_AWAITED",
    statusSince: "6 days",
    priority: "normal",
    customer: "Shakti Industries",
    serviceType: "AC repair",
    visit: null,
    technician: { id: "u3", name: "Ramesh Yadav" },
    valuePaise: null,
    site: {
      addressLine: "Plot 14, MIDC Phase II",
      landmark: "Opposite Gurudwara, blue gate",
      locality: "Okhla Phase II",
      pincode: "110020",
      mapQuery: "Plot 14 MIDC Phase II Okhla Phase II 110020",
      accessNotes: "Gate pass at security, ask for Anil",
      contacts: [
        { name: "Anil Joshi", role: "Site in-charge", phone: "98200 12345" },
        { name: "Security", role: "Security", phone: "98200 99887" },
      ],
    },
    asset: {
      description: "Voltas 2T Cassette",
      serial: "VLT-88213",
      warrantyTo: "12 Mar 2027",
      lastServices: [
        { date: "12 Jun", technician: "Ramesh", summary: "Gas top-up" },
        { date: "14 Apr", technician: "Ramesh", summary: "Filter clean" },
        { date: "02 Feb", technician: "Imran", summary: "Compressor check" },
      ],
      repeatFailure: "3 breakdowns in 90 days",
    },
    timeline: [
      { id: "e1", label: "Job created", actor: "Priya", at: "26 Jul, 10:04 am", offline: false, place: null },
      { id: "e2", label: "Scheduled for 26 Jul, 1–5", actor: "Priya", at: "26 Jul, 10:05 am", offline: false, place: null },
      { id: "e3", label: "Assigned to Ramesh", actor: "Priya", at: "26 Jul, 10:06 am", offline: false, place: null },
      { id: "e4", label: "Start travel", actor: "Ramesh", at: "26 Jul, 1:20 pm", offline: false, place: "Okhla" },
      { id: "e5", label: "Reached site", actor: "Ramesh", at: "26 Jul, 1:52 pm", offline: true, place: "Okhla Phase II" },
      { id: "e6", label: "Work started", actor: "Ramesh", at: "26 Jul, 1:55 pm", offline: true, place: null },
      { id: "e7", label: "Parts awaited — 45 MFD capacitor not in van", actor: "Ramesh", at: "26 Jul, 2:31 pm", offline: true, place: null },
    ],
    parts: [],
    signOff: null,
    invoiceNumber: null,
  },
  /*
    The job the end-to-end flow lands on — lead to contract to work order to
    invoice — and until now the only one of the fourteen with no depth, so the
    screen at the end of the happy path was five empty panels and an apology.

    Deliberately the *awkward* shape rather than the tidy one: work finished but
    the customer has not signed, parts consumed off the van, a repeat failure on
    the asset, and one timeline event captured while the technician had no
    signal. That is the state a coordinator actually stares at when deciding
    whether she can bill.
  */
  "J-2608-0421": {
    id: "j10",
    jobNumber: "J-2608-0421",
    status: "WORK_DONE",
    statusSince: "2 hours",
    priority: "normal",
    customer: "Deshmukh Hospital",
    serviceType: "Generator AMC",
    visit: { n: 7, of: 12 },
    technician: { id: "u3", name: "Ramesh Yadav" },
    valuePaise: 1085600,
    site: {
      addressLine: "Block C, Basement 2, Deshmukh Hospital",
      landmark: "Service ramp behind the OPD block",
      locality: "Saket",
      pincode: "110017",
      mapQuery: "Deshmukh Hospital Saket 110017",
      accessNotes: "Biomedical clearance needed before entering the plant room",
      contacts: [
        { name: "Dr. Meera Rao", role: "Administrator", phone: "98110 34567" },
        { name: "Sandeep", role: "Facility in-charge", phone: "98110 77120" },
      ],
    },
    asset: {
      description: "Kirloskar 125 kVA DG set",
      serial: "KOEL-125-4471",
      warrantyTo: null,
      lastServices: [
        { date: "04 Jul", technician: "Ramesh", summary: "Oil and filter change" },
        { date: "06 Jun", technician: "Ramesh", summary: "Battery replaced" },
        { date: "09 May", technician: "Deepak", summary: "Coolant top-up, load test" },
      ],
      repeatFailure: "Battery replaced twice in 90 days",
    },
    timeline: [
      { id: "t1", label: "Job created from contract AMC-2627-0028", actor: "System", at: "5 Aug, 6:00 am", offline: false, place: null },
      { id: "t2", label: "Scheduled for 5 Aug, 9\u20131", actor: "Priya", at: "5 Aug, 8:12 am", offline: false, place: null },
      { id: "t3", label: "Assigned to Ramesh", actor: "Priya", at: "5 Aug, 8:13 am", offline: false, place: null },
      { id: "t4", label: "Start travel", actor: "Ramesh", at: "5 Aug, 9:05 am", offline: false, place: "Okhla" },
      { id: "t5", label: "Reached site", actor: "Ramesh", at: "5 Aug, 9:41 am", offline: false, place: "Saket" },
      { id: "t6", label: "Work started", actor: "Ramesh", at: "5 Aug, 9:47 am", offline: false, place: null },
      { id: "t7", label: "Load test at 75% \u2014 held for 30 minutes", actor: "Ramesh", at: "5 Aug, 10:20 am", offline: true, place: null },
      { id: "t8", label: "Work done", actor: "Ramesh", at: "5 Aug, 11:02 am", offline: false, place: null },
    ],
    parts: [
      { name: "Diesel filter (Kirloskar)", qty: 1, unit: "no" },
      { name: "Engine oil 15W-40", qty: 12, unit: "litre" },
      { name: "Coolant concentrate", qty: 2, unit: "litre" },
    ],
    signOff: null,
    invoiceNumber: null,
  },
  "J-2608-0417": {
    id: "j9",
    jobNumber: "J-2608-0417",
    status: "SIGNED_OFF",
    statusSince: "40 minutes",
    priority: "normal",
    technician: { id: "u3", name: "Ramesh Yadav" },
    customer: "Mrs. Deshpande",
    serviceType: "AC servicing",
    visit: null,
    valuePaise: 450000,
    site: {
      addressLine: "B-402, Sunrise Apartments",
      landmark: "Behind Vasant Kunj market",
      locality: "Vasant Kunj",
      pincode: "110070",
      mapQuery: "B-402 Sunrise Apartments Vasant Kunj 110070",
      accessNotes: null,
      contacts: [
        { name: "Mrs. Deshpande", role: "Owner", phone: "98110 22334" },
      ],
    },
    asset: null,
    timeline: [
      { id: "e1", label: "Job created", actor: "Priya", at: "1 Aug, 8:40 am", offline: false, place: null },
      { id: "e2", label: "Assigned to Ramesh", actor: "Priya", at: "1 Aug, 8:41 am", offline: false, place: null },
      { id: "e3", label: "Reached site", actor: "Ramesh", at: "1 Aug, 9:35 am", offline: false, place: "Vasant Kunj" },
      { id: "e4", label: "Work done", actor: "Ramesh", at: "1 Aug, 10:50 am", offline: false, place: null },
      { id: "e5", label: "Signed off — 1 star, “Left dirty”", actor: "Mrs. Deshpande", at: "1 Aug, 10:52 am", offline: false, place: null },
    ],
    parts: [{ name: "Capacitor 45 MFD", qty: 1, unit: "no" }],
    signOff: {
      signerName: "Mrs. Deshpande",
      at: "1 Aug, 10:52 am",
      rating: 1,
      // Pending upload — must read as normal, not as an error (§6.5.2).
      signatureUploaded: false,
    },
    invoiceNumber: null,
  },
};

export const getJobDetail = defineQuery<string, JobDetail>({
  key: "job.detail",
  schema: jobDetailSchema,
  /**
   * **The store is the source of truth for a job's live facts.**
   *
   * This used to read only from `FIXTURES`, and an unknown job number fell back
   * to `FIXTURES["J-2608-0398"]` — so `/jobs/J-2608-0421` silently rendered a
   * *different job's* customer, site and status under the URL you asked for.
   * That is worse than a 404: it is a fabricated record, the same class of lie
   * as rendering ₹0 for a value we could not compute.
   *
   * Now: status, technician and value come from the store, so this screen and
   * the board can never disagree. The fixture supplies only the extra depth a
   * board row does not carry — site, contacts, asset, timeline — and a job with
   * no such fixture still renders, with those sections legitimately empty.
   */
  fixture: async (jobNumber): Promise<Fetched<unknown>> => {
    const { getState } = await import("./store");
    const row = getState().board.jobs.find(
      (candidate) => candidate.jobNumber === jobNumber,
    );

    if (!row) {
      throw new DataSourceError({
        kind: "validation",
        subject: jobNumber,
        message: `No job numbered ${jobNumber}.`,
        fix: "Check the number, or open it from the jobs list.",
        code: "JOB_NOT_FOUND",
      });
    }

    const depth = FIXTURES[jobNumber] ?? null;
    const job: JobDetail = {
      ...(depth ?? EMPTY_DEPTH),
      id: row.id,
      jobNumber: row.jobNumber,
      // Live facts always win over the fixture.
      status: row.status,
      priority: row.priority,
      technician: row.technician,
      customer: row.customer,
      serviceType: row.serviceType,
      valuePaise: row.valuePaise,
    };

    return {
      raw: job,
      /*
        Driven by the data, not by the mere presence of an asset.

        This used to fire for *every* job that had an asset, so the banner
        announced "Service history unavailable" directly above a rendered list
        of the last three services. A degradation notice that contradicts the
        content beside it is worse than no notice: it teaches the reader that
        the warnings on this product are noise, and then they skip a real one.

        The condition now *is* the claim — an asset on record whose history did
        not come back — so the banner and the panel cannot disagree.
      */
      partialFailures:
        job.asset && job.asset.lastServices.length === 0
          ? [
              {
                region: "Service history",
                stillWorks: "Asset details and warranty",
                code: "ASSET_HISTORY_DOWN",
              },
            ]
          : [],
    };
  },
});
