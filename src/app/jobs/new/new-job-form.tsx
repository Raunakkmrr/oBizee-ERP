"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SEED_TENANT, SEED_USERS, CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * New job / work order — FR-106, FR-201, FR-203, FR-205, FR-207.
 *
 * **The one decision:** *who is going where, when, and is it urgent?*
 *
 * FR-203: scheduling is **a date and a slot, not a false-precision timestamp**.
 * The slots are the tenant's own (§11-Q15's assumed 9-1 / 1-5 / 5-8), rendered
 * as a chip row with `Exact time` revealing a picker *only when chosen* —
 * because "a single timestamp we cannot honour destroys trust faster than a wide
 * window".
 *
 * FR-205: a job carries **one primary technician and any number of helpers**.
 * Only the primary can transition state; helpers count at 0.5 weight in the
 * workload figures the dispatcher sees.
 *
 * FR-106: when reached from a won lead, customer, site, contact and service type
 * arrive pre-filled and the quoted amount becomes the job's estimated value —
 * nothing is retyped.
 */

const SLOTS = ["Morning 9–1", "Afternoon 1–5", "Evening 5–8", "Exact time"];
const PRIORITIES = [
  { key: "normal", label: "Normal" },
  { key: "urgent", label: "Urgent" },
  { key: "breakdown", label: "Breakdown" },
] as const;

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/**
 * FR-106's carry-across, as props rather than a hook: the page reads
 * `searchParams` on the server and hands the values down, which is what the
 * Next docs recommend over `useSearchParams` and avoids the prerender hazard.
 */
export type NewJobPrefill = {
  fromLead: string | null;
  customer: string | null;
  site: string | null;
  service: string | null;
};

export function NewJobForm({ prefill }: { prefill: NewJobPrefill }) {
  const { fromLead } = prefill;

  const [customer, setCustomer] = useState(
    prefill.customer ?? "Grand Plaza Hotel",
  );
  const [site, setSite] = useState(prefill.site ?? "Connaught Place");
  const [landmark, setLandmark] = useState("");
  const [service, setService] = useState(prefill.service ?? "AC servicing");
  const [slot, setSlot] = useState(SLOTS[0]);
  const [exactTime, setExactTime] = useState("11:30");
  const [priority, setPriority] = useState<string>("normal");
  const [technician, setTechnician] = useState("");
  const [helpers, setHelpers] = useState<string[]>([]);

  const technicians = SEED_USERS.filter(
    (u) => u.role === "technician" && u.active,
  );
  const today = new Date();

  function toggleHelper(id: string) {
    setHelpers((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id],
    );
  }

  return (
    <AppShell
      role={CURRENT_USER.role}
      userName={CURRENT_USER.name}
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href={fromLead ? "/leads" : "/today"} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          {fromLead ? "Back to leads" : "Back to today"}
        </Button>

        <PageHeader
          className="mb-4"
          title="New work order"
          description={
            fromLead
              ? `Converted from lead ${fromLead} — customer, site and service carried across.`
              : "Who is going where, when, and is it urgent."
          }
        />

        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label htmlFor="customer" className="mb-1.5 block text-sm font-medium">
                  Customer
                </label>
                <Input
                  id="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="site" className="mb-1.5 block text-sm font-medium">
                  Site / locality
                </label>
                <Input
                  id="site"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="landmark" className="mb-1.5 block text-sm font-medium">
                  Landmark
                </label>
                <Input
                  id="landmark"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Opposite the Gurudwara, blue gate"
                />
                {/* FR-201 / §6.5.1: its own field, because a landmark is how an
                    Indian address is actually resolved on the ground. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Its own field — this is how the technician actually finds the
                  place
                </p>
              </div>
              <div>
                <label htmlFor="service" className="mb-1.5 block text-sm font-medium">
                  Service type
                </label>
                <Input
                  id="service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">When &amp; who</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium">Slot</p>
                <div className="flex flex-wrap gap-1.5">
                  {SLOTS.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={slot === option}
                      onClick={() => setSlot(option)}
                    />
                  ))}
                </div>
                {/* Revealed only when chosen (FR-203). */}
                {slot === "Exact time" ? (
                  <Input
                    className="mt-2 max-w-[140px] tabular-nums"
                    type="time"
                    value={exactTime}
                    onChange={(e) => setExactTime(e.target.value)}
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    The customer is told a window, never a single time we cannot
                    honour
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIORITIES.map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      selected={priority === option.key}
                      onClick={() => setPriority(option.key)}
                    />
                  ))}
                </div>
                {priority !== "normal" ? (
                  // FR-207: priority drives promised_by, which drives the SLA
                  // chip every list renders as a word.
                  <p className="mt-1 text-xs text-brand-brown">
                    Sets an SLA — this job will show a due/late chip everywhere
                    it appears
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="tech" className="mb-1.5 block text-sm font-medium">
                  Primary technician
                </label>
                <select
                  id="tech"
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Leave unassigned — assign from the board</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {/* FR-205: only the primary can transition state. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Only the primary technician can record what happened at site
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Helpers</p>
                <div className="flex flex-wrap gap-1.5">
                  {technicians
                    .filter((t) => t.id !== technician)
                    .map((t) => (
                      <Chip
                        key={t.id}
                        label={t.name.split(" ")[0]}
                        selected={helpers.includes(t.id)}
                        onClick={() => toggleHelper(t.id)}
                      />
                    ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Helpers appear on the job sheet and count at half weight in
                  workload
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex max-w-4xl gap-2">
          <Button render={<Link href="/today" />} nativeButton={false}>
            Create work order
          </Button>
          <Button
            variant="outline"
            render={<Link href="/today" />}
            nativeButton={false}
          >
            Cancel
          </Button>
          <span className="ml-auto self-center text-xs text-muted-foreground tnum-id">
            Will be numbered J-{String(today.getFullYear()).slice(2)}
            {String(today.getMonth() + 1).padStart(2, "0")}-nnnn ·{" "}
            {SEED_TENANT.branches[0].name}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
