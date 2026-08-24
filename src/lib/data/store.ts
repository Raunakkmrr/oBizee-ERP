"use client";

/**
 * The write side of the data layer.
 *
 * **Why this exists at all, stated as a correction.** `defineQuery` was built
 * first and centralised every *read* behind one seam. No matching write path was
 * ever built, so every primary action in the product — "Create contract",
 * "Create work order", "Assign" — was a `<Link>` that navigated and changed
 * nothing. `Query<T>` is a read type; the type system could not express "the
 * user changed something". Suspending the backend (DR-9) was meant to remove the
 * *network*, not remove behaviour, and a frontend-first build whose whole
 * purpose is to prove the interaction model cannot prove it if nothing persists.
 *
 * The shape here mirrors the read side deliberately:
 *
 * - Fixtures are the store's **seed**, not its source. `getLeads()` and friends
 *   now read from this store, so a write is visible on every screen at once.
 * - Persistence is **encrypted** (`./crypto`), because the moment a design
 *   partner walks this flow they type in their own customers' names and numbers.
 * - Reducers are pure and exported, so behaviour is testable without a browser.
 *   These are the first tests in this repo that cover behaviour rather than
 *   arithmetic.
 *
 * **Hydration is a real state.** Web Crypto is async and `getSnapshot` must be
 * synchronous, so the store boots on the seed, decrypts in the background, and
 * swaps. Screens must be able to tell "still opening the vault" from "loading a
 * query" — that is a fifth state alongside §6.3's four, and it is modelled here
 * rather than papered over with a flash of empty screens.
 */
import { computeTotals, derivePlaceOfSupply, type InvoiceLine } from "@/lib/tax";
import { asPaise, type Paise } from "@/lib/money";
import { z } from "zod";
import { SEED_LEADS, type Lead, type LeadsData } from "./leads";
import { SEED_BOARD, type Board, type JobRow } from "./board";
import { SEED_MONEY, type MoneyData } from "./money";
import {
  SEED_PEOPLE,
  nextPersonId,
  personSchema,
  type Person,
} from "./people";
import {
  BILLING_LABEL,
  SEED_CONTRACTS,
  VISITS_PER_YEAR,
  type BillingFrequency,
  type Contract,
  type Coverage,
  type Recurrence,
  type ReschedulePolicy,
  RENEWAL_SOURCE,
  visitsToGenerate,
} from "./contracts";
import {
  SEED_ADVANCES,
  adjustAdvance,
  type Advance,
} from "./advances";
import {
  SEED_CUSTOMERS,
  billingIdentityFor,
  type BillingIdentity,
  type Customer,
} from "./customers";
import { SEED_VENDORS, type Vendor } from "./vendors";
import { billTotals, type PurchaseBill } from "./purchases";
import { issue, seriesStateSchema, type SeriesState } from "./series";
import {
  append as appendAudit,
  auditSchema,
  isAuditable,
  summarise,
  type AuditEntry,
} from "./audit";
import { SEED_TENANT } from "./fixtures/tenant";
import { open, seal, destroyKey, unavailableMessage } from "./crypto";

const STORAGE_KEY = "obez-erp-store";
/** Debounce window for writes — a chip toggle should not hit crypto per click. */
const PERSIST_DELAY_MS = 400;

/* ------------------------------------------------------------------ state */

export type Invoice = {
  id: string;
  number: string;
  jobId: string | null;
  jobNumber: string | null;
  contractId: string | null;
  /** Which point in the contract's billing schedule this settles. */
  contractPoint: number | null;
  customer: string;
  /**
   * Who the bill is addressed to, as it stood when the invoice was issued.
   *
   * Null when the customer is not on file — the screen then says so rather than
   * printing somebody else's. The defect this exists to prevent: a hardcoded
   * "Registered office, Pune / GSTIN 27AABCS1234M1Z5 / Plot 14, MIDC Phase II"
   * stamped onto every invoice regardless of who it was for.
   */
  billTo: BillingIdentity | null;
  dateWord: string;
  head: "CGST_SGST" | "IGST";
  explanation: string;
  lines: InvoiceLine[];
  taxablePaise: number;
  totalTaxPaise: number;
  roundOffPaise: number;
  grandTotalPaise: number;
  status: "DRAFT" | "ISSUED";
};

export type StoreState = {
  leads: LeadsData;
  board: Board;
  contracts: Contract[];
  invoices: Invoice[];
  money: MoneyData;
  /** One record per human — the board's technicians are derived from these. */
  people: Person[];
  /**
   * The customer register.
   *
   * A slice rather than a fixture because an invoice's place of supply — and
   * therefore its tax head — comes from a site on this list. A register that
   * cannot be added to is a register that blocks billing.
   */
  customers: Customer[];
  /** FR-705 — who we buy from, and everything the tax rules ask about them. */
  vendors: Vendor[];
  /** FR-705/807/906 — inward bills, with reverse charge and TDS on each. */
  purchases: PurchaseBill[];
  /**
   * Whose session this is.
   *
   * Until auth exists (DR-9) the acting user was a hardcoded const — Priya, a
   * coordinator — and §6.2 keeps Settings out of a coordinator's navigation.
   * The result was a build where People management existed and was unreachable,
   * with no way to become anyone else. Holding it in the store makes the
   * role-gating demonstrable instead of invisible.
   */
  actingAs: string;
  /** FR-811: numbering is per branch, doc type and financial year. */
  /** FR-810 — money taken before the work, and the vouchers that account for it. */
  advances: Advance[];
  /** FR-1305 — append-only, newest first. Never updated, never deleted. */
  audit: AuditEntry[];
  /**
   * FR-811's counters, keyed by (branch, doc type, financial year).
   *
   * Separate from `seq`, which numbers *records* (`job_441`) and may be
   * anything. This one is the statutory series a customer and the department
   * both read, so it resets on 1 April and never shares a counter across
   * branches or document types.
   */
  series: SeriesState;
  seq: {
    job: number;
    contract: number;
    invoice: number;
    advance: number;
    lead: number;
  };
};

export type HydrationStatus =
  | { kind: "hydrating" }
  | { kind: "ready"; restored: boolean }
  /** Persistence impossible — the app still works, in memory, and says so. */
  | { kind: "unavailable"; message: string }
  /** Stored data could not be read and was discarded. Never silent. */
  | { kind: "reset"; message: string };

export function seedState(): StoreState {
  return {
    leads: structuredClone(SEED_LEADS),
    board: structuredClone(SEED_BOARD),
    contracts: structuredClone(SEED_CONTRACTS.contracts) as Contract[],
    money: structuredClone(SEED_MONEY) as MoneyData,
    people: structuredClone(SEED_PEOPLE),
    customers: structuredClone(SEED_CUSTOMERS.customers) as Customer[],
    vendors: structuredClone(SEED_VENDORS),
    purchases: [],
    // Priya, the coordinator — the persona §6.4 is written for.
    actingAs: "usr_0002",
    invoices: [],
    advances: structuredClone(SEED_ADVANCES),
    // Empty on purpose: a seeded trail would be a record of things that did not
    // happen, which is the one thing an audit trail must never contain.
    audit: [],
    // Mid-year, as a live tenant would be — so the first thing this build
    // issues is 0441 / 0150 / 0007, not a suspiciously round 0001.
    series: {
      "brn_0001:job:2026": 440,
      "brn_0001:invoice:2026": 149,
      "brn_0001:receipt_voucher:2026": 6,
    },
    seq: { job: 440, contract: 32, invoice: 149, advance: 6, lead: 151 },
  };
}

/**
 * Does a restored blob carry every slice this build expects?
 *
 * Top-level only, deliberately. A deep structural check would be a schema
 * validator, and there is already one of those at the query boundary; this
 * catches the specific failure of a slice that did not exist when the data was
 * written.
 */
function hasEverySlice(value: unknown): value is StoreState {
  if (typeof value !== "object" || value === null) return false;
  if (!Object.keys(seedState()).every((key) => key in value)) return false;

  /*
    Slice names are not enough.

    The first version of this guard checked only that every top-level slice
    existed, and caught `money` being added. It did *not* catch `grade` being
    added to `Person` — the `people` slice was still present, so a blob written
    before the field restored happily and every grade came back `undefined`.
    Same class of bug, one level deeper: silently absent rather than loudly
    stale.

    `people` is validated against its own schema because it is the slice whose
    shape has changed twice. `series` is validated because a wrong counter is
    worse than a missing one: it would issue a duplicate statutory number
    rather than fail. The others are not yet schema-checked here, which is a
    known gap rather than a decision — recorded so the next person adding a
    field knows the guard will not catch them.
  */
  const { people, series, audit, invoices } = value as {
    people: unknown;
    series: unknown;
    audit: unknown;
    invoices: unknown;
  };

  /*
    `invoices` is checked for the field that was added last, not against a full
    schema. An invoice stored before `billTo` existed restores with it
    undefined, and the screen would then have nothing to print for the customer
    it is addressed to — which is how a fixture identity ends up on a real
    document.
  */
  const invoicesCarryBillTo =
    Array.isArray(invoices) &&
    invoices.every(
      (invoice) =>
        typeof invoice === "object" && invoice !== null && "billTo" in invoice,
    );

  return (
    z.array(personSchema).safeParse(people).success &&
    seriesStateSchema.safeParse(series).success &&
    auditSchema.safeParse(audit).success &&
    invoicesCarryBillTo
  );
}

/* ---------------------------------------------------------------- actions */

export type Action =
  | {
      type: "LOG_LEAD_OUTCOME";
      leadId: string;
      outcome: string;
      note: string;
      followUp: string | null;
    }
  | {
      type: "CREATE_CONTRACT";
      customer: string;
      site: string;
      annualValuePaise: number;
      coverage: Coverage;
      recurrence: Recurrence;
      billing: BillingFrequency;
      anchorDay: number;
      reschedulePolicy: ReschedulePolicy;
      fromLeadReference: string | null;
    }
  | {
      type: "CREATE_JOB";
      customer: string;
      locality: string;
      serviceType: string;
      slot: string;
      priority: "normal" | "urgent" | "breakdown";
      technicianId: string | null;
      technicianName: string | null;
      fromLeadReference: string | null;
    }
  | {
      /**
       * Moving a lead between pipeline stages — the board's drag, and the
       * "Move to" menu that does the same thing from the keyboard.
       *
       * It is an action rather than local component state for the same reason
       * every other change here is: the pipeline, the follow-up queue and the
       * nav badge all read the same lead, and a stage that lived in the board's
       * `useState` would be forgotten the moment the tab changed.
       */
      type: "MOVE_LEAD_STAGE";
      leadId: string;
      stage: string;
      /** Who did it — the timeline entry names a person, never "system". */
      actor: string;
    }
  | { type: "ASSIGN_JOB"; jobId: string; technicianId: string; technicianName: string }
  | { type: "CREATE_INVOICE_FROM_JOB"; jobId: string }
  | {
      /**
       * FR-810. Money arriving before the service is a taxable event in its own
       * right, so recording it issues a Receipt Voucher rather than sitting as
       * an unexplained credit until somebody raises an invoice.
       */
      type: "RECORD_ADVANCE";
      customer: string;
      receiptPaise: number;
      head: "CGST_SGST" | "IGST";
      contractId: string | null;
    }
  | { type: "ADJUST_ADVANCE"; voucherNumber: string; invoiceNumber: string }
  | {
      /**
       * An invoice that comes from no job and no contract — a counter sale, a
       * one-off supply. Deliberately the third way in rather than the default:
       * a register full of typed invoices reconciles with no work.
       */
      type: "CREATE_ADHOC_INVOICE";
      customer: string;
      lines: InvoiceLine[];
    }
  | {
      /**
       * FR-502. The contract form has always said "generate visits"; this is
       * what makes the button honest. Idempotent by `visitKey`, so a second
       * run adds nothing.
       */
      type: "GENERATE_CONTRACT_VISITS";
      contractId: string;
    }
  | {
      /**
       * FR-506. A renewal is a deal, not a reminder — it goes into the
       * pipeline where silence detection and ownership already live.
       */
      type: "WORK_RENEWAL_AS_LEAD";
      contractId: string;
      /** Who took it — FR-103 makes this immutable once set. */
      actor: string;
    }
  | {
      /**
       * Raising a contract's scheduled invoice — the recurring half of billing.
       *
       * The only invoice action used to be `CREATE_INVOICE_FROM_JOB`, which
       * cannot serve an advance-billed AMC: the job it would bill from has not
       * happened yet. A six-month monthly contract therefore knew it owed six
       * invoices and had no way to raise any of them.
       */
      type: "CREATE_INVOICE_FROM_CONTRACT";
      contractId: string;
      /** Which point in the schedule, so the same month cannot be billed twice. */
      pointNumber: number;
      amountPaise: number;
    }
  | {
      /** Moving a job to a different day/slot — the Reschedule button. */
      type: "RESCHEDULE_JOB";
      jobId: string;
      slot: string;
    }
  | {
      /**
       * Paying a vendor bill. This is the action that *saves the deduction*, so
       * it is the one control on the money screen that must not be decorative.
       */
      type: "MARK_PAYABLE_PAID";
      billId: string;
    }
  | {
      /** Adding someone to the directory — Settings → People → Invite. */
      type: "ADD_PERSON";
      person: Omit<Person, "id">;
    }
  | { type: "UPDATE_PERSON"; id: string; changes: Partial<Omit<Person, "id">> }
  | {
      /**
       * Leaving, not deleting. A technician who quits still owns the history of
       * every job he closed, so the record stays and stops being assignable.
       */
      type: "SET_PERSON_ACTIVE";
      id: string;
      active: boolean;
    }
  | {
      /**
       * FR-201. A customer and their first site arrive together, because a
       * customer with no site has no place of supply and therefore cannot be
       * billed — half a record that blocks the thing it exists to enable.
       */
      type: "ADD_CUSTOMER";
      name: string;
      customerType: "INDIVIDUAL" | "BUSINESS";
      gstin: string | null;
      creditDays: number;
      site: {
        label: string;
        addressLine1: string;
        locality: string;
        city: string;
        stateCode: string;
        pincode: string;
        landmark: string | null;
      };
      contact: { name: string; phone: string } | null;
    }
  | {
      /** FR-705. A vendor is created with everything the tax rules need at once. */
      type: "ADD_VENDOR";
      vendor: Omit<Vendor, "id">;
    }
  | {
      /**
       * FR-705/807/906. Reverse charge and the TDS section arrive as decisions
       * the reader confirmed, never as something this reducer inferred.
       */
      type: "RECORD_PURCHASE";
      vendorId: string;
      vendorBillNumber: string;
      billDate: string;
      description: string;
      taxablePaise: number;
      gstPercent: number;
      reverseCharge: boolean;
      tdsSection: PurchaseBill["tdsSection"];
      tdsPaise: number;
    }
  | { type: "MARK_PURCHASE_PAID"; billId: string }
  | { type: "ACT_AS"; personId: string }
  | { type: "RESET" };

/* --------------------------------------------------------------- helpers */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/*
  Job, invoice and receipt-voucher numbers are issued by `series.ts` (FR-811),
  not formatted here. Three local formatters off one flat counter is what let
  the financial year roll without the number resetting, and made the branch
  invisible to the series.
*/

/**
 * Add a contract's due visits to the board — FR-502's whole mechanic.
 *
 * Shared by `CREATE_CONTRACT` (so the form's "generate visits" button tells the
 * truth) and `GENERATE_CONTRACT_VISITS` (so a contract signed months ago can be
 * caught up). Idempotent by `visitKey` in both directions.
 */
function withGeneratedVisits(
  state: StoreState,
  contract: Contract,
  now: Date,
): StoreState {
  const existing = new Set(
    state.board.jobs
      .map((job) => job.visitKey)
      .filter((key): key is string => key !== null),
  );
  const planned = visitsToGenerate(contract, existing, now);
  if (planned.length === 0) return state;

  let seq = state.seq.job;
  let series = state.series;
  const created = planned.map((visit): JobRow => {
    seq += 1;
    // Numbered on the visit's own date, so a job falling in the next financial
    // year takes that year's series rather than this one's.
    const issued = issue(series, SEED_TENANT.branches[0], "job", visit.on);
    series = issued.next;
    return {
      id: `job_${seq}`,
      jobNumber: issued.number,
      // A generated visit carries the contract's slot promise, not a timestamp
      // nobody agreed to (FR-203).
      slot: "9-1",
      customer: contract.customer,
      locality: contract.site,
      serviceType: visit.scope,
      visit: { n: visit.number, of: visit.of },
      status: "CREATED",
      technician: null,
      priority: "normal",
      // No SLA: a scheduled visit is owed on its date, not within hours of a
      // call. Inventing one would badge the whole board late.
      sla: null,
      visitAttempt: 1,
      valuePaise: null,
      visitKey: visit.key,
      scheduledDate: visit.on.toISOString().slice(0, 10),
    };
  });

  return {
    ...state,
    board: {
      ...state.board,
      jobs: [...created, ...state.board.jobs],
      counters: {
        ...state.board.counters,
        unassigned: state.board.counters.unassigned + created.length,
      },
    },
    series,
    seq: { ...state.seq, job: seq },
  };
}

/** `L-2608-0152` — leads follow the same month-seq shape as jobs. */
function leadReference(seq: number, now: Date): string {
  const yy = String(now.getFullYear()).slice(2);
  return `L-${yy}${pad(now.getMonth() + 1, 2)}-${pad(seq, 4)}`;
}

function contractReference(seq: number, now: Date): string {
  const year = now.getFullYear();
  const fyStart = now.getMonth() >= 3 ? year : year - 1;
  return `AMC-${String(fyStart).slice(2)}${String(fyStart + 1).slice(2)}-${pad(seq, 4)}`;
}

/**
 * Stage codes as words, for the sentence written into the activity trail.
 * `STAGE_LABEL` lives in `leads.ts`; importing it here would make the store
 * depend on a screen's module, so the two words that end up in a *stored*
 * string are kept beside the reducer that writes them.
 */
const STAGE_WORD: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  SURVEY_SCHEDULED: "Survey scheduled",
  QUOTED: "Quoted",
  ASSIGNED: "Assigned",
  PARKED: "Parked",
};

function dateWord(now: Date): string {
  return now.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/* --------------------------------------------------------------- reducer */

/**
 * Pure. `now` is a parameter rather than a `new Date()` call inside, so every
 * numbering and dating rule is testable without freezing the clock globally.
 */
/**
 * The reducer, plus FR-1305's trail.
 *
 * Auditing is a wrapper rather than a line in each case, because "every
 * mutation" is a rule that survives the next action being added only if nobody
 * has to remember it. A state the action did not change produces no entry — a
 * trail full of no-ops is a trail nobody reads.
 */
export function reduce(state: StoreState, action: Action, now: Date): StoreState {
  const next = applyAction(state, action, now);
  if (next === state || !isAuditable(action.type)) return next;

  const actor =
    next.people.find((person) => person.id === next.actingAs)?.name ??
    state.people.find((person) => person.id === state.actingAs)?.name ??
    "Unknown";

  return {
    ...next,
    audit: appendAudit(next.audit, {
      id: `aud_${now.getTime()}_${next.audit.length}`,
      at: now.toISOString(),
      actor,
      action: action.type,
      summary: summarise(action as unknown as { type: string } & Record<string, unknown>),
      // Every write today comes from this browser. It becomes `offline_sync`
      // when the technician app replays a queue, which is why the field exists
      // before that app does.
      origin: "web",
      occurredAt: null,
    }),
  };
}

function applyAction(state: StoreState, action: Action, now: Date): StoreState {
  switch (action.type) {
    case "RESET":
      return seedState();

    case "LOG_LEAD_OUTCOME": {
      const leads = state.leads.leads.map((lead): Lead => {
        if (lead.id !== action.leadId) return lead;
        const terminal = action.outcome === "Won" || action.outcome === "Lost";
        return {
          ...lead,
          stage: terminal ? action.outcome.toUpperCase() : lead.stage,
          lastActivity: {
            date: dateWord(now).replace(/ \d{4}$/, ""),
            text: action.note.trim() || action.outcome,
          },
          // A won or lost lead leaves the queue; a live one keeps its place and
          // its date. Dropping the row on every outcome would lose the thread.
          dueWord: terminal ? action.outcome : lead.dueWord,
          group: terminal ? "later" : lead.group,
          daysOverdue: terminal ? -999 : lead.daysOverdue,
        };
      });
      return { ...state, leads: { ...state.leads, leads } };
    }

    case "CREATE_CONTRACT": {
      const seq = state.seq.contract + 1;
      const visits = VISITS_PER_YEAR[action.recurrence];
      const contract: Contract = {
        id: `ctr_${seq}`,
        reference: contractReference(seq, now),
        // Nothing placed yet: the visits are generated by the server, and a
        // locally-created contract has not been through that.
        visitsPending: 0,
        customer: action.customer,
        site: action.site,
        annualValuePaise: action.annualValuePaise,
        coverage: action.coverage,
        billing: action.billing,
        startDate: dateWord(now),
        endDate: dateWord(new Date(now.getTime() + 364 * 86_400_000)),
        termDays: 365,
        // Created today, so nothing has elapsed — and `scheduleProgress` must
        // therefore never call it behind on day one.
        daysRemaining: 365,
        status: "ACTIVE",
        reschedulePolicy: action.reschedulePolicy,
        schedules: [
          {
            id: `sch_${seq}_1`,
            scope: `${action.customer} — ${action.site}`,
            recurrence: action.recurrence,
            anchorDay: action.anchorDay,
            visitsDone: 0,
            visitsCommitted: visits,
          },
        ],
      };
      // FR-502: the button says "generate visits", so it generates them.
      return withGeneratedVisits(
        {
          ...state,
          contracts: [contract, ...state.contracts],
          seq: { ...state.seq, contract: seq },
        },
        contract,
        now,
      );
    }

    case "GENERATE_CONTRACT_VISITS": {
      const contract = state.contracts.find(
        (candidate) => candidate.id === action.contractId,
      );
      if (!contract) return state;
      return withGeneratedVisits(state, contract, now);
    }

    case "WORK_RENEWAL_AS_LEAD": {
      const contract = state.contracts.find(
        (candidate) => candidate.id === action.contractId,
      );
      if (!contract) return state;

      /*
        Idempotent for the same reason generation is: two renewal leads for one
        contract means two people ringing the same customer.

        Matched on the contract's own reference, not the customer name — a
        customer with a lift AMC and a chiller AMC has two contracts, each
        renewing on its own date, and name-matching would silently swallow the
        second one.
      */
      const already = state.leads.leads.some(
        (lead) =>
          lead.source === RENEWAL_SOURCE &&
          lead.lastActivity?.text.startsWith(contract.reference) === true,
      );
      if (already) return state;

      const seq = state.seq.lead + 1;
      const lead: Lead = {
        id: `lead_${seq}`,
        reference: leadReference(seq, now),
        name: contract.customer,
        locality: contract.site,
        // Unknown until the record is opened — a fabricated number is worse
        // than a blank one, because somebody would dial it.
        phone: "",
        stage: "NEW",
        dueWord: "Due today",
        group: "today",
        daysOverdue: 0,
        lastActivity: {
          date: dateWord(now),
          text: `${contract.reference} expires in ${contract.daysRemaining} days`,
        },
        // Not quoted yet. FR-506 says renewal is worked, not assumed renewed,
        // so carrying the old contract value across would flatter the pipeline.
        quotedPaise: null,
        quotedUnavailable: false,
        owner: action.actor,
        source: RENEWAL_SOURCE,
        takenBy: action.actor,
      };

      return {
        ...state,
        leads: { ...state.leads, leads: [lead, ...state.leads.leads] },
        seq: { ...state.seq, lead: seq },
      };
    }

    case "CREATE_JOB": {
      const seq = state.seq.job + 1;
      const issued = issue(state.series, SEED_TENANT.branches[0], "job", now);
      const job: JobRow = {
        id: `job_${seq}`,
        jobNumber: issued.number,
        slot: action.slot,
        customer: action.customer,
        locality: action.locality,
        serviceType: action.serviceType,
        visit: null,
        status: action.technicianId ? "ASSIGNED" : "CREATED",
        technician:
          action.technicianId && action.technicianName
            ? { id: action.technicianId, name: action.technicianName }
            : null,
        priority: action.priority,
        sla: null,
        visitAttempt: 1,
        // No value until it is quoted or billed. A fabricated 0 would render as
        // a free job on the Jobs list.
        valuePaise: null,
        // Ad-hoc, so it is not the nth visit of any contract.
        visitKey: null,
        /*
          Undated on purpose. The new-job form collects a slot but never a day,
          so claiming one here would invent a promise nobody made — and the
          Jobs list now marks an undated job rather than hiding it.
        */
        scheduledDate: null,
      };
      return {
        ...state,
        board: {
          ...state.board,
          jobs: [job, ...state.board.jobs],
          counters: {
            ...state.board.counters,
            unassigned:
              state.board.counters.unassigned + (action.technicianId ? 0 : 1),
          },
        },
        series: issued.next,
        seq: { ...state.seq, job: seq },
      };
    }

    case "MOVE_LEAD_STAGE": {
      const leads = state.leads.leads.map((lead): Lead => {
        if (lead.id !== action.leadId) return lead;
        // Moving a lead is a contact-shaped event: it resets the silence clock,
        // because somebody just looked at this deal and made a decision about
        // it. Leaving `lastActivity` alone would keep the card flagged silent
        // while the owner was demonstrably working it.
        return {
          ...lead,
          stage: action.stage,
          lastActivity: {
            date: dateWord(now).replace(/ \d{4}$/, ""),
            text: `Moved to ${STAGE_WORD[action.stage] ?? action.stage} by ${action.actor}`,
          },
        };
      });
      return { ...state, leads: { ...state.leads, leads } };
    }

    case "ADD_CUSTOMER": {
      const seq = state.customers.length + 1;
      const stamp = now.getTime();
      const customer: Customer = {
        id: `cus_${seq}_${stamp}`,
        name: action.name,
        customerType: action.customerType,
        gstin: action.gstin,
        // FR-802 compares the site's state; the billing state is where the
        // GSTIN is registered, which is the site's own until a second address
        // is captured.
        billingStateCode: action.site.stateCode,
        creditDays: action.creditDays,
        // Nothing owed by a customer who has never been billed. A seeded
        // figure here would be a debt nobody incurred.
        outstandingPaise: 0,
        sites: [
          {
            id: `site_${seq}_${stamp}`,
            label: action.site.label,
            addressLine1: action.site.addressLine1,
            locality: action.site.locality,
            city: action.site.city,
            stateCode: action.site.stateCode,
            pincode: action.site.pincode,
            landmark: action.site.landmark,
            accessNotes: null,
            contacts: action.contact
              ? [
                  {
                    id: `con_${seq}_${stamp}`,
                    name: action.contact.name,
                    phone: action.contact.phone,
                    // Assumed the same until told otherwise — §7.6 keeps it a
                    // separate field precisely because it often differs.
                    whatsapp: action.contact.phone,
                    roleLabel: "OWNER",
                    isPrimary: true,
                  },
                ]
              : [],
            assets: [],
            timeline: [],
          },
        ],
      };
      return { ...state, customers: [customer, ...state.customers] };
    }

    case "ADD_VENDOR": {
      const vendor: Vendor = {
        ...action.vendor,
        id: `ven_${state.vendors.length + 1}_${now.getTime()}`,
      };
      return { ...state, vendors: [vendor, ...state.vendors] };
    }

    case "RECORD_PURCHASE": {
      const vendor = state.vendors.find((entry) => entry.id === action.vendorId);
      if (!vendor) return state;

      const totals = billTotals({
        taxablePaise: action.taxablePaise,
        gstPercent: action.gstPercent,
        reverseCharge: action.reverseCharge,
        tdsPaise: action.tdsPaise,
      });

      const purchase: PurchaseBill = {
        id: `pb_${state.purchases.length + 1}_${now.getTime()}`,
        vendorBillNumber: action.vendorBillNumber,
        vendorId: vendor.id,
        // Snapshotted like an invoice's billTo: the bill is a document, and
        // renaming a vendor must not rewrite what was recorded.
        vendorName: vendor.name,
        billDate: action.billDate,
        description: action.description,
        taxablePaise: action.taxablePaise,
        gstPercent: action.gstPercent,
        gstPaise: totals.gstPaise,
        reverseCharge: action.reverseCharge,
        tdsSection: action.tdsSection,
        tdsPaise: action.tdsPaise,
        payablePaise: totals.payablePaise,
        status: "UNPAID",
      };

      return { ...state, purchases: [...state.purchases, purchase] };
    }

    case "MARK_PURCHASE_PAID": {
      if (!state.purchases.some((bill) => bill.id === action.billId)) return state;
      return {
        ...state,
        purchases: state.purchases.map((bill) =>
          bill.id === action.billId ? { ...bill, status: "PAID" } : bill,
        ),
      };
    }

    case "ACT_AS":
      return { ...state, actingAs: action.personId };

    case "ADD_PERSON":
      return {
        ...state,
        people: [
          ...state.people,
          { ...action.person, id: nextPersonId(state.people) },
        ],
      };

    case "UPDATE_PERSON":
      return {
        ...state,
        people: state.people.map((person) =>
          person.id === action.id ? { ...person, ...action.changes } : person,
        ),
      };

    case "SET_PERSON_ACTIVE":
      return {
        ...state,
        people: state.people.map((person) =>
          person.id === action.id
            ? { ...person, active: action.active }
            : person,
        ),
      };

    case "RESCHEDULE_JOB": {
      const jobs = state.board.jobs.map((job) =>
        job.id === action.jobId ? { ...job, slot: action.slot } : job,
      );
      return { ...state, board: { ...state.board, jobs } };
    }

    case "MARK_PAYABLE_PAID": {
      // Paid bills leave the list entirely. A "paid" row that stays put keeps
      // its 37(2)(g) countdown on screen, and a countdown against a settled bill
      // is a warning about nothing.
      const payables = state.money.payables.filter(
        (bill) => bill.id !== action.billId,
      );
      return { ...state, money: { ...state.money, payables } };
    }

    case "ASSIGN_JOB": {
      // Nothing to assign is not a change. Returning a fresh object anyway made
      // the audit trail record an assignment that never happened, and re-rendered
      // every subscriber for nothing.
      if (!state.board.jobs.some((job) => job.id === action.jobId)) return state;

      let wasUnassigned = false;
      const jobs = state.board.jobs.map((job): JobRow => {
        if (job.id !== action.jobId) return job;
        wasUnassigned = job.technician === null;
        return {
          ...job,
          technician: { id: action.technicianId, name: action.technicianName },
          status: job.status === "CREATED" ? "ASSIGNED" : job.status,
        };
      });
      return {
        ...state,
        board: {
          ...state.board,
          jobs,
          counters: {
            ...state.board.counters,
            // The counter and the rows must never disagree — that is why this
            // is derived from what actually changed, not decremented blindly.
            unassigned: Math.max(
              0,
              state.board.counters.unassigned - (wasUnassigned ? 1 : 0),
            ),
          },
        },
      };
    }

    case "CREATE_INVOICE_FROM_CONTRACT": {
      const contract = state.contracts.find(
        (candidate) => candidate.id === action.contractId,
      );
      if (!contract) return state;

      // Refuse a duplicate rather than letting the same period be billed
      // twice: two invoices for one month is a GST correction, not a typo.
      const already = state.invoices.some(
        (invoice) =>
          invoice.contractId === contract.id &&
          invoice.contractPoint === action.pointNumber,
      );
      if (already) return state;

      const seq = state.seq.invoice + 1;
      const lines: InvoiceLine[] = [
        {
          description: `${contract.reference} — ${BILLING_LABEL[contract.billing]}`,
          // SAC 9987: maintenance, repair and installation services.
          code: "9987",
          kind: "service",
          qty: 1,
          ratePaise: action.amountPaise,
          ratePercent: 18,
        },
      ];

      const branch = SEED_TENANT.branches[0];
      const billTo = billingIdentityFor(
        state.customers,
        contract.customer,
        contract.site,
      );
      /*
        FR-802, finally derived from the site rather than the branch.

        Both invoice paths used `derivePlaceOfSupply(branch, branch)` because no
        record carried a site state — which quietly charged CGST+SGST on every
        interstate supply. With the register writable and the site captured, the
        real state is available; falling back to the branch's own only when the
        customer is not on file, where the screen already refuses to send.
      */
      const derivation = derivePlaceOfSupply(
        billTo?.siteStateCode ?? branch.stateCode,
        branch.stateCode,
      );
      const totals = computeTotals(lines, derivation.head);
      const issued = issue(state.series, branch, "invoice", now);

      const invoice: Invoice = {
        id: `inv_${seq}`,
        number: issued.number,
        jobId: null,
        jobNumber: null,
        contractId: contract.id,
        contractPoint: action.pointNumber,
        customer: contract.customer,
        billTo,
        dateWord: dateWord(now),
        head: derivation.head,
        explanation: derivation.explanation,
        lines,
        taxablePaise: totals.taxablePaise,
        totalTaxPaise: totals.totalTaxPaise,
        roundOffPaise: totals.roundOffPaise,
        grandTotalPaise: totals.grandTotalPaise,
        status: "DRAFT",
      };

      return {
        ...state,
        invoices: [...state.invoices, invoice],
        series: issued.next,
        seq: { ...state.seq, invoice: seq },
      };
    }

    case "RECORD_ADVANCE": {
      const seq = state.seq.advance + 1;
      const issued = issue(
        state.series,
        SEED_TENANT.branches[0],
        "receipt_voucher",
        now,
      );
      const advance: Advance = {
        id: `adv_${seq}`,
        voucherNumber: issued.number,
        contractId: action.contractId,
        customer: action.customer,
        // ISO, not `dateWord` — this field is sorted on, and "5 Aug" sorts
        // alphabetically rather than chronologically.
        receivedOn: `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`,
        receiptPaise: action.receiptPaise,
        // 18% is the maintenance/repair rate this firm actually charges; the
        // advance follows the service it is against, not a separate choice.
        ratePercent: 18,
        head: action.head,
        status: "OPEN",
        adjustedByInvoice: null,
      };
      return {
        ...state,
        advances: [advance, ...state.advances],
        series: issued.next,
        seq: { ...state.seq, advance: seq },
      };
    }

    case "ADJUST_ADVANCE": {
      return {
        ...state,
        advances: adjustAdvance(
          state.advances,
          action.voucherNumber,
          action.invoiceNumber,
        ),
      };
    }

    case "CREATE_ADHOC_INVOICE": {
      if (action.lines.length === 0) return state;

      const seq = state.seq.invoice + 1;
      const branch = SEED_TENANT.branches[0];
      const billTo = billingIdentityFor(state.customers, action.customer);
      const derivation = derivePlaceOfSupply(
        billTo?.siteStateCode ?? branch.stateCode,
        branch.stateCode,
      );
      const totals = computeTotals(action.lines, derivation.head);
      const issued = issue(state.series, branch, "invoice", now);

      const invoice: Invoice = {
        id: `inv_${seq}`,
        number: issued.number,
        jobId: null,
        jobNumber: null,
        contractId: null,
        contractPoint: null,
        customer: action.customer,
        billTo,
        dateWord: dateWord(now),
        head: derivation.head,
        explanation: derivation.explanation,
        lines: action.lines,
        taxablePaise: totals.taxablePaise,
        totalTaxPaise: totals.totalTaxPaise,
        roundOffPaise: totals.roundOffPaise,
        grandTotalPaise: totals.grandTotalPaise,
        status: "DRAFT",
      };

      return {
        ...state,
        invoices: [...state.invoices, invoice],
        series: issued.next,
        seq: { ...state.seq, invoice: seq },
      };
    }

    case "CREATE_INVOICE_FROM_JOB": {
      const job = state.board.jobs.find((candidate) => candidate.id === action.jobId);
      if (!job) return state;

      const seq = state.seq.invoice + 1;
      const lines: InvoiceLine[] = [
        {
          description: `${job.serviceType} — ${job.jobNumber}`,
          // SAC 9987: maintenance, repair and installation services.
          code: "9987",
          kind: "service",
          qty: 1,
          ratePaise: job.valuePaise ?? 4_500_00,
          ratePercent: 18,
        },
      ];

      const branch = SEED_TENANT.branches[0];
      const billTo = billingIdentityFor(state.customers, job.customer, job.locality);
      // Place of supply from the site's own state (FR-802) — the branch's is
      // used only when the customer is not on the register, and the invoice
      // screen refuses to send in that case rather than pretending.
      const derivation = derivePlaceOfSupply(
        billTo?.siteStateCode ?? branch.stateCode,
        branch.stateCode,
      );
      const totals = computeTotals(lines, derivation.head);
      const issued = issue(state.series, branch, "invoice", now);

      const invoice: Invoice = {
        id: `inv_${seq}`,
        number: issued.number,
        jobId: job.id,
        jobNumber: job.jobNumber,
        contractId: null,
        contractPoint: null,
        customer: job.customer,
        billTo,
        dateWord: dateWord(now),
        head: derivation.head,
        explanation: derivation.explanation,
        lines,
        taxablePaise: totals.taxablePaise,
        totalTaxPaise: totals.totalTaxPaise,
        roundOffPaise: totals.roundOffPaise,
        grandTotalPaise: totals.grandTotalPaise,
        status: "DRAFT",
      };

      return {
        ...state,
        /*
          Appended, like the contract path. The two disagreed — one prepended,
          one appended — while `invoices[0]` was read as "the newest". So after
          raising a contract invoice the review screen showed the oldest one,
          with the previous document's tax derivation on it. A register is
          chronological; the newest is at the end, and callers say so.
        */
        invoices: [...state.invoices, invoice],
        board: {
          ...state.board,
          jobs: state.board.jobs.map((candidate) =>
            candidate.id === job.id
              ? { ...candidate, valuePaise: totals.grandTotalPaise }
              : candidate,
          ),
        },
        series: issued.next,
        seq: { ...state.seq, invoice: seq },
      };
    }
  }
}

/** Total of an invoice, as branded paise. */
export function invoiceTotal(invoice: Invoice): Paise {
  return asPaise(invoice.grandTotalPaise);
}

/* ----------------------------------------------------------------- store */

let state: StoreState = seedState();
let status: HydrationStatus = { kind: "hydrating" };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydration: Promise<void> | null = null;
let hydrated = false;
/**
 * Actions dispatched *before* the vault finished opening.
 *
 * They are applied optimistically so the UI responds immediately, and replayed
 * on top of the decrypted state once it arrives — because the optimistic apply
 * was against the seed, not against what is actually stored.
 *
 * Without this, a screen that only calls `useDispatch` (a create form does not
 * need to read the store) runs against the seed, and the *next* screen's
 * `hydrate()` silently overwrites the write that just happened. That is exactly
 * how a created work order vanished between the form and the board.
 */
const pending: Action[] = [];

function emit(): void {
  for (const listener of listeners) listener();
}

function schedulePersist(): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void (async () => {
      const sealed = await seal(state);
      if (!sealed.ok) {
        // Persistence failed. The app keeps working in memory and says so,
        // rather than pretending the write landed.
        status = { kind: "unavailable", message: unavailableMessage(sealed.error) };
        emit();
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sealed.value));
    })();
  }, PERSIST_DELAY_MS);
}

export function getState(): StoreState {
  return state;
}

export function getStatus(): HydrationStatus {
  return status;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dispatch(action: Action, now: Date = new Date()): void {
  // Optimistic: the user sees the result now. If the vault is still opening,
  // the action is replayed on top of the real state when it lands.
  if (!hydrated && action.type !== "RESET") pending.push(action);
  state = reduce(state, action, now);
  emit();
  if (action.type === "RESET") {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    // Destroy the key too: clearing localStorage alone leaves ciphertext in
    // backups that a retained key could still open.
    void destroyKey();
    status = { kind: "ready", restored: false };
    emit();
    return;
  }
  schedulePersist();
}

/**
 * Read stored state back, once, on first use.
 *
 * A version mismatch or a failed decrypt **wipes and re-seeds with a visible
 * notice** rather than attempting to migrate demo data — guessing at the shape
 * of unreadable bytes is how a product corrupts something a user cared about.
 */
export function hydrate(): Promise<void> {
  if (hydration) return hydration;

  hydration = (async () => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    const result = await open<StoreState>(raw);

    switch (result.kind) {
      case "opened":
        /*
          A blob written before a slice existed is not usable data.

          `ENVELOPE_VERSION` deliberately guards the *ciphertext format*, not
          the application schema — so adding `money` to `StoreState` produced a
          restored state with no `money` key at all, and the Money screen died
          on `expected object, received undefined`. A stored shape that predates
          a slice must be treated exactly like a stale version: wiped, reseeded,
          and said out loud.

          Checked against the seed's own keys rather than a hand-maintained
          version number, because a number is something someone has to remember
          to bump and this is something nobody can forget.
        */
        if (!hasEverySlice(result.value)) {
          window.localStorage.removeItem(STORAGE_KEY);
          status = {
            kind: "reset",
            message:
              "Saved data was written before this version's data model and has been cleared.",
          };
          break;
        }
        state = result.value;
        // Replay anything dispatched while the vault was opening. Those actions
        // were applied to the seed for an immediate UI response; this puts them
        // on top of what was actually stored.
        for (const action of pending) {
          state = reduce(state, action, new Date());
        }
        status = { kind: "ready", restored: true };
        break;
      case "absent":
        status = { kind: "ready", restored: false };
        break;
      case "stale_version":
        window.localStorage.removeItem(STORAGE_KEY);
        status = {
          kind: "reset",
          message:
            "Saved data was written by an older version of this app and has been cleared.",
        };
        break;
      case "corrupt":
        window.localStorage.removeItem(STORAGE_KEY);
        status = {
          kind: "reset",
          message: "Saved data could not be read and has been cleared.",
        };
        break;
      case "unavailable":
        status = { kind: "unavailable", message: unavailableMessage(result.error) };
        break;
    }
    hydrated = true;
    pending.length = 0;
    // Anything applied optimistically now needs writing under the real state.
    schedulePersist();
    emit();
  })();

  return hydration;
}

/** The most recent document in the register — invoices are chronological. */
export function latestInvoice(state: StoreState): Invoice | null {
  return state.invoices[state.invoices.length - 1] ?? null;
}
