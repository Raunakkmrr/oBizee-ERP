"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three controls that were copy-pasted across the product, and the row and
 * callout treatments that went with them.
 *
 * **Why they are here rather than inlined.** The same selectable chip existed in
 * six files with six slightly different class strings; the same tab strip
 * existed in three. That is why the styling drifted, and why "remove the
 * separators" had to be done forty-one times instead of once. A change to the
 * treatment is now a change to this file.
 *
 * The rules every one of them obeys:
 *
 * - **Nothing is drawn.** No hairline borders, no rules between rows, no
 *   underline tab strips. Separation is a surface — a tint, a shadow, or a
 *   lightness step — because a drawn 1px line is what read as flat.
 * - **Selection is a filled surface, not an outline.** An outlined "selected"
 *   chip and an outlined "unselected" chip differ by a colour most people
 *   cannot see at a glance; a filled one differs by area.
 * - **Both themes from one class list.** `--shadow-card` is a soft drop on
 *   light and a hairline-plus-bloom on dark, so nothing branches on theme.
 */

/** Shared focus treatment. Keyboard users get the same ring everywhere. */
const FOCUS =
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none";

/**
 * A selectable chip — filters, slots, priorities, helpers.
 *
 * 44px minimum height is not decoration: §6.13.9 sets the touch floor, and a
 * coordinator on a tablet taps these constantly.
 */
export function Chip({
  label,
  selected,
  onClick,
  className,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
        FOCUS,
        selected
          ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {label}
    </button>
  );
}

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Rendered as a count bubble beside the label. */
  count?: number;
};

/**
 * The pill tab bar.
 *
 * This is the Settings tab strip, extracted — it is the one navigation
 * treatment that survived review, so every view switcher in the product now
 * uses it instead of the underlined strip it replaces. An underline tab is two
 * drawn lines (the strip's own rule, plus the active marker) doing what one
 * filled pill does.
 *
 * §6.6.1 still holds: every tab is visible at once, never collapsed into a
 * dropdown of views.
 */
export function TabBar<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-2xl bg-card p-1.5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {items.map((item) => {
        const on = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-all duration-200",
              FOCUS,
              on
                ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-raised)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  on ? "bg-black/15" : "bg-muted-bg",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row in a dense list.
 *
 * Rows used to be separated by `border-b`. They are now separated by a 2%
 * surface lift on alternating rows — the reader still parses the boundary, but
 * nothing is drawn, which is the whole point. Hover is a stronger tint so the
 * row under the cursor is unambiguous when a list runs past twenty entries.
 *
 * Exported as a string rather than a component because these rows are `div`,
 * `tr`, `li` and `Link` across the product, and wrapping each in an element
 * would change the layout.
 */
export const ROW =
  "transition-colors odd:bg-muted-bg hover:bg-accent";

/** The same treatment for a `<tr>`, where `odd:` counts header rows. */
export const ROW_TR =
  "transition-colors even:bg-muted-bg hover:bg-accent";

/**
 * A tinted callout — the "this is what will happen" boxes beside form fields.
 *
 * Each used to be a tint *and* a matching 25%-opacity border. The border added
 * nothing: a tinted block already has an edge, which is where the tint stops.
 */
export function Callout({
  tone = "primary",
  className,
  children,
}: {
  tone?: "primary" | "warning" | "destructive" | "muted";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl p-3 text-sm",
        tone === "primary" && "bg-primary-bg text-foreground",
        tone === "warning" && "bg-warning-bg text-foreground",
        tone === "destructive" && "bg-destructive-bg text-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
