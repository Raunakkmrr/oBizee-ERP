"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarSync, Wrench } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { convertLead, logLeadOutcome } from "@/lib/api/mutations";
import { useState } from "react";
import { Field } from "@/components/shared/field";
import { STATE_NAMES } from "@/lib/tax";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * Convert a won lead — FR-106, as a page.
 *
 * **What this replaces.** Conversion lived inside the "Log outcome" popover on
 * a lead row, and the two choices did not appear until the reader had picked
 * "Won". So the single highest-value moment in an AMC-led business was hidden
 * behind an unrelated decision, in a popover, on a screen whose own rule is
 * that forms are pages.
 *
 * **Why the choice is up front and explained.** A one-off job and an AMC are
 * genuinely different products, and the difference is not obvious from their
 * names: one bills once and ends, the other generates a year of visits and
 * invoices and then asks to be renewed. Somebody closing a deal at four in the
 * afternoon should not have to remember which is which.
 *
 * Choosing either marks the lead won — conversion implies it — so the outcome
 * is never logged twice or forgotten.
 */
export function ConvertLeadForm({
  leadId,
  reference,
  customer,
  site,
  value,
}: {
  leadId: string | null;
  reference: string | null;
  customer: string | null;
  site: string | null;
  value: string | null;
}) {
  const won = useMutation(logLeadOutcome);
  const convert = useMutation(convertLead);
  const router = useRouter();

  /*
    **The address, asked for once, at the moment it is known.**

    `convertLead` — the endpoint that turns a lead into a customer *and a site*
    — existed and was called by nothing. This page marked the lead won and
    redirected with the name in a query string, so the customer never came into
    being: the contract form had nobody to select, and the address gathered
    across three or four follow-up calls was thrown away with the lead.

    It is asked for here rather than earlier because this is the first moment it
    is reliably known. A lead is a phone number and a name; the address arrives
    during the calls, and demanding it at capture would either block the capture
    or fill the field with guesses.
  */
  const [addressLine1, setAddressLine1] = useState("");
  const [locality, setLocality] = useState(site ?? "");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("07");
  const [pincode, setPincode] = useState("");
  const [landmark, setLandmark] = useState("");

  const addressReady =
    addressLine1.trim().length > 0 &&
    locality.trim().length > 1 &&
    city.trim().length > 0 &&
    /^[1-8][0-9]{5}$/.test(pincode.trim());

  const carry = new URLSearchParams({
    ...(reference ? { fromLead: reference } : {}),
    ...(customer ? { customer } : {}),
    ...(site ? { site } : {}),
    ...(value ? { value } : {}),
  }).toString();

  async function convertTo(href: string) {
    /*
      Conversion implies the lead is won, so it is recorded here rather than
      asked for again on the next screen.

      The navigation waits for it. Pushing first and writing after meant a
      refusal — a lead already converted, or a role without `lead:write` —
      landed on a screen the reader had already left, and the lead stayed open
      in the queue with nobody aware.
    */
    if (leadId) {
      const result = await won.run(leadId, {
        outcome: "Won",
        note: "Won — converted",
        stage: "WON",
        nextFollowUpAt: null,
      });
      if (!result?.ok) return;

      /*
        Then make the customer real.

        `to: "customer"` creates the customer and the site and does **not**
        raise a job — the AMC path wants a customer to hang a contract on, and
        the one-off path raises its own work order on the next screen with the
        details the reader is about to confirm. Asking the register to make a
        job here as well would produce a second, empty one.

        A refusal stops the navigation. The lead is already marked won by then,
        which is correct: it was won. What must not happen is landing on a
        contract form for a customer that does not exist.
      */
      const made = await convert.run(leadId, {
        to: "customer",
        site: {
          label: "Main site",
          addressLine1: addressLine1.trim(),
          locality: locality.trim(),
          city: city.trim(),
          stateCode,
          pincode: pincode.trim(),
          landmark: landmark.trim() || null,
        },
      });
      if (!made?.ok) return;

      // The next screen is told which customer, by name, so its picker can
      // select the one just created rather than the reader hunting for it.
      router.push(
        `${href}?${new URLSearchParams({
          ...(reference ? { fromLead: reference } : {}),
          customer: made.data.customer.name,
          site: "Main site",
          ...(value ? { value } : {}),
        }).toString()}`,
      );
      return;
    }
    router.push(`${href}?${carry}`);
  }

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        {won.error ? (
          <div className="mb-4">
            <ErrorState error={won.error} onRetry={won.reset} />
          </div>
        ) : null}
        {convert.error ? (
          <div className="mb-4">
            <ErrorState error={convert.error} onRetry={convert.reset} />
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/leads" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Button>

        <PageHeader
          breadcrumb={[{ label: "Work" }, { label: "Leads", href: "/leads" }]}
          className="mb-4"
          title={customer ? `Convert ${customer}` : "Convert this lead"}
          description="Two different products. Pick the one they actually bought."
        />

        {/*
          Where the work will happen — the thing the follow-up calls were for.

          Above the two products on purpose: whichever they bought, the visit
          has to go somewhere, and a reader who picks the product first would
          then be asked for an address by a screen that looked finished.
        */}
        <Card className="mb-3 max-w-4xl">
          <CardContent className="p-5">
            <p className="text-base font-medium">Where the work happens</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              What you took down over the calls. This becomes the customer and
              their site — the lead itself keeps nothing.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Address"
                value={addressLine1}
                onChange={setAddressLine1}
                placeholder="B-42, Second Floor"
              />
              <Field
                label="Locality"
                value={locality}
                onChange={setLocality}
                placeholder="Lajpat Nagar"
              />
              <Field
                label="City / district"
                value={city}
                onChange={setCity}
                placeholder="South Delhi"
              />
              <Field
                label="PIN code"
                inputMode="numeric"
                className="tabular-nums"
                value={pincode}
                onChange={setPincode}
                placeholder="110024"
              />
              <div>
                <label
                  htmlFor="convert-state"
                  className="mb-1.5 block text-sm font-medium"
                >
                  State
                </label>
                <select
                  id="convert-state"
                  value={stateCode}
                  onChange={(event) => setStateCode(event.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  {Object.entries(STATE_NAMES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </select>
                {/* FR-802: this decides CGST+SGST or IGST on every invoice for
                    the site, so it is a field and never an inference. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  Decides the tax head on every invoice for this site
                </p>
              </div>
              <Field
                label="Landmark"
                optional
                value={landmark}
                onChange={setLandmark}
                placeholder="Near the Ring Road petrol pump"
                hint="How the technician actually finds the place"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <span className="grid size-10 place-items-center rounded-full bg-primary-bg text-primary-text">
                <CalendarSync className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">AMC contract</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  They are buying a year of someone turning up.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>Visits appear on the board on their own dates</li>
                  <li>Invoices come due on a schedule you set</li>
                  <li>A renewal reaches you 45 days before it lapses</li>
                </ul>
              </div>
              <Button
                className="mt-2"
                disabled={won.pending || convert.pending || !addressReady}
                onClick={() => void convertTo("/contracts/new")}
              >
                Set up the contract
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Wrench className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">One-off work order</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  They have one thing that needs fixing.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>One job, assigned and scheduled today</li>
                  <li>One invoice when the work is done</li>
                  <li>Nothing recurs — you call them, not the calendar</li>
                </ul>
              </div>
              <Button
                variant="outline"
                className="mt-2"
                disabled={won.pending || convert.pending || !addressReady}
                onClick={() => void convertTo("/jobs/new")}
              >
                Raise the work order
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="mt-4 max-w-4xl text-xs text-muted-foreground">
          {addressReady
            ? `Either choice marks ${customer ?? "this lead"} as won, creates them as a customer with this site, and takes the lead out of the follow-up queue.`
            : "Fill in the address above — a customer cannot be created without somewhere to send anybody."}
        </p>
      </div>
    </AppShell>
  );
}
