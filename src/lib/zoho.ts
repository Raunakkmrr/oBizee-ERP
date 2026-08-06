import type { Invoice } from "@/lib/data/store";

/**
 * Zoho Books invoice import — FR-1001's second half.
 *
 * > *"Tally XML + Zoho exports that import **without manual fixing**."*
 *
 * The Tally envelope was built; Zoho was not, so "exports" was half true. Zoho
 * takes a CSV, and the phrase that matters is *without manual fixing* — an
 * export that imports with three column mappings and a date reformat is an
 * export the accountant does by hand anyway.
 *
 * Four things this gets right that a naive dump does not:
 *
 * 1. **Zoho's own column names**, spelled exactly as its importer expects, so
 *    the mapping step auto-matches instead of asking.
 * 2. **`yyyy-MM-dd` dates.** Zoho reads `dd/MM/yyyy` as US order on some
 *    locales and silently books an invoice in the wrong month.
 * 3. **Rupees, not paise.** Paise are this product's internal unit; exporting
 *    them would inflate every figure a hundredfold, and it would import
 *    cleanly, which is worse.
 * 4. **One row per line**, repeating the invoice header — Zoho's line-item
 *    format. Collapsing to one row per invoice loses the HSN and the rate,
 *    which is exactly what an accountant then re-enters.
 */

export const ZOHO_COLUMNS = [
  "Invoice Number",
  "Invoice Date",
  "Customer Name",
  "Item Name",
  "HSN/SAC",
  "Quantity",
  "Item Price",
  "Item Tax %",
  "Item Tax Type",
  "Place of Supply",
  "Notes",
] as const;

/** `2026-08-06` — ISO, so no locale can reinterpret the order. */
export function zohoDate(on: Date): string {
  return `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, "0")}-${String(
    on.getDate(),
  ).padStart(2, "0")}`;
}

export function zohoRows(
  invoices: readonly Invoice[],
  on: Date,
  placeOfSupply: string,
): (string | number)[][] {
  return invoices.flatMap((invoice) =>
    invoice.lines.map((line) => [
      invoice.number,
      zohoDate(on),
      invoice.customer,
      line.description,
      line.code,
      line.qty,
      // Rupees. `ratePaise / 100` and never the raw paise.
      line.ratePaise / 100,
      line.ratePercent,
      // Zoho splits intra-state tax itself once told which kind it is.
      invoice.head === "IGST" ? "Inter State" : "Intra State",
      placeOfSupply,
      invoice.explanation,
    ]),
  );
}
