"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Chip } from "@/components/shared/controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { MoneyText } from "@/components/shared/money-text";
import { WhyDisabled } from "@/components/shared/field";
import { asPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { validate } from "@/lib/validate";
import { SLABS } from "@/lib/data/rates";
import { STATE_BY_CODE } from "@/lib/data/pincode";
import { computeTotals, derivePlaceOfSupply, type InvoiceLine } from "@/lib/tax";
import { SEED_TENANT } from "@/lib/data/fixtures/tenant";
import { billingIdentityFor } from "@/lib/data/customers";
import { getCustomers, type Customer } from "@/lib/data/customers";
import { createInvoice } from "@/lib/api/mutations";
import { useMutation } from "@/lib/api/use-mutation";
import { ErrorState } from "@/components/data-states/error-state";

/**
 * An invoice typed by hand — the third way in, and deliberately the least
 * convenient.
 *
 * **The customer is picked, never typed.** A typed name that does not match the
 * register produces an invoice with no place of supply, which cannot state its
 * own tax head — the exact failure the register was made writable to fix. So
 * this offers the register and sends anyone else to add them first.
 *
 * **The totals are computed live and shown while the lines are edited**, because
 * the one question being answered is "what will this come to", and a form that
 * makes you save to find out is a form people do arithmetic beside.
 */
type DraftLine = {
  id: string;
  description: string;
  code: string;
  kind: "service" | "goods";
  qty: string;
  rate: string;
  ratePercent: number;
};

const emptyLine = (n: number): DraftLine => ({
  id: `line_${n}`,
  description: "",
  code: "9987",
  kind: "service",
  qty: "1",
  rate: "",
  ratePercent: 18,
});

const ADHOC_FORM = z.object({
  customer: z.string().min(1, "Pick the customer this is billed to"),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        code: z.string().trim().min(4),
        qty: z.number().positive(),
        rate: z.number().positive(),
      }),
    )
    .min(1, "An invoice needs at least one line with a description and an amount"),
});

export function AdhocInvoiceForm() {
  const router = useRouter();
  const raise = useMutation(createInvoice);
  /*
    Whether the reader has said this is not the balance of an existing bill.

    The API refuses an unlinked invoice for a customer who already owes money,
    because that is the shape the second-invoice habit takes — and it refuses
    once rather than for ever, so a real new job is one click away.
  */
  const [acknowledged, setAcknowledged] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getCustomers().then((query) => {
      if (!cancelled && query.status === "ready") setCustomers(query.data.customers);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
    A customer id and a site id, not a name.

    The picker used to carry `entry.name` and the billing identity was looked
    up by matching it — two customers with the same name settle on whichever
    the list found first, which is the name-join the schema replaced with a
    foreign key.

    The **site** matters more here than anywhere else on this screen. Place of
    supply comes from the site's state (FR-802), so a customer with a plant in
    Delhi and one in Nagpur has two different tax heads, and an invoice raised
    without saying which one is a guess at whether this is CGST+SGST or IGST.
  */
  const [customerId, setCustomerId] = useState("");
  const [pickedSiteId, setPickedSiteId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(1)]);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const branch = SEED_TENANT.branches[0];
  const chosen = customers.find((entry) => entry.id === customerId) ?? null;
  const sites = chosen?.sites ?? [];

  /*
    One site is not a choice; more than one is, and it has to be made.

    Derived rather than pushed into state by an effect — an effect would render
    once with the wrong site and correct itself, and on this screen the wrong
    site is the wrong tax head.
  */
  const siteId =
    sites.length === 1
      ? sites[0]!.id
      : sites.some((entry) => entry.id === pickedSiteId)
        ? pickedSiteId
        : "";
  const site = sites.find((entry) => entry.id === siteId) ?? null;
  const billTo = chosen ? billingIdentityFor(customers, chosen.name, site?.label ?? null) : null;

  /* Only lines that are actually filled in count toward the total. */
  const usable: InvoiceLine[] = lines
    .filter(
      (line) =>
        line.description.trim() !== "" && Number(line.rate.replace(/,/g, "")) > 0,
    )
    .map((line) => ({
      description: line.description.trim(),
      code: line.code.trim(),
      kind: line.kind,
      qty: Number(line.qty) || 1,
      ratePaise: Math.round(Number(line.rate.replace(/,/g, "")) * 100),
      ratePercent: line.ratePercent,
    }));

  const check = validate(
    ADHOC_FORM,
    {
      // The validator asks "has one been chosen"; the id answers that.
      customer: customerId,
      lines: usable.map((line) => ({
        description: line.description,
        code: line.code,
        qty: line.qty,
        rate: line.ratePaise / 100,
      })),
    },
    touched as ReadonlySet<"customer" | "lines">,
  );

  const derivation = derivePlaceOfSupply(
    billTo?.siteStateCode ?? branch.stateCode,
    branch.stateCode,
  );
  const totals = computeTotals(usable, derivation.head);

  const set = (id: string, patch: Partial<DraftLine>) =>
    setLines((previous) =>
      previous.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          render={<Link href="/money/new" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <PageHeader
          breadcrumb={[
            { label: "Money", href: "/money" },
            { label: "New invoice", href: "/money/new" },
          ]}
          className="mb-4"
          title="Write an invoice by hand"
          description="For a counter sale or a one-off supply that traces to no job."
        />

        <div className="grid max-w-5xl gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Billed to</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <label htmlFor="adhoc-customer" className="sr-only">
                  Customer
                </label>
                <select
                  id="adhoc-customer"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  onBlur={() => setTouched((was) => new Set(was).add("customer"))}
                  aria-invalid={check.errors.customer !== undefined}
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm",
                    check.errors.customer && "border-destructive",
                  )}
                >
                  <option value="">Pick a customer</option>
                  {customers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>

                {sites.length > 1 ? (
                  <div className="mt-2 space-y-1.5">
                    <label htmlFor="adhoc-site" className="text-sm font-medium">
                      Which site
                    </label>
                    <select
                      id="adhoc-site"
                      value={siteId}
                      onChange={(event) => setPickedSiteId(event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Pick a site</option>
                      {sites.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label} — {entry.locality}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      This decides the place of supply, and so whether the
                      invoice is CGST+SGST or IGST.
                    </p>
                  </div>
                ) : null}

                {check.errors.customer ? (
                  <p role="alert" className="text-xs text-destructive">
                    {check.errors.customer}
                  </p>
                ) : billTo ? (
                  <p className="text-xs text-muted-foreground">
                    {billTo.siteAddress}, {billTo.siteLocality} ·{" "}
                    {STATE_BY_CODE[billTo.siteStateCode]} ({billTo.siteStateCode})
                    {billTo.gstin ? ` · GSTIN ${billTo.gstin}` : " · no GSTIN"}
                  </p>
                ) : (
                  /* Never a free-text name: it would produce an invoice whose
                     tax head cannot be derived. */
                  <p className="text-xs text-muted-foreground">
                    Not listed?{" "}
                    <Link href="/customers/new" className="underline">
                      Add them to the register
                    </Link>{" "}
                    — an invoice needs their site to know its tax head.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lines.map((line, index) => (
                  <div
                    key={line.id}
                    className="min-w-0 space-y-2 rounded-xl bg-muted-bg p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <Input
                        aria-label={`Line ${index + 1} description`}
                        placeholder="What was supplied"
                        value={line.description}
                        onChange={(event) =>
                          set(line.id, { description: event.target.value })
                        }
                      />
                      {lines.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove line ${index + 1}`}
                          className="shrink-0"
                          onClick={() =>
                            setLines((previous) =>
                              previous.filter((other) => other.id !== line.id),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          SAC / HSN
                        </label>
                        <Input
                          className="tnum-id"
                          value={line.code}
                          onChange={(event) => set(line.id, { code: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Qty
                        </label>
                        <Input
                          inputMode="numeric"
                          className="tabular-nums"
                          value={line.qty}
                          onChange={(event) =>
                            set(line.id, { qty: event.target.value.replace(/[^\d.]/g, "") })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">
                          Rate (₹)
                        </label>
                        <Input
                          inputMode="numeric"
                          className="tabular-nums"
                          value={line.rate}
                          onChange={(event) =>
                            set(line.id, {
                              rate: event.target.value.replace(/[^\d.,]/g, ""),
                            })
                          }
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">GST</p>
                        <div className="flex flex-wrap gap-1">
                          {/* The four slabs in force — see FR-804. A free-text
                              rate here is how a withdrawn slab gets re-used. */}
                          {SLABS.map((slab) => (
                            <Chip
                              key={slab}
                              label={`${slab}%`}
                              selected={line.ratePercent === slab}
                              onClick={() => set(line.id, { ratePercent: slab })}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Chip
                        label="Service"
                        selected={line.kind === "service"}
                        onClick={() => set(line.id, { kind: "service" })}
                      />
                      <Chip
                        label="Goods"
                        selected={line.kind === "goods"}
                        onClick={() => set(line.id, { kind: "goods" })}
                      />
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines((previous) => [...previous, emptyLine(previous.length + 1)])
                  }
                >
                  <Plus className="size-3.5" />
                  Add a line
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-base">What it comes to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-start gap-2 text-xs">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {/* The derivation sentence, live, exactly as the review shows it. */}
                <span>{derivation.explanation}</span>
              </p>

              <Separator />

              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable value</span>
                <MoneyText amount={asPaise(totals.taxablePaise)} />
              </div>
              {derivation.head === "IGST" ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST</span>
                  <MoneyText amount={asPaise(totals.igstPaise ?? 0)} />
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST</span>
                    <MoneyText amount={asPaise(totals.cgstPaise ?? 0)} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST</span>
                    <MoneyText amount={asPaise(totals.sgstPaise ?? 0)} />
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Round off</span>
                <MoneyText amount={asPaise(totals.roundOffPaise)} />
              </div>

              <Separator />

              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <MoneyText amount={asPaise(totals.grandTotalPaise)} />
              </div>

              {/*
                The interruption, not a wall.

                A refusal that only says no is one people learn to route around
                — and the route around it here is the second invoice this whole
                feature exists to prevent. So it names what is outstanding and
                the ways out, and the last of those ways is "this is different
                work", which is often simply true.
              */}
              {raise.error && !acknowledged && "message" in raise.error && /already has an unpaid invoice/i.test(raise.error.message) ? (
                <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <p className="text-sm font-medium">
                    They already owe you on an invoice
                  </p>
                  <p className="text-sm text-muted-foreground">
                    If this is the balance of that bill, a second invoice declares
                    the same work twice and you pay the GST twice. The balance is
                    a receivable, not a new supply.
                  </p>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                    <li>Record the payment they have made against the original</li>
                    <li>Send a payment request quoting its number — it carries no GST</li>
                    <li>Raise a credit note if the value is genuinely coming down</li>
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAcknowledged(true);
                        raise.reset();
                      }}
                    >
                      This is different work
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      render={<Link href="/money" />}
                      nativeButton={false}
                    >
                      Take me to what they owe
                    </Button>
                  </div>
                </div>
              ) : raise.error ? (
                <div className="pb-2">
                  <ErrorState error={raise.error} onRetry={raise.reset} />
                </div>
              ) : null}

              {acknowledged ? (
                <p className="text-xs text-muted-foreground">
                  Recorded as different work from what they already owe.
                </p>
              ) : null}

              <div className="space-y-2 pt-1">
                <Button
                  className="w-full"
                  disabled={!check.ok || !siteId || raise.pending}
                  onClick={async () => {
                    const result = await raise.run({
                      customerId,
                      siteId,
                      lines: usable,
                      /*
                        Only sent once the reader has said, in the interruption
                        below, that this is different work. Sending it always
                        would defeat the guard; never sending it would block a
                        genuine repair for a customer who owes money on an AMC.
                      */
                      ...(acknowledged ? { acknowledgedUnpaid: true } : {}),
                    });
                    // The review screen is told which document to show, not left to guess.
    if (result?.ok) router.push(`/money/invoice?id=${result.data.id}`);
                  }}
                >
                  {raise.pending ? "Creating…" : "Create invoice"}
                </Button>
                <WhyDisabled reasons={check.summary} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
