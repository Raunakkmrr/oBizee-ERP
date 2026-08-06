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
import { SEED_LEADS, type Lead, type LeadsData } from "./leads";
import { SEED_BOARD, type Board, type JobRow } from "./board";
import {
  SEED_CONTRACTS,
  type BillingFrequency,
  type Contract,
  type Coverage,
  type Recurrence,
  VISITS_PER_YEAR,
} from "./contracts";
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
  customer: string;
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
  /** FR-811: numbering is per branch, doc type and financial year. */
  seq: { job: number; contract: number; invoice: number };
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
    invoices: [],
    seq: { job: 440, contract: 32, invoice: 149 },
  };
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
  | { type: "RESET" };

/* --------------------------------------------------------------- helpers */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** `J-2608-0441` — the series prefix belongs to the branch (FR-811). */
function jobNumber(seq: number, now: Date): string {
  const branch = SEED_TENANT.branches[0];
  const yy = String(now.getFullYear()).slice(2);
  return `${branch.jobSeriesPrefix}-${yy}${pad(now.getMonth() + 1, 2)}-${pad(seq, 4)}`;
}

function invoiceNumber(seq: number, now: Date): string {
  const branch = SEED_TENANT.branches[0];
  const year = now.getFullYear();
  // Financial year label, 1 April boundary — `26-27`.
  const fyStart = now.getMonth() >= 3 ? year : year - 1;
  return `${branch.invoiceSeriesPrefix}/${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}/${pad(seq, 4)}`;
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
export function reduce(state: StoreState, action: Action, now: Date): StoreState {
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
      return {
        ...state,
        contracts: [contract, ...state.contracts],
        seq: { ...state.seq, contract: seq },
      };
    }

    case "CREATE_JOB": {
      const seq = state.seq.job + 1;
      const job: JobRow = {
        id: `job_${seq}`,
        jobNumber: jobNumber(seq, now),
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

    case "ASSIGN_JOB": {
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
      // Place of supply from the site's state, derived and explained (FR-802).
      // The seed board carries no site state code, so this uses the branch's own
      // until sites are wired through — which keeps the derivation honest rather
      // than inventing an interstate supply.
      const derivation = derivePlaceOfSupply(branch.stateCode, branch.stateCode);
      const totals = computeTotals(lines, derivation.head);

      const invoice: Invoice = {
        id: `inv_${seq}`,
        number: invoiceNumber(seq, now),
        jobId: job.id,
        jobNumber: job.jobNumber,
        contractId: null,
        customer: job.customer,
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
        invoices: [invoice, ...state.invoices],
        board: {
          ...state.board,
          jobs: state.board.jobs.map((candidate) =>
            candidate.id === job.id
              ? { ...candidate, valuePaise: totals.grandTotalPaise }
              : candidate,
          ),
        },
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
