/**
 * Navigation information architecture — PRD §6.2.
 *
 * §6.2 opens by saying the quiet part out loud: "Navigation order is a product
 * claim about what the business is. A service firm's owner opening a product
 * whose second item is 'Inventory' concludes, correctly, that the product was
 * built for a trading business and adapted. **This ordering is therefore a
 * requirement, not a layout preference.**"
 *
 * So the rationale lives here beside the data. Two positions in particular are
 * load-bearing and must not drift:
 *
 * - **Jobs at 2.** The job is the object the business produces. Everything else
 *   is upstream of it, downstream of it, or consumed by it.
 * - **Parts at 7.** Parts exist because a technician fits one. This is the
 *   single position that most distinguishes this product from a generic ERP,
 *   where inventory is item two. §6.2 states it plainly: "if this ever creeps
 *   upward, the product has drifted off its thesis."
 */
import type { Role } from "./roles";
import type { Permission } from "./roles";

/** The nine primary destinations, plus the technician's three. */
export type NavKey =
  | "today"
  | "jobs"
  | "leads"
  | "contracts"
  | "customers"
  | "money"
  | "parts"
  | "reports"
  | "team"
  | "settings"
  // Technician-only. §6.2: "not a reduced version of the coordinator's
  // navigation" — he has exactly three questions, and a fourth item would only
  // give him something to get lost in.
  | "my_day"
  | "upcoming"
  | "sync";

/**
 * Icon names, narrowed to the set actually used so the shell's icon map is
 * exhaustively type-checked. Every name is verified to exist in the installed
 * lucide-react (v1 renamed a lot of icons, so this was checked, not assumed).
 */
export type NavIcon =
  | "CalendarClock"
  | "Wrench"
  | "PhoneCall"
  | "FileClock"
  | "Building2"
  | "ReceiptIndianRupee"
  | "Package"
  | "ChartColumn"
  | "Settings"
  | "Users"
  | "ClipboardList"
  | "CalendarSync"
  | "RefreshCw";

/**
 * The kinds of badge a nav item may carry.
 *
 * §6.2: "Every item shows a numeric badge only when the number demands action —
 * Today shows unassigned count, Leads shows overdue-follow-up count, Invoices
 * shows overdue count. **A badge that shows a total (e.g. '1,482 customers') is
 * decoration and is forbidden.**"
 *
 * Modelling the allowed badges as a closed union is how that prohibition is
 * enforced structurally rather than by review: there is no way to express
 * "badge showing a total", because no such variant exists.
 */
export type NavBadge = "unassigned_today" | "leads_overdue" | "invoices_overdue";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  icon: NavIcon;
  /** Null means this item never carries a badge. Most don't. */
  badge: NavBadge | null;
  /** The permission that makes this destination reachable at all. */
  requires: Permission;
  /** Why it sits where it sits (§6.2). Kept so the ordering can be defended. */
  rationale: string;
};

/**
 * Canonical order. Roles subset and reorder this, but no role invents an item
 * and no role reorders arbitrarily — see NAV_BY_ROLE.
 */
export const NAV_ITEMS: Record<NavKey, NavItem> = {
  today: {
    key: "today",
    label: "Today",
    href: "/today",
    icon: "CalendarClock",
    badge: "unassigned_today",
    requires: "job:read",
    rationale:
      "The first question every morning, by every role, is who is going where today and what is stuck. The only screen that answers a question about now, and the only screen most users need before 10am.",
  },
  jobs: {
    key: "jobs",
    label: "Jobs",
    href: "/jobs",
    icon: "Wrench",
    badge: null,
    requires: "job:read",
    rationale:
      "The spine — the object the business produces. If a service owner has to scroll or open a menu to reach Jobs, the hierarchy is lying about what the product is for.",
  },
  leads: {
    key: "leads",
    label: "Leads",
    href: "/leads",
    icon: "PhoneCall",
    badge: "leads_overdue",
    requires: "lead:read",
    rationale:
      "Directly adjacent to Jobs because the same person does both. The coordinator converts a lead into a job twenty times a day; separating these by four menu items taxes the highest-frequency workflow in the product.",
  },
  contracts: {
    key: "contracts",
    label: "Contracts",
    href: "/contracts",
    icon: "FileClock",
    badge: null,
    requires: "contract:read",
    rationale:
      "Recurring revenue and the engine that generates future jobs. Fourth because it is a weekly object, not an hourly one — but above Customers because a contract is a commercial commitment with money and an SLA attached, and it decays if unattended.",
  },
  customers: {
    key: "customers",
    label: "Customers & Sites",
    href: "/customers",
    icon: "Building2",
    badge: null,
    requires: "customer:read",
    rationale:
      "The directory. Almost always reached through a job or a lead rather than browsed, but it must still be first-level because 'find me everything about Shakti Industries' is a real question an owner asks mid-phone-call.",
  },
  money: {
    key: "money",
    label: "Invoices & Payments",
    href: "/money",
    icon: "ReceiptIndianRupee",
    badge: "invoices_overdue",
    requires: "invoice:read",
    rationale:
      "Downstream of the job. Sixth for the coordinator and technician; position 1 for the Accountant, because for that persona it is the spine.",
  },
  parts: {
    key: "parts",
    label: "Parts & Stock",
    href: "/parts",
    icon: "Package",
    badge: null,
    requires: "part:read",
    rationale:
      "Deliberately seventh. Parts exist because a technician fits one. This is the position that most distinguishes this product from a generic ERP, where inventory is item two. If it ever creeps upward, the product has drifted off its thesis.",
  },
  reports: {
    key: "reports",
    label: "Reports & GST",
    href: "/reports",
    icon: "ChartColumn",
    badge: null,
    requires: "report:read",
    rationale:
      "Periodic, not daily. Monthly for the accountant, weekly for the owner.",
  },
  /**
   * The people who work here.
   *
   * Its own destination rather than a Settings tab, because a growing firm
   * hires far more often than it changes its GST scheme — burying the thing
   * done weekly under the thing done twice a year is backwards. Settings keeps
   * the configuration; this keeps the humans.
   */
  team: {
    key: "team",
    label: "Team",
    href: "/team",
    icon: "Users",
    badge: null,
    requires: "people:manage",
    rationale:
      "Technicians, desks and their skills. Hiring is a weekly act in a growing service firm; tax configuration is not.",
  },

  settings: {
    key: "settings",
    label: "Settings & People",
    href: "/settings",
    icon: "Settings",
    badge: null,
    requires: "settings:read",
    rationale:
      "Configuration, roles, templates, rate cards, branches, tax setup. Last, and never a place a daily task lives.",
  },

  // --- Technician app (mobile only, three tabs, nothing else) -------------
  my_day: {
    key: "my_day",
    label: "My Day",
    href: "/my-day",
    icon: "ClipboardList",
    badge: null,
    requires: "job:read_own",
    rationale: "What am I doing now.",
  },
  upcoming: {
    key: "upcoming",
    label: "Upcoming",
    href: "/upcoming",
    icon: "CalendarSync",
    badge: null,
    requires: "job:read_own",
    rationale: "What is coming.",
  },
  sync: {
    key: "sync",
    label: "Sync",
    href: "/sync",
    icon: "RefreshCw",
    badge: null,
    requires: "job:read_own",
    rationale:
      "Has my work been saved. §9.2 calls this screen a non-functional requirement expressed as a screen — sync must be verifiable by the user.",
  },
};

/**
 * What each role sees, in order (§6.2's role table).
 *
 * The Accountant's order puts Invoices & Payments **first**, per defect D10:
 * §6.2's prose said "promoted to position 2" while its own role table and
 * landing-screen column both said position 1. The table and §3.4 agree with each
 * other, so the prose was the stale statement.
 */
export const NAV_BY_ROLE: Record<Role, readonly NavKey[]> = {
  owner: [
    "today",
    "jobs",
    "leads",
    "contracts",
    "customers",
    "money",
    "parts",
    "reports",
    "team",
    "settings",
  ],
  coordinator: [
    "today",
    "jobs",
    "leads",
    "contracts",
    "customers",
    "money", // read-only for this role
    "parts", // view + issue to van
  ],
  /**
   * §6.2's rule that a role's navigation is not a reduced copy of another's.
   * The support desk answers "where is my technician" all day, so Today leads;
   * it has no money and no pipeline.
   */
  support: ["today", "jobs", "leads", "customers"],

  /** The follow-up queue is this desk's entire day, so Leads leads. */
  telecaller: ["leads", "customers", "jobs", "today"],

  /** Quotes and conversions — the pipeline, then what it turned into. */
  sales: ["leads", "contracts", "customers", "jobs", "reports"],

  accountant: [
    "money", // position 1 — for this persona it IS the spine (§3.4, defect D10)
    "reports", // carries the GST workspace
    "customers",
    "jobs", // read-only, for the evidence behind a line
    "parts", // purchases
  ],
  readonly_ca: ["reports", "money", "customers"],
  technician: ["my_day", "upcoming", "sync"],
};

/**
 * Landing screen per role. The Owner differs by device: §6.2 gives him Owner
 * Home on mobile and Today on web, because a phone in a car and a laptop in the
 * office are two different jobs.
 */
export const LANDING: Record<Role, { web: string; mobile: string }> = {
  owner: { web: "/today", mobile: "/home" },
  coordinator: { web: "/today", mobile: "/today" },
  // Each desk lands on the screen that *is* its job, never on a shared
  // dashboard it would have to navigate away from.
  support: { web: "/today", mobile: "/today" },
  telecaller: { web: "/leads", mobile: "/leads" },
  sales: { web: "/leads", mobile: "/leads" },
  accountant: { web: "/money", mobile: "/money" },
  readonly_ca: { web: "/reports", mobile: "/reports" },
  // Mobile only — there is no web technician surface at all (§2.2 declines a
  // desktop-only technician workflow, and §6.2 gives him three tabs).
  technician: { web: "/my-day", mobile: "/my-day" },
};

/** The ordered nav items a role actually sees. */
export function navFor(role: Role): NavItem[] {
  return NAV_BY_ROLE[role].map((key) => NAV_ITEMS[key]);
}

/**
 * Grouped sidebar IA, mirroring `obizee-dashboard/src/lib/nav.ts` — which
 * groups its destinations under labels (Overview / Sell / Operations /
 * Procurement / Finance / Growth) rather than presenting a flat list.
 *
 * Grouping adds labels; it does **not** reorder. §6.2 makes the sequence a
 * product claim, so the groups are drawn along it rather than across it, and
 * `navigation.test.ts` pins the flat order independently. Parts still sits
 * seventh.
 */
export type NavGroup = {
  label: string;
  items: readonly NavKey[];
};

const GROUP_DEFINITIONS: readonly NavGroup[] = [
  { label: "Overview", items: ["today"] },
  { label: "Work", items: ["jobs", "leads", "contracts", "customers"] },
  { label: "Money", items: ["money"] },
  // Team sits with Operations rather than under Settings: staffing the day is
  // an operational act, and it is done far more often than configuration.
  { label: "Operations", items: ["parts", "team"] },
  { label: "Insights", items: ["reports"] },
];

/** Settings lives in the sidebar footer, as it does in the dashboard. */
export const FOOTER_NAV: readonly NavKey[] = ["settings"];

/**
 * The groups a role sees, with items filtered to that role's permitted set and
 * empty groups dropped — so the Accountant does not get an empty "Overview"
 * heading where Today would have been.
 */
export function navGroupsFor(
  role: Role,
): { label: string; items: NavItem[] }[] {
  const allowed = new Set(NAV_BY_ROLE[role]);
  return GROUP_DEFINITIONS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((key) => allowed.has(key))
      .map((key) => NAV_ITEMS[key]),
  })).filter((group) => group.items.length > 0);
}

/** Footer items for a role, filtered the same way. */
export function footerNavFor(role: Role): NavItem[] {
  const allowed = new Set(NAV_BY_ROLE[role]);
  return FOOTER_NAV.filter((key) => allowed.has(key)).map(
    (key) => NAV_ITEMS[key],
  );
}

/**
 * Breakpoints for the navigation chrome (§6.2).
 *
 * "The primary nav is always visible on web (a 232 px left rail at ≥1280 px,
 * collapsing to a 56 px icon+tooltip rail only between 1024–1279 px, and to a
 * labelled bottom bar below 1024 px). **It is never a hamburger on a desktop
 * viewport.**"
 *
 * Note 1366×768 — Priya's actual laptop, and the viewport §6.13.7's density
 * contracts are written against — sits in the ≥1280 band, so she gets the full
 * labelled rail. That is deliberate: she is the highest-volume user in the
 * product and an icon-only rail would cost her a tooltip hover per navigation.
 */
export const NAV_BREAKPOINTS = {
  railFull: 1280,
  railCollapsed: 1024,
} as const;
