"use client";

import { useSyncExternalStore } from "react";

import Link from "next/link";
import { useTheme } from "next-themes";
import { Check, ChevronDown, CircleCheck, Eye, EyeOff, Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentUser, useDispatch, useStoreState } from "@/lib/data/use-store";
import type { Person } from "@/lib/data/people";
import { formatDateLong, formatTime } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * The top bar — mirrors `obizee-dashboard/src/components/shell/top-bar.tsx`:
 * `sticky top-0 z-30 h-14`, hairline bottom border, translucent background with
 * `backdrop-blur`, the sidebar trigger at the left, ghost icon buttons and an
 * avatar at the right.
 *
 * Two things carried over deliberately from the dashboard:
 *
 * - **The hide-amounts eye toggle.** In the dashboard it is a privacy control
 *   for an owner working in public. Here it does double duty: it is the visible
 *   surface of FR-1302's technician price visibility, and reusing the affordance
 *   means an owner who already knows the dashboard knows this immediately.
 * - **`h-14`** — 56px, which is also the height PRD §6.13.1 requires of the
 *   operator top bar. The two agreed already.
 *
 * Absent for now, and not stubbed: global search and the branch switcher. Both
 * need a real destination; under DR-9 there is none, and a control that goes
 * nowhere is a dead link the navigation audit fails on.
 */

export type Freshness =
  | { kind: "fresh"; at: Date }
  | { kind: "stale"; at: Date }
  | { kind: "syncing" };

/**
 * A clock must not be server-rendered.
 *
 * "Updated 1:38 pm" was rendered on the server and again on the client; when the
 * minute ticked between the two, React reported a hydration mismatch and
 * regenerated the tree. Freshness is inherently *client* state — it answers
 * "when did **your** copy last update" — so the time is withheld until after
 * mount rather than being papered over with `suppressHydrationWarning`, which
 * would hide the next real mismatch too.
 */
const noopSubscribe = () => () => {};

function useMounted(): boolean {
  // `useSyncExternalStore` with differing client/server snapshots is the
  // sanctioned hydration probe — no effect, no cascading render, and React
  // itself guarantees the server value is used for the hydrating pass.
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function FreshnessIndicator({ freshness }: { freshness: Freshness }) {
  const mounted = useMounted();
  if (freshness.kind === "syncing") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-sm text-info"
      >
        {/*
          §6.13.8: the sync indicator is the one animation that is *required*,
          and the only element permitted to animate indefinitely — "a static
          'Syncing…' label is indistinguishable from a hung process".
        */}
        <RefreshCw
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        <span className="hidden sm:inline">Syncing…</span>
      </span>
    );
  }

  if (freshness.kind === "stale") {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 text-sm text-brand-brown"
      >
        {/* Word + shape + colour — never colour alone (§6.13.4). */}
        <TriangleAlert aria-hidden="true" className="size-4" />
        <span className="hidden tnum sm:inline">
          {mounted ? `From ${formatTime(freshness.at)}` : "From earlier"}
        </span>
      </span>
    );
  }

  return (
    <span
      role="status"
      className="flex items-center gap-1.5 text-sm text-success"
    >
      <CircleCheck aria-hidden="true" className="size-4" />
      <span className="hidden tnum sm:inline">
        {mounted ? `Updated ${formatTime(freshness.at)}` : "Updated"}
      </span>
    </span>
  );
}

/**
 * The light/dark switch.
 *
 * Light is the product's default because the audience works a full day in a
 * daylight office; dark exists for evening shifts and for anyone who simply
 * reads better on it. Both are first-class — the rail is dark either way — so
 * this is one button, not a three-way menu nobody uses.
 *
 * The icon must not render until mount. `resolvedTheme` is unknowable on the
 * server, and rendering a guess produces a sun that flips to a moon on
 * hydration; a fixed-size placeholder keeps the bar from reflowing instead.
 */
function ThemeToggle() {
  const mounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();
  // Gated on `mounted`, not just the icon. `resolvedTheme` is undefined on the
  // server, so reading it directly made the *label* disagree across hydration
  // — React reported a mismatch and, being an attribute, refused to patch it,
  // leaving a button that announced the wrong action to a screen reader.
  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {!mounted ? (
        // A fixed-size placeholder, so the bar does not reflow on mount.
        <span className="size-4" />
      ) : dark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

/**
 * Who you are acting as.
 *
 * **Why this exists at all.** §6.2 role-gates the navigation, and the acting
 * user was a hardcoded const — a coordinator, who by design has no Settings
 * item. So People management shipped genuinely unreachable: the screen existed,
 * the routes existed, and no sequence of clicks led to them.
 *
 * It is labelled as standing in for sign-in rather than dressed up as a profile
 * menu, because that is what it is until auth lands (DR-9). Switching is what
 * makes the role model visible instead of something you have to read the code
 * to believe.
 */
function ActingAs({ me }: { me: Person }) {
  const dispatch = useDispatch();
  const people = useStoreState().people.filter((person) => person.active);
  const initials =
    me.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "OB";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            aria-label={`Signed in as ${me.name}, ${ROLE_LABELS[me.role]}. Change user.`}
          />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary ring-1 ring-primary/25">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-left leading-tight sm:grid">
          <span className="text-sm">{me.name}</span>
          {/* The role reads as a word, so nobody has to infer it. */}
          <span className="text-xs text-muted-foreground">
            {ROLE_LABELS[me.role]}
          </span>
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Standing in for sign-in until accounts exist
        </p>
        {people.map((person) => (
          <DropdownMenuItem
            key={person.id}
            onClick={() => dispatch({ type: "ACT_AS", personId: person.id })}
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="truncate">{person.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {ROLE_LABELS[person.role]}
              </span>
            </span>
            {person.id === me.id ? (
              <Check className="ml-1.5 size-3.5 shrink-0" aria-hidden="true" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({
  today,
  freshness,
  hideAmounts,
  onToggleAmounts,
}: {
  today: Date;
  freshness: Freshness;
  hideAmounts?: boolean;
  onToggleAmounts?: () => void;
}) {
  const me = useCurrentUser();

  return (
    /*
      No bottom border, no vertical separators, no opaque bar.

      The old header was a light slab ruled off from the content below it, and
      it was named the single worst element on the screen. A rule across the
      top of a page announces chrome; what it should do is get out of the way.
      What replaces it is a translucent wash of the page ground with a blur —
      content dims as it passes under rather than colliding with an edge — and
      spacing alone to group the controls.
    */
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-background/70 px-3 backdrop-blur-xl md:px-5">
      <SidebarTrigger className="-ml-1" />

      {/*
        The lockup, for viewports where the sidebar is collapsed into a sheet.

        §6.13.1 requires the brand name AND logo to be "always visible" in
        operator chrome and "present on every screen" — and below 1024px the
        sidebar (which normally carries the lockup) is hidden behind a trigger,
        so the brand disappeared entirely. Caught only by looking at 390px.

        §6.13.1's own mobile rule: the mark shrinks to 20px but "the wordmark is
        never dropped".
      */}
      <Link href="/" className="flex items-center gap-1.5 lg:hidden">
        <span className="grid size-5 shrink-0 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          oB
        </span>
        <span className="text-sm font-semibold tracking-tight">oBizee</span>
      </Link>

      <span className="hidden text-sm text-muted-foreground tnum md:inline">
        {formatDateLong(today)}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <FreshnessIndicator freshness={freshness} />

        {onToggleAmounts ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
            onClick={onToggleAmounts}
          >
            {hideAmounts ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        ) : null}

        <ThemeToggle />

        <ActingAs me={me} />
      </div>
    </header>
  );
}
