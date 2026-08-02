/**
 * Obez Service ERP design tokens — single source of truth (web).
 *
 * Mirrors `obizee-dashboard/src/lib/design/tokens.ts`, which in turn mirrors the
 * React Native app at `OrderManagement/src/constants/{colors,gradients,surfaces,
 * elevation,designSystem}`. This product is an extension of the oBizee family,
 * so the brand values below are copied, not chosen.
 *
 * The CSS-variable theme in `globals.css` is the canonical runtime source for
 * component styling; this module exposes the same values to TypeScript for the
 * places CSS variables cannot reach — recharts series colours, status→tone maps,
 * canvas.
 *
 * RULE, inherited from the dashboard: never hardcode a hex in a component. Use a
 * Tailwind token class (`bg-primary`, `text-success`…) or import from here.
 */

export const colors = {
  // Brand. Orange is the real production primary; the legacy blue #1054DE is dead.
  primary: "#D17C45",
  primaryDark: "#B8612C",
  primaryLight: "#E69568",

  // Warm surfaces
  bg: "#FBF7F3", // app/page background — soft warm off-white
  bgWarm: "#FFF6EE", // hero / auth warm peach
  surface: "#FFFFFF",
  surfaceSand: "#F3E9E0",
  peach: "#FBE7D6",

  // Brown accent
  brown: "#7C633A",
  brownDeep: "#5C4326",

  // Text
  textPrimary: "#1A1A1A",
  textSecondary: "#5C5C5C",
  textMuted: "#82766B",

  // Semantic
  success: "#1FA968",
  successBg: "#EAF5EF",
  warning: "#F5A623",
  warningBg: "#FDF1DD",
  danger: "#D6193C",
  dangerBg: "#FCE8EC",
  info: "#457DD1",
  infoBg: "#E8F0FA",

  // Hairlines
  border: "#ECE3DA",
  inputBorder: "#E4D8CC",
} as const;

/** Categorical palette for charts (recharts `chart-1..5` mirror these). */
export const chartColors = [
  colors.primary, // orange
  colors.success, // green
  colors.info, // blue
  colors.brown, // brown
  "#E6A93C", // gold
  "#8E44AD", // purple (overflow)
] as const;

export const radii = { sm: 6, md: 10, lg: 16, xl: 20, pill: 9999 } as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/**
 * The tone vocabulary. Deliberately the dashboard's six, not a parallel set.
 *
 * PRD §6.13.4 specifies six status families of its own ("six, not thirteen —
 * thirteen colours means no colour means anything"). Rather than introduce a
 * second colour language beside oBizee's, the fifteen job states map onto the
 * tones the dashboard already uses for order statuses. Same principle, one
 * palette across both products.
 */
export type Tone =
  | "muted"
  | "info"
  | "primary"
  | "warning"
  | "success"
  | "danger";

/**
 * Job state → tone, covering PRD §4.2's fifteen states.
 *
 * ⚠️ Under DR-13 these pairs do not clear the 7:1 floor §9.6 asks for, and
 * several do not clear WCAG AA. The compensating control is §6.13.4's other
 * requirement, which still holds and is **not** optional: every status carries a
 * **word and a shape** in addition to colour. Red is auspicious in India and
 * roughly 1 in 12 Indian men has a colour vision deficiency, so colour was never
 * allowed to be the only channel — that matters more now, not less.
 */
export const jobStateTone: Record<string, { label: string; tone: Tone }> = {
  CREATED: { label: "Created", tone: "muted" },
  SCHEDULED: { label: "Scheduled", tone: "muted" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  EN_ROUTE: { label: "En route", tone: "info" },
  ON_SITE: { label: "On site", tone: "primary" },
  IN_PROGRESS: { label: "In progress", tone: "primary" },
  PARTS_AWAITED: { label: "Parts awaited", tone: "warning" },
  CUSTOMER_UNAVAILABLE: { label: "Customer unavailable", tone: "warning" },
  RESCHEDULED: { label: "Rescheduled", tone: "warning" },
  WORK_DONE: { label: "Work done", tone: "success" },
  SIGNED_OFF: { label: "Signed off", tone: "success" },
  INVOICED: { label: "Invoiced", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  CLOSED: { label: "Closed", tone: "muted" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

/** Lead states (§4.1). */
export const leadStateTone: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "warning" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  CONTACTED: { label: "Contacted", tone: "info" },
  SURVEY_SCHEDULED: { label: "Survey scheduled", tone: "primary" },
  QUOTED: { label: "Quoted", tone: "primary" },
  WON: { label: "Won", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
  PARKED: { label: "Parked", tone: "muted" },
};

/**
 * Tone → badge classes. Copied from `obizee-dashboard/src/components/shared/
 * status-badge.tsx` rather than re-derived, including two decisions of theirs
 * that are better than the obvious approach:
 *
 * - **Opacity-based tints** (`/12` fill, `/25` border) instead of a parallel set
 *   of hardcoded `-bg` hexes. One source colour per tone, tints derived from it,
 *   so a brand change propagates instead of drifting.
 * - **`text-brand-brown` on warning**, not `text-warning`. `#F5A623` as text is
 *   2.03:1 on white and effectively unreadable; the dashboard had already
 *   reached for the brown accent to solve it.
 */
export const toneClasses: Record<Tone, string> = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-brand-brown border-warning/30",
  info: "bg-info/12 text-info border-info/25",
  primary: "bg-primary/12 text-primary border-primary/25",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
  muted: "bg-muted text-muted-foreground border-border",
};
