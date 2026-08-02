"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The Loading state — PRD §6.3.
 *
 * "Content areas show **skeletons for a maximum of 600 ms**; beyond that they
 * are replaced by a labelled progress line ('Loading today's jobs…') because an
 * indefinite shimmer on a slow connection reads as a broken page."
 *
 * That 600ms ceiling is the whole point of this component and is why it is a
 * client component: on Priya's 4 Mbps connection a skeleton that shimmers for
 * eight seconds is indistinguishable from a hung screen, and she is on a call.
 * The label also tells her *what* is loading, which a shimmer cannot.
 *
 * §6.13.8 permits skeleton shimmer for ≤600 ms and forbids it beyond that, so
 * the timing here is a design token decision, not a preference.
 */

const SKELETON_CEILING_MS = 600;

export type LoadingStateProps = {
  /**
   * What is loading, in the user's words, used as "Loading {label}…".
   * Required — an unlabelled progress line is the thing this component exists
   * to prevent.
   */
  label: string;
  /** How many skeleton rows to show. Match the real row count where known. */
  rows?: number;
  /** Row height token, so the skeleton occupies the real density (§6.13.7). */
  rowHeight?: "today" | "leads" | "money" | "timeline";
};

const ROW_HEIGHT_CLASS: Record<
  NonNullable<LoadingStateProps["rowHeight"]>,
  string
> = {
  today: "h-[var(--row-today)]",
  leads: "h-[var(--row-leads)]",
  money: "h-[var(--row-money)]",
  timeline: "h-[var(--row-timeline)]",
};

export function LoadingState({
  label,
  rows = 6,
  rowHeight = "today",
}: LoadingStateProps) {
  const [pastCeiling, setPastCeiling] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPastCeiling(true), SKELETON_CEILING_MS);
    return () => clearTimeout(timer);
  }, []);

  if (pastCeiling) {
    return (
      // aria-live so a screen reader announces the change from skeleton to
      // labelled progress; polite because it must not interrupt.
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground"
      >
        {/*
          The one indefinite animation permitted anywhere near loading. §6.13.8
          allows the sync indicator to animate indefinitely because "a static
          'Syncing…' label is indistinguishable from a hung process" — the same
          logic applies to a progress line that has outlived its skeleton.
        */}
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
        />
        <span>Loading {label}…</span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="space-y-2 p-4">
      <span className="sr-only">Loading {label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className={`w-full ${ROW_HEIGHT_CLASS[rowHeight]}`}
        />
      ))}
    </div>
  );
}
