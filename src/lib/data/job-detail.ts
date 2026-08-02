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
import { defineQuery, type Fetched } from "./source";

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

/* ----------------------------------------------------------------- fixture */

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
  "J-2608-0417": {
    id: "j9",
    jobNumber: "J-2608-0417",
    status: "SIGNED_OFF",
    statusSince: "40 minutes",
    priority: "normal",
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
  fixture: (jobNumber): Fetched<unknown> => {
    const job = FIXTURES[jobNumber] ?? FIXTURES["J-2608-0398"];
    return {
      raw: job,
      // §6.5.2's named partial: asset history down. The block still renders its
      // current details, so the coordinator can still answer "under warranty?".
      partialFailures: job.asset
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
