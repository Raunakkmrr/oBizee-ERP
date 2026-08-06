import { z } from "zod";

/**
 * The rate master — FR-804.
 *
 * > *"Rate slabs 0/5/18/40, **effective-dated rows, never edited**."*
 *
 * **Why "never edited" is the whole requirement.** A rate is not a setting, it
 * is a fact about a period. When the slab on a service changes — and the 2026
 * rationalisation moved several — an invoice raised last September was correct
 * at 18% and must stay correct at 18%. A product that lets somebody *edit* the
 * rate silently re-prices history: reprints disagree with what the customer
 * paid, the GSTR-1 working paper stops reconciling, and nobody can say when it
 * changed or who changed it.
 *
 * So a change **supersedes** rather than updates. Every row keeps its
 * `effectiveFrom`, and `rateOn(code, date)` answers with the row in force on
 * that date — which means an invoice dated 3 September finds September's rate
 * whether it is raised that day or reprinted two years later.
 *
 * `SLABS` is what a *new* row may be set to — the four slabs in force. It is
 * deliberately not the schema's type: 28% was a real slab until the 2025
 * rationalisation, and a master that cannot hold a withdrawn rate cannot price
 * an invoice raised while it applied, which defeats the point of dating rows at
 * all.
 */

export const SLABS = [0, 5, 18, 40] as const;
export type Slab = (typeof SLABS)[number];

export const rateRowSchema = z.object({
  id: z.string(),
  /** HSN for goods, SAC for services — the same field, as GST treats it. */
  code: z.string(),
  description: z.string(),
  /** Any rate that was ever law — see `SLABS` for what a new row may use. */
  ratePercent: z.number().nonnegative(),
  /** ISO date. The row is in force from this day, inclusive. */
  effectiveFrom: z.string(),
  /**
   * Why this rate, in the words of whoever recorded it. Present because "who
   * decided 18%" is the question asked in an assessment, and a rate master
   * without a reason is an assertion.
   */
  note: z.string(),
});

export type RateRow = z.infer<typeof rateRowSchema>;
export const ratesSchema = z.array(rateRowSchema);

/**
 * The rate in force for a code on a date.
 *
 * Returns null rather than a default when nothing covers the date. A silent
 * fallback to 18% is how a nil-rated supply gets taxed, and the caller can say
 * "no rate on file" where this cannot invent one.
 */
export function rateOn(
  rows: readonly RateRow[],
  code: string,
  on: Date,
): RateRow | null {
  const iso = isoDay(on);
  const candidates = rows
    .filter((row) => row.code === code && row.effectiveFrom <= iso)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] ?? null;
}

/** Every version of one code, newest first — the history an assessment asks for. */
export function historyOf(rows: readonly RateRow[], code: string): RateRow[] {
  return rows
    .filter((row) => row.code === code)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/** One row per code: what is in force today. */
export function currentRates(rows: readonly RateRow[], on: Date): RateRow[] {
  const codes = [...new Set(rows.map((row) => row.code))];
  return codes
    .map((code) => rateOn(rows, code, on))
    .filter((row): row is RateRow => row !== null)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * A superseding row. The only way a rate ever changes.
 *
 * Deliberately not an `updateRate`: there is no function in this module that
 * mutates an existing row, because the guarantee is structural rather than a
 * convention somebody could break in a hurry.
 */
export function supersede(
  rows: readonly RateRow[],
  next: Omit<RateRow, "id">,
): RateRow[] {
  return [
    ...rows,
    { ...next, id: `rate_${next.code}_${next.effectiveFrom}` },
  ];
}

function isoDay(on: Date): string {
  return `${on.getFullYear()}-${pad(on.getMonth() + 1)}-${pad(on.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `2026-09-22` as `22 Sep 2026`. */
export function effectiveWords(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The codes this firm actually bills on, with one real supersession.
 *
 * 9987 carries two rows so the screen demonstrates the mechanic rather than
 * describing it: the older row stays visible and an invoice dated before the
 * change still finds the older rate.
 */
export const SEED_RATES: RateRow[] = [
  {
    id: "rate_9987_2017-07-01",
    code: "9987",
    description: "Maintenance, repair and installation services",
    ratePercent: 18,
    effectiveFrom: "2017-07-01",
    note: "GST introduction — Notification 11/2017-CT(R)",
  },
  {
    id: "rate_998719_2017-07-01",
    code: "998719",
    description: "Maintenance and repair of commercial machinery",
    ratePercent: 18,
    effectiveFrom: "2017-07-01",
    note: "Six-digit SAC, used once AATO exceeds ₹5 crore (FR-803)",
  },
  {
    id: "rate_85321000_2017-07-01",
    code: "85321000",
    description: "Fixed capacitors, mains",
    ratePercent: 28,
    effectiveFrom: "2017-07-01",
    note: "The 28% slab, as it stood before the 2025 rationalisation",
  },
  {
    id: "rate_85321000_2025-09-22",
    code: "85321000",
    description: "Fixed capacitors, mains",
    ratePercent: 18,
    effectiveFrom: "2025-09-22",
    note: "Rate rationalisation — the 28% slab was withdrawn",
  },
  {
    id: "rate_84212300_2017-07-01",
    code: "84212300",
    description: "Oil and fuel filters for engines",
    ratePercent: 18,
    effectiveFrom: "2017-07-01",
    note: "Parts consumed on generator AMCs",
  },
];
