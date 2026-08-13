"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { ErrorState } from "@/components/data-states/error-state";
import { useMutation } from "@/lib/api/use-mutation";
import { signOffJob, transitionJob } from "@/lib/api/mutations";
import { cn } from "@/lib/utils";

/**
 * Moving a job along, from the office.
 *
 * **Nothing could.** `transitionJob` existed in the mutation layer and was
 * called by no screen, so there was no way anywhere in the browser to take a
 * job from Assigned to En route to On site to Work done. The technician's phone
 * app is meant to do that from the field — it does not exist yet — and in the
 * meantime the office had no way to say the work had happened, which meant a
 * job could never become billable through the product at all.
 *
 * **Why the office doing it is legitimate, and named as such.** FR-205 has the
 * primary technician transitioning from the field; a coordinator moving a job
 * on his behalf is a different act, and the audit line already records who
 * pressed it. What would not be legitimate is pretending the two are the same,
 * so the control says "record" rather than dressing itself as field activity.
 *
 * **`SIGNED_OFF` is deliberately absent from this control.** It is the one
 * transition that is not a state change somebody may simply make: it is the
 * consequence of a customer signing. Offering it here is how two jobs in the
 * register ended up badged "Signed off" with no signature behind them. It lives
 * on the sign-off form below, which writes the record and moves the status
 * together.
 */

/** The API's own table, minus the edge that needs a signature. */
const NEXT: Record<string, readonly { to: string; label: string }[]> = {
  CREATED: [{ to: "CANCELLED", label: "Cancel" }],
  ASSIGNED: [
    { to: "EN_ROUTE", label: "On the way" },
    { to: "CUSTOMER_UNAVAILABLE", label: "Nobody there" },
    { to: "CANCELLED", label: "Cancel" },
  ],
  EN_ROUTE: [
    { to: "ON_SITE", label: "Arrived" },
    { to: "CUSTOMER_UNAVAILABLE", label: "Nobody there" },
  ],
  ON_SITE: [
    { to: "WORK_DONE", label: "Work finished" },
    { to: "PARTS_AWAITED", label: "Waiting on a part" },
    { to: "CUSTOMER_UNAVAILABLE", label: "Nobody there" },
  ],
  PARTS_AWAITED: [
    { to: "ON_SITE", label: "Part came, back on site" },
    { to: "ASSIGNED", label: "Send again" },
    { to: "CANCELLED", label: "Cancel" },
  ],
  CUSTOMER_UNAVAILABLE: [
    { to: "ASSIGNED", label: "Send again" },
    { to: "CANCELLED", label: "Cancel" },
  ],
  WORK_DONE: [],
  SIGNED_OFF: [],
  CANCELLED: [],
};

/** FR-1202 — the rating is chosen as a word. The number is the register's. */
const RATINGS = [
  { value: 5, label: "Very happy" },
  { value: 4, label: "Happy" },
  { value: 3, label: "Fine" },
  { value: 2, label: "Unhappy" },
  { value: 1, label: "Very unhappy" },
] as const;

export function JobProgress({
  jobId,
  status,
  siteContact,
  onMoved,
}: {
  jobId: string;
  status: string;
  /** Offered as the signer, because they are usually who signs. */
  siteContact: string | null;
  onMoved: () => void;
}) {
  const move = useMutation(transitionJob);
  const sign = useMutation(signOffJob);

  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState(siteContact ?? "");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const steps = NEXT[status] ?? [];
  const canSignOff = status === "WORK_DONE";

  if (steps.length === 0 && !canSignOff) return null;

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <p className="mb-2 text-xs text-muted-foreground">
        {canSignOff
          ? "The customer has to sign before this can be billed."
          : "Record what has happened on the ground"}
      </p>

      {move.error ? <ErrorState error={move.error} onRetry={move.reset} /> : null}
      {sign.error ? <ErrorState error={sign.error} onRetry={sign.reset} /> : null}

      {signing ? (
        <div className="max-w-md space-y-3">
          <Field
            label="Who signed"
            value={signerName}
            onChange={setSignerName}
            hint="The name of the person at site who confirmed the work"
          />

          <div>
            <p className="mb-1.5 text-sm font-medium">How did they find it?</p>
            <div className="flex flex-wrap gap-1.5">
              {RATINGS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={rating === option.value}
                  onClick={() => setRating(option.value)}
                  className={cn(
                    "min-h-9 rounded-full px-3 py-1.5 text-sm transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                    rating === option.value
                      ? "bg-primary font-medium text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {/* FR-1205: a 1 or 2 is an escalation, so the reader is told that
                before they pick it rather than surprised by it after. */}
            {rating <= 2 ? (
              <p className="mt-1.5 text-xs text-warning">
                This puts the job on the escalation band for somebody to ring back.
              </p>
            ) : null}
          </div>

          <Field
            label="Anything they said"
            optional
            value={comment}
            onChange={setComment}
            placeholder="Asked us to come earlier next time"
          />

          <p className="text-xs text-muted-foreground">
            {/* Honest about what this is. §6.9's on-device signature does not
                exist yet; recording this as one would be a claim nobody made. */}
            Recorded by the office from what was reported — not a signature
            captured on the technician&rsquo;s phone.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={sign.pending || signerName.trim().length < 2}
              onClick={async () => {
                const result = await sign.run(jobId, {
                  signerName: signerName.trim(),
                  rating,
                  comment: comment.trim() || undefined,
                  origin: "reported_by_office",
                });
                if (result?.ok) {
                  setSigning(false);
                  onMoved();
                }
              }}
            >
              Record the sign-off
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSigning(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <Button
              key={step.to}
              variant="outline"
              size="sm"
              disabled={move.pending}
              onClick={async () => {
                const result = await move.run(jobId, { to: step.to });
                if (result?.ok) onMoved();
              }}
            >
              {step.label}
            </Button>
          ))}
          {canSignOff ? (
            <Button size="sm" onClick={() => setSigning(true)}>
              Record the sign-off
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
