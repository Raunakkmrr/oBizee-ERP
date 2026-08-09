"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, useSessionResolved } from "@/lib/data/use-store";
import { loadCaller } from "@/lib/api/session";
import { AppSidebar, type BadgeCounts } from "./app-sidebar";
import { TopBar, type Freshness } from "./top-bar";

/**
 * The operator chrome — the same composition the oBizee dashboard uses:
 * `SidebarProvider` → `AppSidebar` + `SidebarInset` containing a sticky
 * `TopBar` and the page.
 *
 * Using the provider rather than hand-rolled offsets is what makes the three
 * navigation tiers in PRD §6.2 fall out for free: the labelled rail, the
 * icon-collapsed rail, and the sheet on small viewports all come from
 * `collapsible="icon"`, and the inset handles its own spacing — so the shell
 * cannot drift away from the rest of oBizee as either product changes.
 *
 * **Not used by the technician app.** §6.13.1's two-brand rule gives that
 * surface the *tenant's* branding rather than oBizee's, and it is a separate
 * React Native codebase under DR-4 in any case.
 */
export function AppShell({
  today,
  freshness,
  badges,
  hideAmounts,
  onToggleAmounts,
  children,
}: {
  today: Date;
  freshness: Freshness;
  badges?: BadgeCounts;
  hideAmounts?: boolean;
  onToggleAmounts?: () => void;
  children: ReactNode;
}) {
  /**
   * Every screen opens the vault on mount, including create forms that only
   * write. Leaving hydration to `useStoreState` meant a form that used
   * `useDispatch` alone ran against the seed, and the next screen's hydration
   * silently overwrote the write — a created work order disappeared between the
   * form and the board.
   */
  /*
    The signed-in user is resolved here rather than passed in.

    Every screen used to hand down `role` and `userName` read from a hardcoded
    const, so changing user would have meant editing twenty call sites and
    would silently miss one. The shell owns the session; a page cannot
    contradict it.

    It now comes from the token via `/api/me`, not from a switcher in the
    browser. The shell is also where "nobody is signed in" is answered, because
    it wraps every screen: a page rendered without a user is a page that has
    already leaked whatever it was about to check.
  */
  const me = useCurrentUser();
  const resolved = useSessionResolved();
  const router = useRouter();

  useEffect(() => {
    void loadCaller();
  }, []);

  useEffect(() => {
    if (resolved && !me) {
      router.replace("/sign-in");
      return;
    }
    /*
      A password an owner chose is a shared secret, and the register refuses
      every other request until it is replaced. Sending them there is the only
      way a screen can do anything useful — every link in this shell would
      answer 403.
    */
    if (me?.mustChangePassword) router.replace("/change-password");
  }, [resolved, me, router]);

  // "Not yet" is not "nobody": one waits, the other is already on its way out.
  if (!me || me.mustChangePassword) return null;

  return (
    <SidebarProvider>
      <AppSidebar role={me.role} badges={badges} userName={me.name} />
      <SidebarInset>
        <TopBar
          today={today}
          freshness={freshness}
          hideAmounts={hideAmounts}
          onToggleAmounts={onToggleAmounts}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
