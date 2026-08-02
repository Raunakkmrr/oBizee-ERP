import { CalendarClock, CircleAlert, IndianRupee, Wrench } from "lucide-react";
import { KpiCard } from "@/components/shared/kpi-card";
import { MoneyText } from "@/components/shared/money-text";
import { toComputed, type HomeSnapshot } from "@/lib/data/home";

/**
 * Beat 1 — **state of the business right now**.
 *
 * The one decision: *is today normal?* Answered in four figures with no
 * interpretation required.
 *
 * Every tile is a **count plus its composition** — "18 jobs" alone sends the
 * owner to another screen to find out how many are done, which is the exact
 * failure this beat exists to prevent. The hint line carries the breakdown.
 *
 * `Collected` and `Overdue` are `Computed<Paise>`: when the ledger is down they
 * render an em-dash, never ₹0. §3.1 names a home-screen number disagreeing with
 * the accountant as an abandonment trigger, and a fabricated zero is the worst
 * version of that.
 */
function minutesAsWords(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function TodaySnapshot({
  today,
  hideAmounts,
}: {
  today: HomeSnapshot["today"];
  hideAmounts: boolean;
}) {
  return (
    <section aria-labelledby="today-heading">
      <h2 id="today-heading" className="sr-only">
        Today
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Jobs today"
          value={<span className="tabular-nums">{today.jobsToday}</span>}
          icon={CalendarClock}
          hint={
            <span className="tabular-nums">
              {today.done} done · {today.inProgress} in progress ·{" "}
              {today.notStarted} not started
            </span>
          }
        />

        <KpiCard
          label="Unassigned"
          value={<span className="tabular-nums">{today.unassigned}</span>}
          icon={Wrench}
          hint={
            today.oldestUnassignedMinutes === null ? (
              // Not "0m" — nothing waiting is a different fact from waiting zero
              // minutes, and saying so plainly saves a double-take.
              "nothing waiting"
            ) : (
              <span className="tabular-nums">
                oldest waiting {minutesAsWords(today.oldestUnassignedMinutes)}
              </span>
            )
          }
        />

        <KpiCard
          label="Collected today"
          value={
            <MoneyText
              amount={toComputed(today.collectedToday)}
              hidden={hideAmounts}
            />
          }
          icon={IndianRupee}
          hint={
            <span className="tabular-nums">
              {today.collectedCount} payments
            </span>
          }
        />

        <KpiCard
          label="Overdue"
          value={
            <MoneyText amount={toComputed(today.overdue)} hidden={hideAmounts} />
          }
          icon={CircleAlert}
          hint={
            <span className="tabular-nums">
              {today.overdueInvoices} invoices
              {today.overdueOldestDays !== null
                ? ` · oldest ${today.overdueOldestDays} days`
                : ""}
            </span>
          }
        />
      </div>
    </section>
  );
}
