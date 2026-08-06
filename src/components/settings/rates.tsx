"use client";

import { useState } from "react";
import { ChevronDown, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SEED_RATES,
  currentRates,
  effectiveWords,
  historyOf,
} from "@/lib/data/rates";

/**
 * The rate master — FR-804.
 *
 * **There is no edit control on this screen, and that is the feature.** A rate
 * is a fact about a period, not a setting: an invoice raised last September was
 * correct at 28% and must stay correct at 28%. Editing would silently re-price
 * history — reprints would disagree with what the customer paid, and the GSTR-1
 * working paper would stop reconciling — so a change adds a row and the old one
 * stays answerable for its own dates.
 *
 * Each code opens to show its versions, because "what was the rate in September"
 * is the question an assessment actually asks, and a master that only shows
 * today cannot answer it.
 */
export function Rates() {
  const today = new Date();
  const current = currentRates(SEED_RATES, today);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Percent className="size-4 text-primary-text" />
        Tax rates
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What applies today, and what applied before. Rates are never edited — a
        change adds a dated row, so an old invoice keeps its own rate.
      </p>

      <div className="mt-4 grid gap-1.5">
        {current.map((row) => {
          const history = historyOf(SEED_RATES, row.code);
          const expanded = open === row.code;

          return (
            <div key={row.code} className="min-w-0 rounded-xl bg-muted-bg">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : row.code)}
                className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                <span className="shrink-0 rounded-md bg-card px-2 py-0.5 text-xs font-medium tnum-id">
                  {row.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {row.description}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {row.ratePercent}%
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  since {effectiveWords(row.effectiveFrom)}
                </span>
                {history.length > 1 ? (
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                ) : (
                  // Keeps the row's columns aligned with those that do open.
                  <span aria-hidden="true" className="size-4 shrink-0" />
                )}
              </button>

              {expanded ? (
                <ol className="border-t border-border/60 px-3 pb-3">
                  {history.map((version, index) => (
                    <li
                      key={version.id}
                      className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 pt-2.5 text-xs"
                    >
                      <span className="w-14 shrink-0 font-medium tabular-nums">
                        {version.ratePercent}%
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        from {effectiveWords(version.effectiveFrom)}
                        {index === 0 ? " · in force" : ""}
                      </span>
                      {/* Why, in the words of whoever recorded it — "who decided
                          18%" is the question asked in an assessment. */}
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {version.note}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
