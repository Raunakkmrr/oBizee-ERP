"use client";

import { Lock, TriangleAlert, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/roles";
import { formatTime } from "@/lib/datetime";
import type { AppError } from "@/lib/data/result";

/**
 * The Error state — PRD §6.3, in oBizee's palette.
 *
 * §6.3 distinguishes three kinds "because the user's next action differs".
 * Collapsing them into one "Something went wrong" is the failure this splits
 * apart:
 *
 * - **Connectivity** → a banner over retained content. **Never blanks the
 *   screen.** The board the coordinator was reading is still true, and she is
 *   on a call.
 * - **Permission** → names *who can act*. "Naming the person who can act is the
 *   difference between a dead end and a next step."
 * - **Validation / server** → names the field or record, states the problem
 *   plainly, offers the fix. The code appears only in copyable small print —
 *   §6.3: codes appear "never as the message".
 *
 * §6.13.4's channel rule is load-bearing here and is **not** relaxed by DR-13 —
 * it matters more now, not less. Since the palette no longer clears the contrast
 * floor, every one of these carries a **word** and a **shape** (icon + left
 * border) alongside colour, so meaning survives a washed-out screen, greyscale,
 * and the roughly 1 in 12 Indian men with a colour vision deficiency.
 */

/**
 * Connectivity. Sits above retained content; the caller keeps rendering the
 * stale data underneath. Deliberately not a full-screen state.
 */
export function ConnectivityBanner({
  lastKnownAsOf,
  onRetry,
}: {
  lastKnownAsOf: Date | null;
  onRetry?: () => void;
}) {
  return (
    <Alert
      role="status"
      aria-live="polite"
      className="border-l-4 border-l-warning bg-warning-bg text-brand-brown"
    >
      <WifiOff aria-hidden="true" className="size-4" />
      <AlertTitle>
        {lastKnownAsOf
          ? `Showing data from ${formatTime(lastKnownAsOf)}. Reconnecting…`
          : "Not connected. Reconnecting…"}
      </AlertTitle>
      {onRetry ? (
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Retry now
          </Button>
        </AlertDescription>
      ) : null}
    </Alert>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: AppError;
  onRetry?: () => void;
}) {
  if (error.kind === "connectivity") {
    // Defensive: a caller routing a connectivity error here has skipped
    // `mayBlankScreen`. Degrade to the banner rather than blanking, because
    // blanking is the one thing §6.3 forbids outright.
    return (
      <ConnectivityBanner
        lastKnownAsOf={error.lastKnownAsOf}
        onRetry={onRetry}
      />
    );
  }

  if (error.kind === "permission") {
    const who = error.rolesWhoCan.map((role) => ROLE_LABELS[role]);
    const whoText =
      who.length === 1
        ? who[0]
        : `${who.slice(0, -1).join(", ")} or ${who[who.length - 1]}`;

    return (
      <Alert
        role="alert"
        className="border-l-4 border-l-muted-foreground bg-muted text-foreground"
      >
        <Lock aria-hidden="true" className="size-4" />
        <AlertTitle>Only the {whoText} can do this.</AlertTitle>
        <AlertDescription>
          {error.suggestedApprover
            ? `Ask ${error.suggestedApprover} to approve.`
            : "Ask someone with that role to approve."}
        </AlertDescription>
      </Alert>
    );
  }

  const fix = error.kind === "validation" ? error.fix : null;
  const subject = error.kind === "validation" ? error.subject : null;

  return (
    <Alert
      role="alert"
      className="border-l-4 border-l-destructive bg-destructive-bg text-destructive"
    >
      <TriangleAlert aria-hidden="true" className="size-4" />
      <AlertTitle>
        {subject ? `${subject}: ${error.message}` : error.message}
      </AlertTitle>
      <AlertDescription className="text-destructive/90">
        {fix ? <p>{fix}</p> : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            Try again
          </Button>
        ) : null}
        {/*
          §6.3: the code lives in copyable small print for support, never in the
          message. `select-all` so a coordinator on a call grabs it in one
          gesture instead of dragging across it.
        */}
        <p className="mt-2 select-all text-xs tnum-id opacity-80">
          Code: {error.code}
        </p>
      </AlertDescription>
    </Alert>
  );
}
