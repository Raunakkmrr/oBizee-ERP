import { Requires } from "@/components/shared/requires";
import { NewPurchaseForm } from "./new-purchase-form";

/**
 * Recording an inward bill is `part:purchase` — the accountant and the owner.
 *
 * Ungated, a coordinator was given the whole form: vendor, amount, TDS section,
 * reverse-charge confirmation, the lot — and a "Record the bill" button whose
 * only possible outcome was a 403. A refusal after the data entry is worse than
 * a refusal instead of it, and §9.4 is explicit that hiding a nav item is a
 * courtesy rather than a permission.
 */
export default function NewPurchasePage() {
  return (
    <Requires permission="part:purchase">
      <NewPurchaseForm />
    </Requires>
  );
}
