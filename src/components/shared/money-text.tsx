import { formatMoney, formatMoneyBare, type Paise } from "@/lib/money";
import { renderComputed, type Computed } from "@/lib/data/result";
import { cn } from "@/lib/utils";

/**
 * Renders an INR amount — mirrors `obizee-dashboard/src/components/shared/
 * money-text.tsx`, with three deliberate differences, each forced by this being
 * an ERP that issues statutory documents rather than a commerce dashboard.
 *
 * **1. Two decimals, always.** The dashboard formats with
 * `maximumFractionDigits: 0` (`₹4,500`). PRD §6.13.6 rule 3 requires
 * `₹4,500.00` — "a missing decimal makes a user check whether it was truncated".
 * On a screen whose numbers must foot to a GSTR-1 return to the paisa, the
 * dashboard's rounding is the wrong default. **Flagged to the client as a
 * knowing divergence from the shared convention, not an oversight.**
 *
 * **2. Integer paise, not a float `number`.** The dashboard takes
 * `amount: number | null | undefined` and substitutes `0` for anything
 * non-numeric. Here the input is a branded `Paise`, and an unavailable figure is
 * a `Computed<T>` that renders an em-dash — because §6.3 calls showing ₹0 for a
 * figure that failed to load "the worst defect class this product can ship".
 * The dashboard's `?? 0` is exactly that defect.
 *
 * **3. Masking is a prop, not global state.** The dashboard reads
 * `hideFinancials` from Redux. There is no Redux here yet, and masking has a
 * second job in this product: FR-1302's technician price visibility, which must
 * be enforced **server-side** rather than by a client toggle. Passing it in
 * keeps the eventual server-stripped payload the source of truth.
 */
export function MoneyText({
  amount,
  className,
  maskable = true,
  hidden = false,
  bare = false,
}: {
  /** A resolved amount, or a computed one that may be unavailable. */
  amount: Paise | Computed<Paise>;
  className?: string;
  /** False for amounts that must always show — an invoice total, a receipt. */
  maskable?: boolean;
  hidden?: boolean;
  /** Omit the ₹ symbol, for accounting tables under a currency-labelled column. */
  bare?: boolean;
}) {
  if (maskable && hidden) {
    return (
      <span className={cn("tabular-nums tracking-widest", className)}>
        ••••
      </span>
    );
  }

  const format = bare ? formatMoneyBare : formatMoney;
  const text =
    typeof amount === "number"
      ? format(amount)
      : renderComputed(amount, format);

  return <span className={cn("tabular-nums", className)}>{text}</span>;
}
