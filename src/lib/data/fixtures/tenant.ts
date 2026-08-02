/**
 * The seed tenant — a test service firm, and the identities that work inside it.
 *
 * **Obez Service ERP has its own identity domain.** Its users are a service
 * firm's own staff, not oBizee merchant accounts, and its database is separate
 * (DR-3). A tenant here has no relationship to an oBizee merchant unless
 * account-linking is added deliberately later.
 *
 * Under DR-9 this is a fixture rather than a database row. It becomes the seed
 * script's payload when the backend phase opens, which is why it is shaped like
 * real records rather than like demo data — S10 requires fixtures with nulls
 * present, names at their longest, and enough rows to force the behaviours a
 * happy-path fixture hides.
 *
 * The firm is deliberately **generic to service businesses**, not modelled on
 * one vertical: AC and refrigeration with an AMC book, which is the PRD's own
 * lead example, plus the contract shapes the pest-control research surfaced
 * (multi-schedule contracts, a property-linked warranty). Per DR-12 nothing here
 * is pest-control-specific.
 */

import type { Role } from "@/lib/roles";
import { asPaise, type Paise } from "@/lib/money";

export type SeedUser = {
  id: string;
  name: string;
  /** Phone is the primary credential — §9.4 makes phone + OTP the main method,
   *  because this market's users do not reliably have or remember email. */
  phone: string;
  /** Optional: only desktop roles reliably have one (§9.4). */
  email: string | null;
  role: Role;
  /** Per-user override on the role default (FR-1304). Null = use role default. */
  languageOverride: string | null;
  active: boolean;
};

export type SeedBranch = {
  id: string;
  name: string;
  /** FR-1303. One branch at launch; the column exists from day one (defect D4). */
  gstin: string;
  stateCode: string;
  jobSeriesPrefix: string;
  invoiceSeriesPrefix: string;
};

export type SeedTenant = {
  id: string;
  businessName: string;
  legalName: string;
  /** Drives FR-803's HSN/SAC digit precision and FR-808's e-invoicing threshold. */
  aatoPaise: Paise;
  taxScheme: "REGULAR" | "COMPOSITION_SERVICES_6PC";
  /** §9.7 — the tenant's declared regional language, the Technician role default. */
  regionalLanguage: string;
  branches: SeedBranch[];
  toggles: {
    technicianSeesPrices: boolean;
    coordinatorCanBill: boolean;
    allowBillingWithoutSignoff: boolean;
  };
  slots: { label: string; from: string; to: string }[];
};

/**
 * ₹4.2 crore AATO is chosen, not arbitrary: it sits **just below** FR-808's
 * ₹5 crore e-invoicing threshold, so the GST workspace renders its "You are
 * ₹80 lakh below the ₹5 crore e-invoicing threshold" notice rather than the
 * happy path. A fixture at ₹50 lakh would never exercise that state.
 */
export const SEED_TENANT: SeedTenant = {
  id: "tnt_0001",
  businessName: "Shakti Cooling & Services",
  legalName: "Shakti Cooling And Services Private Limited",
  // ₹4.20 crore. Written with an explicit digit group because the first
  // attempt was 42_00_00_000_00 — ₹42 crore, ten times the intent — which put
  // the tenant *above* the ₹5 crore threshold and made the invoice emit 6-digit
  // HSN/SAC codes while the compliance panel still read "below the threshold".
  // Two surfaces disagreeing about the same fact is precisely what that panel
  // exists to prevent, and it was only visible on a rendered invoice.
  aatoPaise: asPaise(4_20_00_000_00),
  taxScheme: "REGULAR",
  regionalLanguage: "hi",
  branches: [
    {
      id: "brn_0001",
      name: "Nehru Place",
      gstin: "07AABCS1429B1ZX",
      stateCode: "07", // Delhi
      jobSeriesPrefix: "J",
      invoiceSeriesPrefix: "SVC",
    },
  ],
  toggles: {
    // FR-1302 default OFF — a stated anti-freelancing control, not paranoia.
    technicianSeesPrices: false,
    coordinatorCanBill: false,
    // §4.2: off by default, audited when used.
    allowBillingWithoutSignoff: false,
  },
  // §11-Q15's assumed slots until the client confirms otherwise.
  slots: [
    { label: "Morning", from: "09:00", to: "13:00" },
    { label: "Afternoon", from: "13:00", to: "17:00" },
    { label: "Evening", from: "17:00", to: "20:00" },
  ],
};

/**
 * One identity per role, so every screen can be rendered as the persona it was
 * designed for rather than always as an owner who can see everything.
 *
 * Names are deliberately varied in length and script-origin. `Lakshminarayanan`
 * is here on purpose: it is the longest realistic name in the set, and a shell
 * that only ever renders "Priya" will not reveal that the user menu truncates.
 */
export const SEED_USERS: SeedUser[] = [
  {
    id: "usr_0001",
    name: "Manish Agarwal",
    phone: "9811000001",
    email: "manish@shakticooling.example",
    role: "owner",
    languageOverride: null,
    active: true,
  },
  {
    id: "usr_0002",
    name: "Priya Sharma",
    phone: "9811000002",
    // No email: §3.2's coordinator is a phone-first user.
    email: null,
    role: "coordinator",
    languageOverride: null,
    active: true,
  },
  {
    id: "usr_0003",
    name: "Ramesh Yadav",
    phone: "9811000003",
    email: null,
    role: "technician",
    // Overrides the tenant default (hi) — FR-1304's per-user override.
    languageOverride: "mr",
    active: true,
  },
  {
    id: "usr_0004",
    name: "Lakshminarayanan Subramaniam",
    phone: "9811000004",
    email: null,
    role: "technician",
    languageOverride: "ta",
    active: true,
  },
  {
    id: "usr_0005",
    name: "Suresh Gupta",
    phone: "9811000005",
    email: "suresh@shakticooling.example",
    role: "accountant",
    languageOverride: null,
    active: true,
  },
  {
    id: "usr_0006",
    name: "M. K. Rao & Associates",
    phone: "9811000006",
    email: "ca@mkrao.example",
    role: "readonly_ca",
    languageOverride: null,
    active: true,
  },
  {
    id: "usr_0007",
    name: "Deepak Verma",
    phone: "9811000007",
    email: null,
    role: "technician",
    languageOverride: null,
    // Inactive on purpose: the People screen must render a disabled member, and
    // an inactive technician must not appear in the assignment panel.
    active: false,
  },
];

/** The identity the app renders as while there is no session (DR-9). */
export const CURRENT_USER: SeedUser = SEED_USERS[1]; // Priya, the coordinator

export function seedUserById(id: string): SeedUser | null {
  return SEED_USERS.find((user) => user.id === id) ?? null;
}

export function seedUsersByRole(role: Role): SeedUser[] {
  return SEED_USERS.filter((user) => user.role === role && user.active);
}
