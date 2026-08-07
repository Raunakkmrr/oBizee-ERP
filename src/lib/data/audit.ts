import { z } from "zod";

/**
 * The audit trail — FR-1305.
 *
 * > *"Full audit trail on every mutation, including offline origin; immutable."*
 *
 * **Why this is a wrapper and not a line in each reducer case.** "Every
 * mutation" is the requirement, and a rule enforced case-by-case is a rule that
 * lasts until the next case is written. Deriving the entry from the action and
 * the two states means a new action is audited the day it is added, whether or
 * not its author remembered.
 *
 * **Immutable** is enforced by shape, not by discipline: entries are only ever
 * appended, nothing in the store updates or deletes one, and the summary is
 * computed at write time so a later change to the fixture text cannot rewrite
 * what the trail says happened.
 *
 * **Offline origin** is carried because the same trail will receive writes from
 * the technician's device, where an event recorded in a basement at 11:04 syncs
 * at 14:20 — and an audit trail that stamps the sync time has lost the fact it
 * existed to record. Until that app exists every entry is `web`, which is
 * honest rather than aspirational.
 */

export const ORIGINS = ["web", "offline_sync"] as const;
export type Origin = (typeof ORIGINS)[number];

export const auditEntrySchema = z.object({
  id: z.string(),
  /** ISO — sorted on, and never shown raw. */
  at: z.string(),
  /** A person, never "system": somebody is accountable for every write. */
  actor: z.string(),
  action: z.string(),
  /** One line a non-engineer can read. */
  summary: z.string(),
  origin: z.enum(ORIGINS),
  /** When it happened, if that differs from when it was recorded. */
  occurredAt: z.string().nullable(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditSchema = z.array(auditEntrySchema);

/** Actions that change nothing worth recording. */
const NOT_A_MUTATION = new Set(["ACT_AS"]);

export function isAuditable(actionType: string): boolean {
  return !NOT_A_MUTATION.has(actionType);
}

/**
 * A readable line for an action.
 *
 * Falls back to the action's own type rather than skipping the entry: an
 * unrecognised mutation still has to appear, because the gap is what an
 * auditor would ask about.
 */
export function summarise(
  action: { type: string } & Record<string, unknown>,
): string {
  switch (action.type) {
    case "CREATE_JOB":
      return `Raised a work order for ${str(action.customer)}`;
    case "ASSIGN_JOB":
      return `Assigned a job to ${str(action.technicianName)}`;
    case "RESCHEDULE_JOB":
      return `Rescheduled a job`;
    case "CREATE_CONTRACT":
      return `Created an AMC for ${str(action.customer)}`;
    case "GENERATE_CONTRACT_VISITS":
      return `Put a contract's due visits on the board`;
    case "WORK_RENEWAL_AS_LEAD":
      return `Opened a renewal as a lead`;
    case "CREATE_INVOICE_FROM_JOB":
      return `Raised an invoice from a job`;
    case "CREATE_INVOICE_FROM_CONTRACT":
      return `Raised a scheduled contract invoice`;
    case "CREATE_ADHOC_INVOICE":
      return `Raised an ad-hoc invoice for ${str(action.customer)}`;
    case "ADD_CUSTOMER":
      return `Added ${str(action.name)} to the customer register`;
    case "RECORD_ADVANCE":
      return `Recorded an advance from ${str(action.customer)} and issued a receipt voucher`;
    case "ADJUST_ADVANCE":
      return `Adjusted ${str(action.voucherNumber)} into ${str(action.invoiceNumber)}`;
    case "MARK_PAYABLE_PAID":
      return `Marked a vendor bill paid`;
    case "MOVE_LEAD_STAGE":
      return `Moved a lead to ${str(action.stage)}`;
    case "LOG_LEAD_OUTCOME":
      return `Logged a lead outcome: ${str(action.outcome)}`;
    case "ADD_PERSON":
      return `Added a person`;
    case "UPDATE_PERSON":
      return `Changed a person's record`;
    case "SET_PERSON_ACTIVE":
      return action.active ? `Reactivated a person` : `Deactivated a person`;
    case "RESET":
      return `Reset all demo data`;
    default:
      return action.type;
  }
}

function str(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value : "—";
}

/**
 * Append an entry. The only way the trail ever changes.
 *
 * Capped at 500 because this trail lives in a browser and an unbounded array
 * would eventually fail to persist — which would lose the whole trail rather
 * than its oldest end. The cap is stated here so nobody reads the screen as
 * "everything that ever happened".
 */
export const AUDIT_LIMIT = 500;

export function append(
  trail: readonly AuditEntry[],
  entry: AuditEntry,
): AuditEntry[] {
  return [entry, ...trail].slice(0, AUDIT_LIMIT);
}

/** `6 Aug, 11:04 pm` — the trail is read by people, not parsers. */
export function whenWords(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
