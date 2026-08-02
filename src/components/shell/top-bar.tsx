"use client";

import Link from "next/link";
import { CircleCheck, Eye, EyeOff, RefreshCw, TriangleAlert } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDateLong, formatTime } from "@/lib/datetime";
import { ROLE_LABELS, type Role } from "@/lib/roles";

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

function FreshnessIndicator({ freshness }: { freshness: Freshness }) {
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
          From {formatTime(freshness.at)}
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
        Updated {formatTime(freshness.at)}
      </span>
    </span>
  );
}

export function TopBar({
  role,
  userName,
  today,
  freshness,
  hideAmounts,
  onToggleAmounts,
}: {
  role: Role;
  userName: string;
  today: Date;
  freshness: Freshness;
  hideAmounts?: boolean;
  onToggleAmounts?: () => void;
}) {
  const initials =
    userName.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "OB";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 sm:block" />

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

        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

        <span className="flex items-center gap-2 pr-1">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-left leading-tight sm:grid">
            <span className="text-sm">{userName}</span>
            {/* The role reads as a word, so nobody has to infer it. */}
            <span className="text-xs text-muted-foreground">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </span>
      </div>
    </header>
  );
}
