/**
 * Parts & stock — PRD §6.14's abbreviated but binding spec.
 *
 * **The one decision:** *what do I need to buy, and what is unaccounted for?*
 *
 * Three visible tabs, and **Reorder is the default because it is the only one
 * that produces an action**. Stock-by-location answers a question; Exceptions
 * reports a mess; only Reorder ends in a purchase order.
 *
 * This screen sits **seventh** in the navigation on purpose. §6.2's rationale:
 * "Parts exist because a technician fits one. This is the position that most
 * distinguishes this product from a generic ERP, where inventory is item two.
 * If it ever creeps upward, the product has drifted off its thesis."
 */
import { z } from "zod";
import { apiFetch } from "../api/client";
import { defineQuery, type Fetched } from "./source";

export const PARTS_TABS = ["reorder", "locations", "exceptions"] as const;
export type PartsTab = (typeof PARTS_TABS)[number];

export const PARTS_TAB_LABEL: Record<PartsTab, string> = {
  reorder: "Reorder",
  locations: "Stock by location",
  exceptions: "Exceptions",
};

const reorderSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** FR-803: the code's digit count follows the tenant's AATO. */
  hsn: z.string(),
  onHand: z.number().int(),
  reorderLevel: z.number().int().nonnegative(),
  /** What the last month actually consumed — the number that sizes the order. */
  monthlyConsumption: z.number().int().nonnegative(),
  preferredVendor: z.string().nullable(),
  unitCostPaise: z.number().int().nullable(),
});

export type ReorderRow = z.infer<typeof reorderSchema>;

const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["STORE", "VAN"]),
  /**
   * §6.14: a van is listed **with the technician named**. "Van 3" is not
   * actionable; "Ramesh's van" is — you call Ramesh.
   */
  technicianName: z.string().nullable(),
  lines: z.array(
    z.object({ partId: z.string(), partName: z.string(), qty: z.number().int() }),
  ),
});

export type StockLocation = z.infer<typeof locationSchema>;

/**
 * The three exception kinds §6.14 names. A closed union, because each one has a
 * different remedy and a generic "problem" row would hide that.
 */
export const EXCEPTION_KINDS = [
  "NEGATIVE_ON_HAND",
  "UNCATALOGUED",
  "ISSUE_WITHOUT_CHALLAN",
] as const;

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  NEGATIVE_ON_HAND: "Negative on-hand",
  UNCATALOGUED: "Recorded by a technician, not yet catalogued",
  ISSUE_WITHOUT_CHALLAN: "Issued without a delivery challan",
};

/** What each exception actually means, and why it cannot simply be ignored. */
export const EXCEPTION_WHY: Record<ExceptionKind, string> = {
  NEGATIVE_ON_HAND:
    "Stock was consumed that the system never received — the purchase was not recorded, or the issue was.",
  UNCATALOGUED:
    "A technician fitted something that has no part record, so it has no HSN code and cannot be billed correctly.",
  ISSUE_WITHOUT_CHALLAN:
    "Goods moved without the document that makes the movement defensible in an assessment.",
};

const exceptionSchema = z.object({
  id: z.string(),
  kind: z.enum(EXCEPTION_KINDS),
  partName: z.string(),
  detail: z.string(),
  qty: z.number().int().nullable(),
  raisedBy: z.string().nullable(),
  raisedOn: z.string(),
});

export type PartException = z.infer<typeof exceptionSchema>;

export const partsSchema = z.object({
  reorder: z.array(reorderSchema),
  locations: z.array(locationSchema),
  exceptions: z.array(exceptionSchema),
});

export type PartsData = z.infer<typeof partsSchema>;

/**
 * How many to buy: cover the coming month's consumption and get back above the
 * reorder level. Never fewer than one — a row that says "order 0" has no
 * business being on a screen whose entire purpose is producing an order.
 */
export function suggestedOrderQty(row: ReorderRow): number {
  const shortfall = Math.max(0, row.reorderLevel - row.onHand);
  return Math.max(1, shortfall + row.monthlyConsumption);
}

/**
 * Reorder urgency, as a word. Colour alone is not a channel (§6.13.4), and
 * "below reorder level" and "already out of stock" are different problems: one
 * is a purchase order, the other is a technician who cannot finish a job today.
 */
export type ReorderUrgency = "out" | "below" | "at";

export function urgencyFor(row: ReorderRow): ReorderUrgency {
  if (row.onHand <= 0) return "out";
  if (row.onHand < row.reorderLevel) return "below";
  return "at";
}

export const URGENCY_WORD: Record<ReorderUrgency, string> = {
  out: "Out of stock",
  below: "Below reorder level",
  at: "At reorder level",
};

/** Out of stock first, then by how deep the shortfall runs. */
export function byUrgency(a: ReorderRow, b: ReorderRow): number {
  const rank: Record<ReorderUrgency, number> = { out: 0, below: 1, at: 2 };
  const diff = rank[urgencyFor(a)] - rank[urgencyFor(b)];
  if (diff !== 0) return diff;
  return a.onHand - a.reorderLevel - (b.onHand - b.reorderLevel);
}

const FIXTURE = {
  reorder: [
    {
      id: "prt_1",
      name: "Capacitor 45 MFD",
      hsn: "8532",
      onHand: 0,
      reorderLevel: 10,
      monthlyConsumption: 14,
      preferredVendor: "Kumar Refrigeration Spares",
      unitCostPaise: 340_00,
    },
    {
      id: "prt_2",
      name: "R-32 refrigerant (800g)",
      hsn: "3827",
      onHand: 3,
      reorderLevel: 8,
      monthlyConsumption: 11,
      preferredVendor: "Delhi Chemical Traders",
      unitCostPaise: 1_150_00,
    },
    {
      id: "prt_3",
      name: "Blower motor 1/4 HP",
      hsn: "8414",
      onHand: 4,
      reorderLevel: 4,
      monthlyConsumption: 3,
      // No vendor on record — the row still has to be orderable, so the UI
      // offers "Choose vendor" rather than hiding it.
      preferredVendor: null,
      unitCostPaise: 2_400_00,
    },
    {
      id: "prt_4",
      name: "Drain pump",
      hsn: "8413",
      onHand: 2,
      reorderLevel: 6,
      monthlyConsumption: 5,
      preferredVendor: "Nehru Place Electricals",
      // Cost unknown — must render an em-dash, never ₹0.
      unitCostPaise: null,
    },
  ],
  locations: [
    {
      id: "loc_1",
      name: "Okhla store",
      kind: "STORE" as const,
      technicianName: null,
      lines: [
        { partId: "prt_1", partName: "Capacitor 45 MFD", qty: 0 },
        { partId: "prt_2", partName: "R-32 refrigerant (800g)", qty: 3 },
        { partId: "prt_3", partName: "Blower motor 1/4 HP", qty: 4 },
        { partId: "prt_4", partName: "Drain pump", qty: 2 },
      ],
    },
    {
      id: "loc_2",
      name: "Van 1",
      kind: "VAN" as const,
      technicianName: "Ramesh Yadav",
      lines: [
        { partId: "prt_1", partName: "Capacitor 45 MFD", qty: 2 },
        { partId: "prt_2", partName: "R-32 refrigerant (800g)", qty: 1 },
      ],
    },
    {
      id: "loc_3",
      name: "Van 2",
      kind: "VAN" as const,
      technicianName: "Lakshminarayanan Subramaniam",
      lines: [
        // Negative on hand — surfaced in Exceptions, and shown honestly here.
        { partId: "prt_4", partName: "Drain pump", qty: -1 },
      ],
    },
  ],
  exceptions: [
    {
      id: "exc_1",
      kind: "NEGATIVE_ON_HAND" as const,
      partName: "Drain pump",
      detail: "Van 2 · Lakshminarayanan Subramaniam",
      qty: -1,
      raisedBy: null,
      raisedOn: "31 Jul 2026",
    },
    {
      id: "exc_2",
      kind: "UNCATALOGUED" as const,
      partName: "“fan blade 18 inch”",
      detail: "Fitted on J-2608-0402 · Kapoor Residency",
      qty: 1,
      raisedBy: "Lakshminarayanan Subramaniam",
      raisedOn: "1 Aug 2026",
    },
    {
      id: "exc_3",
      kind: "ISSUE_WITHOUT_CHALLAN" as const,
      partName: "R-32 refrigerant (800g)",
      detail: "Okhla store → Van 1",
      qty: 4,
      raisedBy: "Priya Sharma",
      raisedOn: "29 Jul 2026",
    },
  ],
};

export const getParts = defineQuery<void, PartsData>({
  key: "parts.overview",
  schema: partsSchema,
  api: async () => apiFetch<PartsData>("/api/parts"),
  fixture: (): Fetched<unknown> => ({ raw: FIXTURE }),
});
