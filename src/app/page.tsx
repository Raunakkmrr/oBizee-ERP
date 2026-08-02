"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { TodaySnapshot } from "@/components/home/today-snapshot";
import { NeedsYourCall } from "@/components/home/needs-your-call";
import { AgainstLastWeek } from "@/components/home/against-last-week";
import { ComingUp } from "@/components/home/coming-up";
import { getHomeSnapshot, type HomeSnapshot } from "@/lib/data/home";
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

  useEffect(() => {
    let cancelled = false;
    getHomeSnapshot().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
      badges={{ unassigned_today: 3, leads_overdue: 7 }}
      hideAmounts={hideAmounts}
      onToggleAmounts={() => setHideAmounts((v) => !v)}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          title={`${greetingFor(today)}, ${CURRENT_USER.name.split(" ")[0]}`}
          description={`${SEED_TENANT.businessName} · ${formatDateLong(today)}`}
        />

        <QueryBoundary query={query} label="today's summary" loadingRows={4}>
          {(data) => (
            <div className="space-y-4">
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
