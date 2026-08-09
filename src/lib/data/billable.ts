import type { Contract } from "./contracts";
import type { JobRow } from "./board";
import { billingDue, type BillingDue } from "./contracts";

/**
 * What can be billed right now — the list behind "New invoice".
 *
 * **Why a chooser and not a blank form.** In a service firm an invoice should
 * almost always originate from work that happened: a job that was completed, or
 * a point on a contract's billing schedule that has come due. An invoice typed
 * from nothing is how a register ends up reconciling with no work — and how the
 * §6.14 working paper stops agreeing with the job board.
 *
 * Ad-hoc stays available because counter sales and one-off supplies are real.
 * It is the third option rather than the default, which is the whole design
 * argument in one sentence.
 *
 * **What "unbilled" means here.** A job is billable when it has reached a state
 * where the work is done and no invoice already points at it. The second half
 * is what stops the same job being billed twice — a duplicate the customer
 * notices before the office does.
 */

/** States in which the work is finished and the money is owed. */
const BILLABLE_STATES = new Set(["WORK_DONE", "SIGNED_OFF", "COMPLETED"]);

export type BillableJob = {
  job: JobRow;
  /** Why it is on the list — shown, so the reader is not asked to trust it. */
  reason: string;
};

/** Only `jobId` is read, so only `jobId` is asked for. */
export function billableJobs(
  jobs: readonly JobRow[],
  invoices: readonly { jobId: string | null }[],
): BillableJob[] {
  const billed = new Set(
    invoices.map((invoice) => invoice.jobId).filter((id): id is string => id !== null),
  );

  return jobs
    .filter((job) => BILLABLE_STATES.has(job.status) && !billed.has(job.id))
    .map((job) => ({
      job,
      reason:
        job.status === "SIGNED_OFF"
          ? "Signed off by the customer"
          : "Work done, not yet signed",
    }));
}

/** Jobs that are finished *and* already billed — stated, never silently hidden. */
export function alreadyBilled(
  jobs: readonly JobRow[],
  invoices: readonly { jobId: string | null }[],
): number {
  const billed = new Set(
    invoices.map((invoice) => invoice.jobId).filter((id): id is string => id !== null),
  );
  return jobs.filter((job) => BILLABLE_STATES.has(job.status) && billed.has(job.id))
    .length;
}

/**
 * Contract points that have come due and have not been raised.
 *
 * Delegates to `billingDue`, which already owns the schedule arithmetic — this
 * exists so the chooser has one function to call for both halves rather than
 * assembling the second one itself.
 */
/**
 * Which contract instalments are due but unraised.
 *
 * Takes the two lists rather than the whole store, so it can be fed from the
 * register as easily as from a fixture — the screen that uses it reads both
 * from the API now, and a helper that insists on a `StoreState` is a helper
 * that keeps the store alive.
 */
export function billableContractPoints(
  contracts: readonly Contract[],
  invoices: readonly { contractId: string | null }[],
): BillingDue[] {
  const raisedByContract: Record<string, number> = {};
  for (const invoice of invoices) {
    if (invoice.contractId) {
      raisedByContract[invoice.contractId] =
        (raisedByContract[invoice.contractId] ?? 0) + 1;
    }
  }
  return billingDue(contracts, raisedByContract, new Date());
}

/** Nothing to bill is a real answer, and the screen says which kind of nothing. */
export function nothingToBillReason(
  jobsDone: number,
  billedCount: number,
): string {
  if (jobsDone === 0 && billedCount === 0) {
    return "No completed jobs and no contract instalments are due.";
  }
  if (billedCount > 0) {
    return `Every completed job is already billed — ${billedCount} of them.`;
  }
  return "Nothing is due yet.";
}

export type ContractGroup = {
  oldest: BillingDue;
  /** How many further instalments are unbilled behind the oldest. */
  backlog: number;
  totalPaise: number;
};

/**
 * One row per contract, carrying its oldest unbilled point.
 *
 * A contract ten months unbilled otherwise produces ten near-identical rows —
 * the crowding this product has been rebuilt twice to avoid. You bill the
 * oldest first regardless, so the row states that one and says how many follow.
 *
 * Lives here rather than inline on a screen because the Money panel and the
 * new-invoice chooser both need it, and two copies of a grouping rule drift.
 */
export function groupByContract(rows: readonly BillingDue[]): ContractGroup[] {
  const byContract = new Map<string, BillingDue[]>();
  for (const row of rows) {
    byContract.set(row.contract.id, [...(byContract.get(row.contract.id) ?? []), row]);
  }
  return [...byContract.values()].map((points) => ({
    oldest: points[0],
    backlog: points.length - 1,
    totalPaise: points.reduce((sum, row) => sum + row.point.amountPaise, 0),
  }));
}
