import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The Empty state — PRD §6.3, §6.13.10.
 *
 * "Three parts, always: one plain sentence saying what is empty **in the user's
 * own words**; the **two** most likely next actions as labelled buttons; and, if
 * relevant, one line of orientation. Never an illustration alone, never 'No data
 * found', never a bare table header."
 *
 * §6.13.10 goes further and bans decorative illustrations outright: "Empty
 * states are sentences and buttons. A cheerful illustration on a screen where a
 * coordinator expected her work is condescending."
 *
 * §6.3's worked example, which this component is shaped to produce exactly:
 *   "No jobs scheduled for today."  [Create a job] [See tomorrow (4)]
 *   "3 leads are due for follow-up today."
 *
 * Note the orientation line in that example points at a *different* screen. An
 * empty screen is the best moment to tell someone where the work actually is,
 * and that is why the third part exists.
 */

export type EmptyAction = {
  label: string;
  href: string;
};

export type EmptyStateProps = {
  /**
   * One plain sentence. "No jobs scheduled for today." — not "No data found",
   * not "Nothing here yet".
   */
  sentence: string;
  /**
   * One or two next actions. Typed as a tuple so a caller cannot ship five
   * buttons or zero: §6.3 says "the two most likely next actions", and an empty
   * state with no action is a dead end.
   *
   * Exactly one primary is styled — §6.13.2 makes a second primary-styled
   * button on a screen a defect, so the second action is always secondary.
   */
  actions: readonly [EmptyAction] | readonly [EmptyAction, EmptyAction];
  /** The optional third part: one line of orientation. */
  orientation?: string;
};

export function EmptyState({
  sentence,
  actions,
  orientation,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-4 px-4 py-12">
      {/* A sentence, not a section title — so not a heading element. */}
      <p className="text-base font-medium text-foreground">{sentence}</p>

      <div className="flex flex-wrap gap-3">
        {actions.map((action, index) => (
          <Button
            key={action.href}
            // Base UI uses `render`, not Radix's `asChild` — matching the
            // dashboard's primitive layer.
            render={<Link href={action.href} />}
            // These actions navigate, so they render as <a>. Base UI defaults
            // `nativeButton` to true and warns at runtime that a non-<button>
            // silently loses native button semantics; declaring it false keeps
            // the element honest to assistive technology instead of a link
            // pretending to be a button.
            nativeButton={false}
            // Exactly one primary (§6.13.2); the second action is always
            // secondary, because a second primary destroys the only cue telling
            // a hurried user where to go.
            variant={index === 0 ? "default" : "outline"}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {orientation ? (
        <p className="text-sm text-muted-foreground">{orientation}</p>
      ) : null}
    </div>
  );
}
