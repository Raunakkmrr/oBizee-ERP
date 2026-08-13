/**
 * The write seam.
 *
 * Reads had one designed in from the start — the `api:` slot on every
 * `defineQuery`. Writes never did: `dispatch()` is synchronous, returns
 * `void`, and cannot fail. That shape is only honest while the store *is* the
 * database.
 *
 * **Writes are server-first, and nothing here is optimistic.** The reason is
 * not caution, it is the numbering. `store.ts` assigns an invoice number from
 * a browser-held counter, and the database assigns one from `next_in_series()`
 * — two counters for one legally consecutive series. GST §31 requires the
 * series to run without gaps or repeats; two browsers on one tenant produce
 * both, and a gap in an invoice series is a question at assessment that
 * somebody has to answer years later.
 *
 * So the server issues the number, and the row it returns is the truth. A
 * screen that showed `SVC/26-27/0151` and then failed to persist it has told
 * the user something false about a statutory document.
 *
 * Everything here returns a `MutationResult` rather than throwing, so a call
 * site has to decide what a refusal looks like on screen. `apiFetch` already
 * maps HTTP onto the four `AppError` states the screens render.
 */
import type { AppError } from "../data/result";
import { DataSourceError } from "../data/source";
import { apiFetch } from "./client";

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

/** Runs a write and converts a refusal into a value the caller must handle. */
export async function attempt<T>(run: () => Promise<T>): Promise<MutationResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (cause) {
    if (cause instanceof DataSourceError) return { ok: false, error: cause.appError };
    return {
      ok: false,
      error: {
        kind: "server",
        message: cause instanceof Error ? cause.message : "That did not go through",
        code: "NETWORK",
      },
    };
  }
}

/*
  `apiFetch` returns `Fetched<T>` because a read carries freshness alongside
  its payload. A write has no such thing — it either happened or it did not —
  so the envelope is unwrapped here rather than pushed onto every call site.
*/
async function send<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const { raw } = await apiFetch<T>(path, { method, body: JSON.stringify(body) });
  return raw;
}

const post = <T,>(path: string, body: unknown) => send<T>(path, "POST", body);
const patch = <T,>(path: string, body: unknown) => send<T>(path, "PATCH", body);

/* ------------------------------------------------------------------ leads */

/** `source` is FR-105's closed list; free text here becomes an unanalysable funnel. */
export type LeadSource =
  | "Phone" | "WhatsApp" | "Walk-in" | "Referral"
  | "Website" | "Repeat customer" | "Field/Marketing" | "AMC renewal";

export const createLead = (body: {
  name: string;
  phone: string;
  locality?: string;
  source: LeadSource;
  quotedPaise?: number | null;
  /** FR-104: ISO datetime, and the route refuses a lead without one. */
  nextFollowUpAt: string;
  ownerUserId?: string | null;
}) => attempt(() => post<{ id: string; reference: string }>("/api/leads", body));

/**
 * FR-104 — the outcome and the next date travel together.
 *
 * The outcome is not optional at this seam even though the route accepts a
 * bare stage change: a follow-up that records no outcome is the defect this
 * layer exists downstream of.
 */
export const logLeadOutcome = (
  id: string,
  body: {
    outcome: string;
    note?: string;
    stage?: string;
    nextFollowUpAt?: string | null;
  },
) => attempt(() => patch<{ id: string }>(`/api/leads/${id}`, body));

/**
 * Move a lead between stages, without claiming a conversation happened.
 *
 * Separate from `logLeadOutcome` on purpose. Dragging a card on the pipeline
 * board is a stage change and nothing else; recording an outcome for it would
 * put a call on the lead's history that nobody made, and that history is what
 * the next person to ring reads. The date the lead already had is kept — a
 * lead with no next date gets forgotten (FR-104), and a drag is not a reason
 * to lose one.
 */
export const moveLeadStage = (id: string, stage: string) =>
  attempt(() => patch<{ id: string }>(`/api/leads/${id}`, { stage }));

/**
 * FR-106 — convert, with nothing retyped.
 *
 * `to: "customer"` stops at the customer and site; `to: "job"` also raises the
 * first visit. An AMC is a second step against the returned ids rather than a
 * third option here — a contract needs coverage, billing frequency and a visit
 * schedule that a lead does not carry, and guessing them is worse than asking.
 */
export const convertLead = (
  id: string,
  body: {
    to: "job" | "customer";
    site: {
      label?: string;
      addressLine1: string;
      locality: string;
      city: string;
      stateCode: string;
      pincode: string;
      landmark?: string | null;
    };
    serviceType?: string;
  },
) =>
  attempt(() =>
    post<{
      customer: { id: string; name: string };
      site: { id: string };
      job: { id: string; jobNumber: string } | null;
    }>(`/api/leads/${id}/convert`, body),
  );

/* -------------------------------------------------------------- customers */

export const createCustomer = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string }>("/api/customers", body));

/* ------------------------------------------------------------------- jobs */

export const createJob = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string; jobNumber: string }>("/api/jobs", body));

/** FR-205 — one primary, and any number of helpers at half weight. */
export const assignJob = (
  id: string,
  body: { primaryTechnicianId: string | null; helperIds?: string[] },
) => attempt(() => post<{ id: string }>(`/api/jobs/${id}/assign`, body));

/**
 * A window, or an exact time.
 *
 * The day runs in three windows and most visits sit in one. An exact time is
 * the one a customer was actually promised, and the board sorts it among the
 * windows by its own hour — so `11:30` is as valid as `9-1`.
 */
export type Slot = "9-1" | "1-5" | "5-8" | `${number}:${number}`;

export const rescheduleJob = (
  id: string,
  // The reason is required by the route: a moved visit with no reason is a
  // customer who was told something nobody recorded.
  body: { scheduledDate: string; slot?: Slot; reason: string },
) => attempt(() => post<{ id: string }>(`/api/jobs/${id}/reschedule`, body));

/**
 * FR-303 — a field transition, replay-safe.
 *
 * `clientUuid` is what makes an offline queue safe to drain twice: the route
 * checks it *before* the transition table, so replaying "reached site" on a
 * job already on site is accepted rather than refused into a retry loop.
 */
export const transitionJob = (
  id: string,
  body: { to: string; clientUuid?: string; occurredAt?: string; note?: string },
) => attempt(() => post<{ id: string; status: string }>(`/api/jobs/${id}/transition`, body));

/* -------------------------------------------------------------- contracts */

export const createContract = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string; reference: string }>("/api/contracts", body));

/**
 * Rename the firm.
 *
 * The name prints on every invoice raised afterwards, so this is a supplier
 * change rather than a preference — which is why the API records both sides of
 * it in the trail, and why the GSTIN is not editable alongside it.
 */
export const renameFirm = (body: { legalName?: string; businessName?: string }) =>
  attempt(() =>
    patch<{ legalName: string; businessName: string }>("/api/settings/profile", body),
  );

/** FR-502 — idempotent by visit key, so running it twice cannot double a year. */
export const generateVisits = (id: string) =>
  attempt(() => post<{ created: number; skipped: number }>(
    `/api/contracts/${id}/generate-visits`,
    {},
  ));

/**
 * FR-507 — work an expiring AMC as a renewal lead.
 *
 * Idempotent in the register: asking twice returns the lead that already
 * exists with `alreadyWorking: true`, because two renewal leads for one
 * contract is two people ringing the same customer on the same day.
 */
export const workRenewalAsLead = (contractId: string) =>
  attempt(() => post<{ id: string; reference: string; alreadyWorking: boolean }>(
    `/api/contracts/${contractId}/renewal-lead`,
    {},
  ));

/* --------------------------------------------------------------- invoices */

/**
 * The number comes back from here. It is never chosen on this side.
 *
 * @see the file header — two counters for one statutory series is the whole
 * reason writes are server-first.
 */
export const createInvoice = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string; number: string }>("/api/invoices", body));

/**
 * FR-806 — issue a draft.
 *
 * Until this existed an invoice raised through the product stayed a draft for
 * ever: absent from receivables, absent from GSTR-1, never billed to anybody.
 */
export const issueInvoice = (id: string) =>
  attempt(() => post<{ id: string; number: string; status: string }>(
    `/api/invoices/${id}/issue`,
    {},
  ));

/**
 * Cancel an invoice, or discard a draft.
 *
 * The number is kept on a cancelled invoice. Reusing it would put two
 * documents in the series under one identity, which is the single thing a
 * consecutive series exists to prevent. A draft never had one to spend, so it
 * is simply discarded.
 */
export const cancelInvoice = (id: string, reason: string) =>
  attempt(() => post<{ id: string; number?: string; discarded?: boolean }>(
    `/api/invoices/${id}/cancel`,
    { reason },
  ));

/* --------------------------------------------------------------- payments */

export const recordPayment = (body: {
  invoiceId: string;
  amountPaise: number;
  receivedOn: string;
  method: "UPI" | "BANK_TRANSFER" | "CHEQUE" | "CASH";
  reference?: string | null;
}) => attempt(() => post<{ id: string }>("/api/payments", body));

/**
 * §31(3)(d) — a receipt voucher, and tax falls due on receipt.
 *
 * `ratePercent` is on the advance itself because the rate at the time money
 * was taken is the rate that applies, even if the slab moves before the work.
 */
export const recordAdvance = (body: {
  customerId: string;
  contractId?: string | null;
  receiptPaise: number;
  ratePercent: 0 | 5 | 18 | 40;
  receivedOn: string;
}) => attempt(() => post<{ id: string; number?: string }>("/api/advances", body));

/**
 * Close an advance into the invoice it was taken for.
 *
 * By id, not by voucher and invoice *number*. Numbers are what people read;
 * matching on them here would make a renumbering — or a second branch's
 * identical-looking series — settle the wrong voucher against the wrong bill,
 * and the route refuses anything already adjusted rather than double-counting
 * the credit.
 */
export const adjustAdvance = (id: string, invoiceId: string) =>
  attempt(() => post<{ id: string; voucherNumber: string }>(
    `/api/advances/${id}/adjust`,
    { invoiceId },
  ));

/** FR-904 — what was said, and any date that was promised. */
export const logCollectionContact = (
  invoiceId: string,
  body: { note: string; promisedFor?: string | null },
) => attempt(() => post<{ id: string }>(`/api/money/collections/${invoiceId}/contact`, body));

/* ------------------------------------------------------------------ team */

/**
 * Who works here — owner only.
 *
 * A password never travels through here. An office user sets their own via
 * the reset flow, so the person who knows it is the person who chose it.
 */
export type PersonInput = {
  name: string;
  role: string;
  /**
   * Chosen by the owner, replaced by the holder at first sign-in.
   *
   * Only meaningful with an email; field staff sign in with a one-time code.
   * Omitted on an edit — changing somebody else's password is not an edit, and
   * there is no route for it.
   */
  initialPassword?: string;
  level?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[];
  localities?: string[];
};

export const addPerson = (body: PersonInput) =>
  attempt(() => post<{ id: string; name: string; role: string }>("/api/people", body));

export const updatePerson = (id: string, body: Partial<PersonInput>) =>
  attempt(() => patch<{ id: string; name: string; role: string }>(`/api/people/${id}`, body));

/**
 * Turn access on or off — never a delete.
 *
 * Its own call because it is a different act from an edit: one corrects a
 * record, the other decides whether somebody can open the product tomorrow.
 * The register refuses the two that lock a firm out — deactivating yourself,
 * and removing the last active owner.
 */
export const setPersonActive = (id: string, active: boolean) =>
  attempt(() => post<{ id: string; active: boolean }>(`/api/people/${id}/active`, { active }));

/* ---------------------------------------------------------------- vendors */

export const createVendor = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string }>("/api/vendors", body));

export const recordPurchaseBill = (body: Record<string, unknown>) =>
  attempt(() => post<{ id: string }>("/api/vendors/bills", body));

/**
 * Settle a purchase bill — the §43B(h) clock stops on `paidOn`.
 *
 * The date is a parameter and not the server's clock: a bill paid on the 14th
 * and recorded on the 16th was paid on the 14th, and against a 15-day MSMED
 * limit those two days decide whether the deduction survives.
 */
export const payPurchaseBill = (
  id: string,
  body: { paidOn: string; reference?: string },
) => attempt(() => post<{ id: string; status: string }>(`/api/vendors/bills/${id}/pay`, body));

/** Advisory only — reverse charge and TDS explained before the bill is saved. */
export const advisePurchase = (body: Record<string, unknown>) =>
  attempt(() => post<Record<string, unknown>>("/api/vendors/advise", body));
