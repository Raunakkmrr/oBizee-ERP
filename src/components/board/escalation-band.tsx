"use client";

import { useEffect, useState } from "react";
import { MessageCircleWarning, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { telHref } from "@/lib/contact";
import {
  ESCALATION_SECONDS,
  ageWords,
  escalations,
  ratingWord,
  type LowRating,
} from "@/lib/data/feedback";

/**
 * Unhappy customers, and the clock — FR-1205.
 *
 * The requirement has two halves and the second is the one products get wrong:
 * a 1★ or 2★ **reaches a human inside sixty seconds**, and there is **no
 * automated apology**. Auto-replying to somebody who has just had a bad visit
 * makes the complaint worse and tells them nobody read it — so this produces a
 * row to act on and a phone number, never a message.
 *
 * The clock ticks in the UI because a promise nobody can see the state of is
 * not a promise. It is the one thing on this screen allowed to animate
 * indefinitely, for the same reason §6.13.8 permits the sync spinner: a static
 * number is indistinguishable from a stalled one.
 */
export function EscalationBand({
  ratings,
  onAcknowledge,
}: {
  ratings: readonly LowRating[];
  onAcknowledge: (jobNumber: string) => void;
}) {
  // Re-renders once a second so the countdown is live rather than fixed at the
  // moment the page happened to load.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = escalations(ratings, now);
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Unhappy customers"
      className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Somebody is unhappy
        </h2>
        <p className="text-xs text-muted-foreground">
          {rows.length} waiting · a person answers these, never an autoreply
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {rows.map(({ rating, age, breached }) => (
          <div
            key={rating.jobNumber}
            className={cn(
              // `min-w-0`: this row is a grid item, whose min-width is `auto`,
              // so without it the row holds its min-content width and pushes
              // itself off a narrow screen instead of wrapping.
              "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3",
              breached ? "bg-destructive-bg" : "bg-warning-bg",
            )}
          >
            <MessageCircleWarning
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                breached ? "text-destructive" : "text-warning",
              )}
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {/* Words, not stars alone — one shared vocabulary, so the job
                    sheet and this band cannot describe 2★ differently. */}
                {ratingWord(rating.rating)} · {rating.customer}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {rating.comment ?? "No comment left"} · {rating.jobNumber}
                {rating.technician ? ` · ${rating.technician}` : ""}
              </p>
            </div>

            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                breached ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {breached
                ? `${ageWords(age)} — past the ${ESCALATION_SECONDS}s promise`
                : `${ESCALATION_SECONDS - age}s left`}
            </span>

            <div className="flex shrink-0 gap-1.5">
              <Button
                size="sm"
                render={<a href={telHref("98110 34567") ?? undefined} />}
                nativeButton={false}
              >
                <Phone className="size-3.5" />
                Call them
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAcknowledge(rating.jobNumber)}
              >
                I am on it
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
