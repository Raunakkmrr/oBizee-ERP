"use client";

import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Panel — a card that admits it has a head and a body.
 *
 * The screens this replaces were cards containing undifferentiated rows: real
 * data, no structure, and the result read as a wireframe with content pasted in.
 * The fix is not more whitespace — it is **giving the container a masthead**, so
 * the eye lands on what the panel is before it starts reading rows.
 *
 * Three devices, taken from the reference ERP and re-tinted to oBizee's palette:
 *
 * - **A tinted head band** (`bg-muted/60` + `border-b`) so head and body are
 *   different surfaces rather than the same surface with bolder text.
 * - **A brand icon chip** — `bg-primary/10 text-primary`, the dashboard's single
 *   highest-yield colour device, used 24 times there and nowhere here until now.
 * - **An action slot in the head**, so a panel's own action sits with the panel
 *   instead of floating above the page.
 *
 * `flush` drops body padding for `divide-y` row lists, which is how every dense
 * screen in the dashboard is actually built (there is no `<table>` in it at all).
 *
 * **`tone="support"` is the product's secondary surface.** `--secondary`
 * (`#f3e9e0`, warm sand) existed in the token file and was painted nowhere, so
 * every panel on every screen was the same white rectangle and the layout
 * carried no hierarchy of its own — the reader had to get it from the headings.
 * Supporting panels — the technician rail, compliance, evidence, local data —
 * now sit on sand, so a screen reads as *primary work plus context* before a
 * single word is read. Primary content stays white; if everything is tinted,
 * nothing is.
 */
export function Panel({
  title,
  icon: Icon,
  count,
  caption,
  actions,
  flush = false,
  tone = "default",
  className,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  /** Rendered beside the title as a quiet pill — never as part of the title. */
  count?: number;
  caption?: string;
  actions?: React.ReactNode;
  flush?: boolean;
  /** `support` paints the panel on the secondary sand ground. */
  tone?: "default" | "support";
  className?: string;
  children: React.ReactNode;
}) {
  const support = tone === "support";
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0",
        // Elevation carries the hierarchy that colour alone could not: primary
        // work lifts off the ground, context stays flat against it. Every
        // surface having the same 1px hairline is why the product read as a
        // blueprint — nothing sat above anything.
        support ? "bg-secondary/40" : "shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 border-b px-4 py-2.5",
          support ? "bg-secondary/70" : "bg-muted/60",
        )}
      >
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {count !== undefined ? (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {count}
              </span>
            ) : null}
          </div>
          {caption ? (
            <p className="truncate text-xs text-muted-foreground">{caption}</p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        ) : null}
      </div>

      <div className={flush ? undefined : "p-4"}>{children}</div>
    </Card>
  );
}

/**
 * The column header band for a dense list.
 *
 * A row list with no header is a stripe pattern; the reader has to infer what
 * each column means from the values. This is one line of chrome that turns the
 * same rows into a table.
 */
export function ColumnHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A group heading inside a list — the reference's `Order: SO-102` band.
 *
 * Grouping is what stops a long list reading as one undifferentiated run, and
 * the count belongs here rather than in a legend somewhere else.
 */
export function GroupHeader({
  label,
  count,
  right,
}: {
  label: string;
  count?: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b bg-secondary/50 px-4 py-1.5">
      <span className="text-xs font-semibold text-secondary-foreground">
        {label}
      </span>
      {count !== undefined ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          ({count})
        </span>
      ) : null}
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  );
}

/**
 * A value pill — a number that *matters*, in a tinted chip.
 *
 * The reference does this and it is the cheapest legibility win available: on a
 * screen where every figure is the same weight, nothing is emphasised, so the
 * reader has to compute significance themselves. The tone carries meaning and is
 * always paired with a word or an adjacent label, never colour alone (§6.13.4).
 */
export function ValuePill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "good" | "warn" | "bad";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    brand: "bg-primary/12 text-primary",
    good: "bg-success/12 text-success",
    warn: "bg-warning/15 text-brand-brown",
    bad: "bg-destructive/12 text-destructive",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A thin paired-number bar: `1,200 / 1,120`.
 *
 * Two numbers and a rule beat a percentage, because the reader can see both the
 * position and the headroom. Over-capacity is a different colour *and* the bar
 * clamps, so it cannot silently render wider than its track.
 */
export function CapacityBar({
  value,
  of,
  label,
  format = (n: number) => n.toLocaleString("en-IN"),
}: {
  value: number;
  of: number;
  label: string;
  format?: (n: number) => string;
}) {
  const pct = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  const over = value > of;
  return (
    <div className="min-w-[120px]">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">
        {format(value)}{" "}
        <span className="font-normal text-muted-foreground">
          / {format(of)}
        </span>
      </p>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The sticky commitment bar.
 *
 * The reference pins a summary plus the primary action to the bottom of the
 * work area, and it is the device my screens most obviously lacked: an action
 * floating in a header tells you nothing about **what you are about to commit
 * to**. Here the totals and the button occupy the same object.
 */
export function ActionBar({
  children,
  primary,
}: {
  children: React.ReactNode;
  primary: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-[var(--z-sticky)] -mx-4 mt-4 border-t bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {children}
        <div className="ml-auto flex shrink-0 items-center gap-2">{primary}</div>
      </div>
    </div>
  );
}
