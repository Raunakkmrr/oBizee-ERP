/**
 * Money — FR-801, FR-813, PRD §6.13.6.
 *
 * Money is an integer count of paise. Everywhere. No exceptions: not in a
 * database column, an API field, an in-memory value, a queue payload, an export
 * file or a cache entry. FR-801's rationale is worth restating because it is
 * the reason this module is strict rather than convenient — IEEE-754 cannot
 * represent ₹0.10 exactly, so a float-based system is not "usually right", it is
 * wrong on a schedule you cannot predict. And an ERP that is out by one paisa on
 * a GSTR-1 return is an ERP the accountant abandons.
 *
 * Two consequences implemented here:
 *
 * 1. `Paise` is a branded type. A plain `number` will not type-check where paise
 *    is expected, so passing rupees into a paise field is a compile error rather
 *    than a 100× bug discovered at month-end.
 *
 * 2. Formatting never divides by 100 in floating point. The rupee and paise
 *    parts are split with integer arithmetic and recombined as a string, so no
 *    rounding error can enter at the render step.
 *
 * Arithmetic on money is deliberately NOT in this module. Tax computation,
 * line-total rounding and the CGST/SGST split (FR-812) are server-side
 * concerns, and duplicating them client-side would create a second source of
 * truth for a number that must foot exactly.
 */

/** An integer count of paise. 100 paise = ₹1. */
export type Paise = number & { readonly __brand: "paise" };

/** Thrown when a value that must be integer paise is not. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Construct a `Paise` from a number, rejecting anything that is not a safe
 * integer. This is the only way to obtain a `Paise`, which makes the invariant
 * checkable at exactly one place.
 *
 * The API rejects non-integer `*_paise` fields with `422 MONEY_MUST_BE_INTEGER_PAISE`
 * (FR-801); this is the client-side counterpart, so a bad fixture or a bad API
 * response fails loudly at the boundary instead of rendering a wrong number.
 */
export function asPaise(value: number): Paise {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `Money must be an integer number of paise, received ${value}. ` +
        `A fractional paisa means a float leaked into a money path.`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(
      `Money value ${value} exceeds the safe integer range and cannot be represented exactly.`,
    );
  }
  return value as Paise;
}

/** Convert a rupee amount to paise. Rounds to the nearest paisa explicitly. */
export function rupeesToPaise(rupees: number): Paise {
  return asPaise(Math.round(rupees * 100));
}

export const ZERO_PAISE = 0 as Paise;

/**
 * Splits paise into its rupee and paisa parts using integer arithmetic only.
 * `abs - (abs % 100)` is exact for any safe integer, and dividing an exact
 * multiple of 100 yields an exactly representable result — so no float error is
 * possible here.
 */
function split(paise: Paise): {
  negative: boolean;
  rupees: number;
  fraction: string;
} {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const fraction = abs % 100;
  const rupees = (abs - fraction) / 100;
  return {
    negative,
    rupees,
    fraction: String(fraction).padStart(2, "0"),
  };
}

/**
 * Indian digit grouping (FR-813) applied to the rupee part only. `en-IN` groups
 * in two-digit blocks above the thousand: 12,34,567 — not 1,234,567.
 */
const groupRupees = new Intl.NumberFormat("en-IN", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * The grouped figure with two decimal places and no currency symbol.
 * Decimals are always shown, always two places — `4,500.00`, never `4,500`,
 * because a missing decimal makes a user check whether it was truncated
 * (§6.13.6 rule 3).
 */
function figure(paise: Paise): { negative: boolean; text: string } {
  const { negative, rupees, fraction } = split(paise);
  return { negative, text: `${groupRupees.format(rupees)}.${fraction}` };
}

/**
 * The default rendering. `₹12,34,567.89`.
 *
 * Negatives render in parentheses rather than with a leading minus. Two reasons:
 * a minus sign is a single thin glyph that is easy to miss on a washed-out LCD
 * panel in daylight, and §6.13.6 rule 6 bans `-₹1,200.00` on customer-facing
 * surfaces outright — so using one convention everywhere avoids maintaining two
 * mental models for the same number.
 *
 * Never abbreviated (§6.13.6 rule 5): `₹3,12,400.00`, never `₹3.1L`.
 */
export function formatMoney(paise: Paise): string {
  const { negative, text } = figure(paise);
  return negative ? `(₹${text})` : `₹${text}`;
}

/**
 * For accounting tables, where the rupee symbol lives in the column heading.
 * `12,34,567.89`, and `(1,200.00)` for credits (§6.13.6 rule 6).
 *
 * §6.13.6 rule 7 permits the bare figure precisely because money "always sits in
 * a labelled row or under a labelled heading" — so a caller using this owes the
 * reader that heading.
 */
export function formatMoneyBare(paise: Paise): string {
  const { negative, text } = figure(paise);
  return negative ? `(${text})` : text;
}

/**
 * Customer-facing surfaces — WhatsApp bodies, invoice PDFs, the sign-off screen.
 * A credit reads `Advance ₹1,200.00`, never `-₹1,200.00`, because showing a
 * customer a negative number invites a dispute about a balance that is in their
 * favour (§6.13.6 rule 6).
 */
export function formatMoneyForCustomer(paise: Paise): string {
  const { negative, text } = figure(paise);
  return negative ? `Advance ₹${text}` : `₹${text}`;
}

/**
 * Chart axis tick labels — **the only place abbreviation is permitted**
 * (§6.13.6 rule 5), and only because the full figure is available in the
 * tooltip. Uses Indian magnitudes: L for lakh (10⁵), Cr for crore (10⁷). There
 * is deliberately no "K", because Indian financial reading jumps from thousands
 * straight to lakhs.
 *
 * Never use this in a KPI, a total, or a table row.
 */
export function formatMoneyAxis(paise: Paise): string {
  const { negative, rupees, fraction } = split(paise);
  const sign = negative ? "-" : "";

  const CRORE = 10_000_000;
  const LAKH = 100_000;

  if (rupees >= CRORE) {
    return `${sign}₹${trimTrailingZero(rupees / CRORE)}Cr`;
  }
  if (rupees >= LAKH) {
    return `${sign}₹${trimTrailingZero(rupees / LAKH)}L`;
  }
  if (rupees === 0 && fraction !== "00") {
    return `${sign}₹0.${fraction}`;
  }
  return `${sign}₹${groupRupees.format(rupees)}`;
}

function trimTrailingZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
