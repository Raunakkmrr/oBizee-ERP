import { Requires } from "@/components/shared/requires";
import { RecordAdvanceForm } from "./record-advance-form";

/**
 * Taking money before the work is `payment:write` — the accountant and the
 * owner. It issues a Receipt Voucher against the statutory series and makes tax
 * fall due on receipt (§31(3)(d)), which is not a coordinator's decision.
 */
export default function RecordAdvancePage() {
  return (
    <Requires permission="payment:write">
      <RecordAdvanceForm />
    </Requires>
  );
}
