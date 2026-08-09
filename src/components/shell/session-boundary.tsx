"use client";

import { useEffect } from "react";

import { loadCaller } from "@/lib/api/session";

/**
 * Ask the register who is signed in, once, above everything.
 *
 * **The bug this fixes.** `loadCaller` used to run inside `AppShell`, and
 * `Requires` renders `null` until the caller is known — so a route the role
 * cannot open never mounted the shell, never loaded the caller, and sat
 * blank for ever. It only looked fine because navigating *within* the app
 * left the identity already in memory; a bookmark, a typed URL or a refresh
 * on a gated route showed nothing at all, with no error and no way forward.
 *
 * Loading it here means the answer arrives regardless of what renders below,
 * which is the only place that is true.
 */
export function SessionBoundary({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void loadCaller();
  }, []);

  return <>{children}</>;
}
