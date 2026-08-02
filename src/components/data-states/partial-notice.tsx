import { CircleAlert } from "lucide-react";
import type { PartialFailure } from "@/lib/data/result";

/**
 * The Partial state — PRD §6.3.
 *
 * "The state most products skip and this market hits constantly. When a
 * screen's primary data loads but a secondary source fails, the primary content
 * renders fully and the failed region is replaced by a **bordered inline notice
 * naming what is missing and what still works**."
 *
 * The notice occupies the failed region only — it is not a page-level banner,
 * because the rest of the screen is fine and saying otherwise would be a lie.
 *
 * The companion rule, enforced elsewhere by `Computed<T>`: a number that could
 * not be computed shows an em-dash and a footnote, **never a zero**.
 */
export function PartialNotice({ failure }: { failure: PartialFailure }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-input bg-muted p-4"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 space-y-1">
        {/* Names what is missing, in the user's words. */}
        <p className="text-sm text-foreground">{failure.region} unavailable.</p>
        {/* And what still works — the half that stops this reading as an outage. */}
        <p className="text-sm text-muted-foreground">
          {failure.stillWorks} still works.
        </p>
        <p className="select-all text-xs text-muted-foreground tnum-id">
          Code: {failure.code}
        </p>
      </div>
    </div>
  );
}
