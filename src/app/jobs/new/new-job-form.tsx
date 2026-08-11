"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, WhyDisabled } from "@/components/shared/field";
import { requiredName, validate } from "@/lib/validate";
import { z } from "zod";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { getCustomers, type Customer } from "@/lib/data/customers";
import { getBoard } from "@/lib/data/board";
import { createJob } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";
import { cn } from "@/lib/utils";
import { DEFAULT_SERVICE, SERVICES } from "@/lib/data/services";
import { todayInIndia } from "@/lib/data/attention";

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

/**
 * The chip label the coordinator picks, and the token the board renders.
 *
 * They are not the same string. The board's slot column is a narrow chip that
 * shows `9-1`; storing the picker's own "Morning 9–1" put a two-line label in a
 * one-line column and the first row grew taller than every other. The label is
 * for choosing, the token is for the row.
 */
const SLOTS = [
  { label: "Morning 9–1", token: "9-1" },
  { label: "Afternoon 1–5", token: "1-5" },
  { label: "Evening 5–8", token: "5-8" },
  { label: "Exact time", token: null },
] as const;
const PRIORITIES = [
  { key: "normal", label: "Normal" },
  { key: "urgent", label: "Urgent" },
  { key: "breakdown", label: "Breakdown" },
] as const;

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

/**
 * What a work order needs before it can be raised.
 *
 * The old guard was `disabled={customer.trim() === "" || site.trim() === ""}`
 * — two fields, no message, and nothing at all on the service type, which is
 * what decides who can be sent. A job raised without one is a job the
 * assignment picker cannot rank.
 */
const JOB_FORM = z.object({
  customer: requiredName("A customer"),
  site: requiredName("A site or locality"),
  service: requiredName("A service type"),
});

export function NewJobForm({ prefill }: { prefill: NewJobPrefill }) {
  const { fromLead } = prefill;
  const create = useMutation(createJob);

  /*
    Customers and technicians from the register.

    The technician list came from `SEED_USERS` — a hardcoded fixture, so the
    picker offered the same four names to every tenant and could never reflect
    somebody joining or leaving. There is no people endpoint yet, so the board
    supplies them: it already returns exactly the active technicians, which is
    what this picker wants.
  */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getCustomers(), getBoard()]).then(([customerQuery, boardQuery]) => {
      if (cancelled) return;
      if (customerQuery.status === "ready") setCustomers([...customerQuery.data.customers]);
      if (boardQuery.status === "ready") setTechnicians([...boardQuery.data.technicians]);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const router = useRouter();

  /*
    No default customer. It used to preset "Grand Plaza Hotel" — a name that is
    not on the register, so the job it created could not be billed.
  */
  const [customer, setCustomer] = useState(prefill.customer ?? "");
  const [site, setSite] = useState(prefill.site ?? "");
  const [landmark, setLandmark] = useState("");
  const [service, setService] = useState(prefill.service ?? DEFAULT_SERVICE);
  const [slot, setSlot] = useState<string>(SLOTS[0].label);
  /*
    **FR-203's other half.**

    The form collected a slot and then stamped `new Date().toISOString()` as
    the date — never asking, and in UTC, so a job booked before 05:30 IST was
    dated yesterday and born overdue. FR-203 says a schedule is a date *and* a
    slot; only the slot was ever built.

    Defaulted to today because most work booked on a call is for today, and
    a required empty date field would be four keystrokes of friction on the
    common path. Editable because the rest of the time it is not today.
  */
  const [scheduledDate, setScheduledDate] = useState(todayInIndia());
  const [exactTime, setExactTime] = useState("11:30");
  const [priority, setPriority] = useState<string>("normal");
  const [technician, setTechnician] = useState("");
  const [helpers, setHelpers] = useState<string[]>([]);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (field: string) =>
    setTouched((prev) => new Set(prev).add(field));
  const check = validate(
    JOB_FORM,
    { customer, site, service },
    touched as ReadonlySet<"customer" | "site" | "service">,
  );

  const sites = customers.find((entry) => entry.name === customer)?.sites ?? [];
  const chosenCustomer = customers.find((entry) => entry.name === customer) ?? null;
  const chosenSite =
    sites.find((entry) => entry.locality === site) ?? (sites.length === 1 ? sites[0] : null);
  const today = new Date();

  function toggleHelper(id: string) {
    setHelpers((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id],
    );
  }

  return (
    <AppShell
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
          breadcrumb={[{ label: "Work" }, { label: "Jobs", href: "/jobs" }]}
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
              {/*
                Picked, not typed. A free-text customer name matches nothing on
                the register, and a job whose customer is not on file produces
                an invoice with no place of supply — so it cannot state whether
                it is CGST+SGST or IGST. The name is the join key; typing it is
                how the join breaks.
              */}
              <div>
                <label htmlFor="job-customer" className="mb-1.5 block text-sm font-medium">
                  Customer
                </label>
                <select
                  id="job-customer"
                  value={customer}
                  onChange={(event) => {
                    const picked = event.target.value;
                    setCustomer(picked);
                    // Carry the site across, so the technician gets an address
                    // rather than a locality somebody half-remembered.
                    const match = customers.find((entry) => entry.name === picked);
                    if (match?.sites[0]) setSite(match.sites[0].locality);
                  }}
                  onBlur={() => touch("customer")}
                  aria-invalid={check.errors.customer !== undefined}
                  className={cn(
                    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm",
                    check.errors.customer && "border-destructive",
                  )}
                >
                  <option value="">Pick a customer</option>
                  {customers.map((entry) => (
                    <option key={entry.id} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                {check.errors.customer ? (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {check.errors.customer}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Not listed?{" "}
                    <Link href="/customers/new" className="underline">
                      Add them first
                    </Link>{" "}
                    — the site decides the tax on every invoice for this job.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="job-site" className="mb-1.5 block text-sm font-medium">
                  Site
                </label>
                <select
                  id="job-site"
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  onBlur={() => touch("site")}
                  disabled={sites.length === 0}
                  aria-invalid={check.errors.site !== undefined}
                  className={cn(
                    // `min-w-0` on a select whose options are long: without it
                    // the widest option sets the control's min-content width
                    // and pushes the card off a 360px screen.
                    "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    check.errors.site && "border-destructive",
                  )}
                >
                  <option value="">
                    {customer === "" ? "Pick the customer first" : "Pick a site"}
                  </option>
                  {sites.map((entry) => (
                    <option key={entry.id} value={entry.locality}>
                      {entry.label} — {entry.addressLine1}, {entry.locality}
                    </option>
                  ))}
                </select>
                {check.errors.site ? (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {check.errors.site}
                  </p>
                ) : sites.length > 1 ? (
                  // A customer with a Pune office and a Nagpur plant has two
                  // different places of supply.
                  <p className="mt-1 text-xs text-muted-foreground">
                    This customer has {sites.length} sites — they can be in
                    different states
                  </p>
                ) : null}
              </div>

              <Field
                label="Landmark"
                optional
                value={landmark}
                onChange={setLandmark}
                placeholder="Opposite the Gurudwara, blue gate"
                // FR-201 / §6.5.1: its own field, because a landmark is how an
                // Indian address is actually resolved on the ground.
                hint="Its own field — this is how the technician actually finds the place"
              />

              {/*
                A list that suggests, and a box that still accepts anything.

                `list=` on a text input is a datalist: the twelve services drop
                down, and a trade name nobody anticipated can still be typed.
                A `<select>` would have been tidier and wrong — it would force
                an unusual job under the nearest wrong label.
              */}
              <Field
                label="Service type"
                value={service}
                onChange={setService}
                onBlur={() => touch("service")}
                error={check.errors.service}
                list="service-types"
                hint="Decides which technicians the board will offer for this job"
              />
              <datalist id="service-types">
                {SERVICES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">When &amp; who</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium">Date</p>
                <Input
                  type="date"
                  className="max-w-[180px] tabular-nums"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  aria-label="Date of the visit"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Today unless you change it — a job with no chosen date is one
                  nobody promised
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium">Slot</p>
                <div className="flex flex-wrap gap-1.5">
                  {SLOTS.map((option) => (
                    <Chip
                      key={option.label}
                      label={option.label}
                      selected={slot === option.label}
                      onClick={() => setSlot(option.label)}
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

        {create.error ? (
          <div className="mt-4 max-w-4xl">
            <ErrorState error={create.error} onRetry={create.reset} />
          </div>
        ) : null}

        <div className="mt-4 flex max-w-4xl flex-wrap items-center gap-2">
          <Button
            disabled={!check.ok || !chosenCustomer || !chosenSite || create.pending}
            onClick={async () => {
              if (!chosenCustomer || !chosenSite) return;
              const result = await create.run({
                customerId: chosenCustomer.id,
                // The site, not its locality — two sites can share one.
                siteId: chosenSite.id,
                serviceType: service,
                scheduledDate,
                // The board's token, not the picker's label.
                slot: SLOTS.find((option) => option.label === slot)?.token ?? exactTime,
                priority: priority as "normal" | "urgent" | "breakdown",
                primaryTechnicianId: technician || null,
              });
              if (result?.ok) router.push("/today");
            }}
          >
            Create work order
          </Button>
          <Button
            variant="outline"
            render={<Link href="/today" />}
            nativeButton={false}
          >
            Cancel
          </Button>
          <WhyDisabled reasons={check.summary} />
          {/*
            Peeked from the same series the reducer will issue from, and given
            its own row on a narrow screen — as an `ml-auto` span it could not
            shrink and pushed the form two pixels off a 360px display.
          */}
          {/*
            The number is issued on save, by the register.

            This used to peek a browser counter to show it in advance. Two
            coordinators raising a job at once would both be shown the same
            number and only one would get it (FR-811), so the screen now says
            where the number comes from instead of predicting it.
          */}
          <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto sm:self-center">
            Numbered on save · {SEED_TENANT.branches[0].name}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
