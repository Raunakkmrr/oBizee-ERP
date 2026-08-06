/**
 * Roles and permissions — FR-1301, FR-1302, PRD §3, §9.4.
 *
 * ⚠️ **This module gates the UI only, and the UI is not the control.**
 *
 * §9.4 is explicit: "Authorisation is enforced server-side on every request. The
 * UI hiding a control is a courtesy; the API refusing it is the control." Under
 * the DR-9 suspension there is no server yet, so nothing here is enforced —
 * every permission check in this file is currently a courtesy with nothing
 * behind it. That is a recorded gap, not a shipped feature, and it is the single
 * most important thing to close when the backend phase opens.
 *
 * The same applies with extra force to price visibility (FR-1302): when the
 * technician toggle is off, prices must be stripped **server-side** from every
 * payload his device can request, including the job-sheet PDF rendered on it.
 * Hiding them in the client only is a defect, because the payload is readable.
 */

/** The eight built-in roles (FR-1301). Per-tenant overrides come later. */
export const ROLES = [
  "owner",
  "coordinator",
  "support",
  "telecaller",
  "sales",
  "technician",
  "accountant",
  "readonly_ca",
] as const;

export type Role = (typeof ROLES)[number];

/** Human labels, for the People screen and for permission-error messages. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  coordinator: "Coordinator",
  support: "Support desk",
  telecaller: "Telecaller",
  sales: "Sales & estimates",
  technician: "Technician",
  accountant: "Accountant",
  readonly_ca: "Read-only CA",
};

/**
 * Permissions are `resource:action`. Kept deliberately coarse — one per real
 * decision a screen makes — because a matrix with sixty near-identical entries
 * gets copied wrongly, and §6.3's permission-error state has to name a role a
 * human can go and ask ("Only the Accountant or Owner can finalise an invoice.
 * Ask Suresh to approve."), which needs coarse, meaningful units.
 */
export const PERMISSIONS = [
  // Leads and jobs
  "lead:read",
  "lead:write",
  /**
   * Preparing a priced quote. The dividing line between the three
   * customer-facing desks a service firm actually runs: a support desk logs
   * and reports, a telecaller qualifies and books, and only an estimator puts
   * a number in front of a customer.
   */
  "quote:write",
  "job:read",
  "job:read_own", // technician: only his own, ±3/+14 days (FR-306)
  "job:write",
  "job:dispatch", // assign, reschedule, force-close
  "job:transition_field", // EN_ROUTE / ON_SITE / WORK_DONE — technician only (§4.2 rule 1)

  // Customers, sites, contracts
  "customer:read",
  "customer:write",
  "contract:read",
  "contract:write",

  // Money
  "invoice:read",
  "invoice:write",
  "invoice:finalise",
  "payment:read",
  "payment:write",
  "gst:read",
  "gst:write",
  "export:generate",

  // Parts
  "part:read",
  "part:issue_to_van",
  "part:consume",
  "part:purchase",

  // Visibility of commercially sensitive figures
  "price:view_selling", // job value, invoice value, contract value
  "price:view_cost", // cost price and margin — owner only (§3.1)

  // Reports and administration
  "report:read",
  "report:technician_performance",
  "settings:read",
  "settings:write",
  "people:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The matrix, derived directly from the "Access" line of each persona in §3 and
 * from §5.13. Each role's comment quotes the constraint it implements, so a
 * future change has to argue with the PRD rather than with a preference.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  /** §3.1: "everything, including cost prices, technician performance, and margins." */
  owner: [...PERMISSIONS],

  /**
   * §3.2: "leads, jobs, dispatch, customers, sites, contracts. Invoices
   * read-only. No cost prices."
   * Parts is "view + issue to van" per §6.2's role table.
   */
  coordinator: [
    "lead:read",
    "lead:write",
    "job:read",
    "job:write",
    "job:dispatch",
    "customer:read",
    "customer:write",
    "contract:read",
    "contract:write",
    "invoice:read",
    "payment:read",
    "part:read",
    "part:issue_to_van",
    "price:view_selling",
    "report:read",
    "export:generate",
    "settings:read",
  ],

  /**
   * §3.3: "only his own assigned jobs, ±3 days. Sees customer contact and site.
   * Does not see invoice value or part cost price by default."
   *
   * Note what is absent and why: no `customer:read` (there is no customer
   * directory in the technician app at all — §6.2 gives him three tabs and
   * "no global search, no customer directory, no reports"), no `job:read`
   * (only `job:read_own`), and no price permission of any kind. `price:view_selling`
   * is granted at runtime only when the tenant's FR-1302 toggle is on.
   */
  /**
   * The desk that answers the phone.
   *
   * Intake and status, nothing else. A support desk that can see selling
   * prices ends up quoting on the phone, which is exactly the leak the
   * estimator role exists to prevent — so `price:view_selling` is withheld
   * even though it makes some screens read as blanks for them.
   */
  support: [
    "lead:read",
    "lead:write", // logging a complaint creates the lead
    "job:read",
    "customer:read",
    "contract:read",
    "part:read",
  ],

  /**
   * The first call on a new enquiry.
   *
   * Qualifies, logs the outcome, books a survey — the §6.6 follow-up queue is
   * this person's whole screen. Deliberately **cannot quote**: a number given
   * before anyone has seen the site is the most expensive habit a service firm
   * can form, and FR-102's duplicate check exists because this desk is where
   * duplicates are created.
   */
  telecaller: [
    "lead:read",
    "lead:write",
    "customer:read",
    "customer:write",
    "job:read",
    "contract:read",
    "price:view_selling", // to repeat a quote already made, never to make one
  ],

  /**
   * Quotes and site visits — the estimator.
   *
   * The only customer-facing desk holding `quote:write`, and the one that
   * converts a lead into a contract. Cost prices stay owner-only (§3.1): an
   * estimator who can see margin will discount to it.
   */
  sales: [
    "lead:read",
    "lead:write",
    "quote:write",
    "customer:read",
    "customer:write",
    "contract:read",
    "contract:write",
    "job:read",
    "invoice:read",
    "price:view_selling",
    "report:read",
  ],

  technician: [
    "job:read_own",
    "job:transition_field",
    "part:read",
    "part:consume",
  ],

  /**
   * §3.4: "invoices, credit notes, payments, receivables/payables, GST
   * workspace, exports, customers. Read-only on jobs (he must be able to see
   * the evidence behind a line). No dispatch."
   */
  accountant: [
    "job:read",
    "customer:read",
    "customer:write",
    "contract:read",
    "invoice:read",
    "invoice:write",
    "invoice:finalise",
    "payment:read",
    "payment:write",
    "gst:read",
    "gst:write",
    "export:generate",
    "part:read",
    "part:purchase",
    "price:view_selling",
    "price:view_cost",
    "report:read",
    "settings:read",
    "audit:read",
  ],

  /**
   * FR-1003 / §3.4: scoped to invoices, payments, the GST workspace and
   * exports, "with no ability to alter operational data".
   */
  readonly_ca: [
    "invoice:read",
    "payment:read",
    "gst:read",
    "export:generate",
    "customer:read",
    "report:read",
  ],
};

/** Tenant-level toggles that modify a role's baseline permissions. */
export type TenantToggles = {
  /** FR-1302. Default OFF — a stated anti-freelancing control, not paranoia. */
  technicianSeesPrices: boolean;
  /** FR-1301 / §4.2: lets a coordinator raise invoices. Off by default. */
  coordinatorCanBill: boolean;
};

export const DEFAULT_TENANT_TOGGLES: TenantToggles = {
  technicianSeesPrices: false,
  coordinatorCanBill: false,
};

/**
 * Whether a role may do something, with the tenant's toggles applied.
 *
 * Toggles are resolved here rather than baked into the matrix so that the
 * matrix stays a readable statement of §3, and the deviations stay visible as
 * deviations.
 */
export function can(
  role: Role,
  permission: Permission,
  toggles: TenantToggles = DEFAULT_TENANT_TOGGLES,
): boolean {
  if (
    role === "technician" &&
    permission === "price:view_selling" &&
    toggles.technicianSeesPrices
  ) {
    return true;
  }

  if (
    role === "coordinator" &&
    toggles.coordinatorCanBill &&
    (permission === "invoice:write" || permission === "invoice:finalise")
  ) {
    return true;
  }

  // A linear scan over ~30 entries, called per rendered control. Deliberately
  // not a pre-built Set keyed by role: that needed an `Object.fromEntries` cast
  // that TypeScript rejects as unsound, and buying microseconds with a cast on
  // the authorisation path is the wrong trade.
  return MATRIX[role].includes(permission);
}

/**
 * Which roles hold a permission — used to build §6.3's permission-error state,
 * which must name who *can* act rather than just refusing. "Naming the person
 * who can act is the difference between a dead end and a next step."
 */
export function rolesWith(
  permission: Permission,
  toggles: TenantToggles = DEFAULT_TENANT_TOGGLES,
): Role[] {
  return ROLES.filter((role) => can(role, permission, toggles));
}
