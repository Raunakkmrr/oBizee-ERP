"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { DayMasthead } from "@/components/home/day-masthead";
import { TodaySnapshot } from "@/components/home/today-snapshot";
import { NeedsYourCall } from "@/components/home/needs-your-call";
import { AgainstLastWeek } from "@/components/home/against-last-week";
import { ComingUp } from "@/components/home/coming-up";
import { useRouter } from "next/navigation";
import { getHomeSnapshot, type HomeSnapshot } from "@/lib/data/home";
import { homeHrefFor } from "@/lib/navigation";
import { can } from "@/lib/roles";
import { useCurrentUser } from "@/lib/data/use-store";
import { loading, type Query } from "@/lib/data/result";
import { CURRENT_USER, SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { formatDateLong, greetingFor } from "@/lib/datetime";

/**
 * The primary post-login screen — Phase 1.
 *
 * Carries `futuristic-product-build`'s four mandatory beats in sequence:
 * situation → what needs me → is that good or bad → what's coming.
 *
 * | Beat | Section |
 * |---|---|
 * | State of the business now | `TodaySnapshot` |
 * | What needs me | `NeedsYourCall` |
 * | Trend and comparison | `AgainstLastWeek` |
 * | Where this is heading | `ComingUp` |
 *
 * **Layout reasoning.** `Needs your call` sits in the wider column at
 * `xl`, beside the two analytical sections, because it is the only block that
 * produces an *action*. §6.13.7's density thinking applies: the owner's eye goes
 * left-to-right, top-to-bottom, and the thing he must do belongs where he looks
 * first after the numbers.
 *
 * **All data flows through `QueryBoundary`**, so all four §6.3 states are
 * handled by construction rather than by remembering to. The fixture ships a
 * deliberate partial failure (the ledger), so the degraded path is visible on
 * every load instead of being discovered in production.
 */
export default function HomePage() {
  const [query, setQuery] = useState<Query<HomeSnapshot>>(loading());
  const [hideAmounts, setHideAmounts] = useState(false);
  const me = useCurrentUser();
  const router = useRouter();

  /*
    §6.2's snapshot is a coordinator's and an owner's screen — it needs
    `job:read`, which a technician (`job:read_own`) and a CA do not have. They
    were shown a permission refusal on the product's own root instead of the
    screen their day starts on.

    Redirect rather than render the refusal: `/` is not a destination anybody
    chose, it is where a logo or a bookmark lands you, and the honest answer to
    "take me home" is that role's actual home.
  */
  // Until the token has answered, treat this as the least-privileged case:
  // the redirect below is harmless and the snapshot is not shown to nobody.
  const home = me ? homeHrefFor(me.role) : "/today";
  // Gate on the permission the screen actually needs, not on where the role's
  // nav points: `/` is in nobody's navigation, so comparing hrefs would send
  // every role away and quietly delete §6.2 from the product.
  const canSeeSnapshot = me
    ? can(me.role, "job:read", undefined, me.level ?? undefined)
    : false;

  useEffect(() => {
    if (!canSeeSnapshot) {
      router.replace(home);
      return;
    }
    let cancelled = false;
    getHomeSnapshot().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, [canSeeSnapshot, home, router]);

  const today = new Date();

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
      badges={{ unassigned_today: 3, leads_overdue: 7 }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      <div className="p-4 md:p-6">
        <QueryBoundary query={query} label="today's summary" loadingRows={4}>
          {(data) => (
            <div className="space-y-4">
              {/*
                Identity first (GATE V2's second brand), then the four figures.
                The masthead carries the day's *shape* — a channel the tiles do
                not have — and never restates their numbers.
              */}
              <DayMasthead
                businessName={SEED_TENANT.businessName}
                greeting={`${greetingFor(today)}, ${CURRENT_USER.name.split(" ")[0]}`}
                dateWord={formatDateLong(today)}
                today={data.today}
              />

              <TodaySnapshot today={data.today} hideAmounts={hideAmounts} />

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <NeedsYourCall
                    attention={data.attention}
                    comingUp={data.comingUp}
                  />
                </div>
                <div className="space-y-4">
                  <AgainstLastWeek comparisons={data.comparisons} />
                </div>
              </div>

              <ComingUp comingUp={data.comingUp} hideAmounts={hideAmounts} />
            </div>
          )}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
