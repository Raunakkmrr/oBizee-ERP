"use client";

import { useEffect, useState } from "react";
import { MapPin, MessageCircle, Phone, Users } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { PageHeader } from "@/components/shared/page-header";
import { ROW } from "@/components/shared/controls";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Panel } from "@/components/shared/panel";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Illustration } from "@/components/shared/illustration";
import { cn } from "@/lib/utils";
import { Unavailable, NEEDS_BACKEND, NEEDS_UPLOAD } from "@/components/shared/unavailable";
import { asPaise } from "@/lib/money";
import { EM_DASH, loading, type Query } from "@/lib/data/result";
import {
  CONDITION_LABEL,
  CONTACT_ROLE_LABEL,
  contactOrder,
  getCustomers,
  warrantyStateFor,
  type CustomersData,
  type Site,
} from "@/lib/data/customers";
import { CURRENT_USER } from "@/lib/data/fixtures/tenant";

/**
 * Customers & sites — §6.14's "Site & asset history".
 *
 * **The one decision:** *is this a repeat problem, and is it under warranty?*
 *
 * Above the fold, in this order: address, **landmark**, contacts, and the asset
 * list with warranty status. §7.5 is emphatic that the landmark gets its own
 * line — it is how an Indian address is actually resolved on the ground — and
 * §7.6 that every number carries its role label, "so nobody rings the wrong
 * person".
 *
 * The timeline is **merged across all assets at the site and filterable by
 * asset**, because "has this happened before" is a question about the site
 * first and the unit second.
 */
function SitePanel({ site }: { site: Site }) {
  const [assetFilter, setAssetFilter] = useState<string | null>(null);
  const entries = assetFilter
    ? site.timeline.filter((entry) => entry.assetId === assetFilter)
    : site.timeline;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Card className="p-4">
          <p className="font-medium">{site.label}</p>
          <p className="text-sm text-muted-foreground">
            {site.addressLine1} · {site.locality} · {site.city}{" "}
            <span className="tabular-nums">{site.pincode}</span>
          </p>
          {/*
            Its own line, never folded into the address (§7.5). A site with no
            landmark says so rather than silently omitting the line, because the
            technician needs to know to ask.
          */}
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Landmark: </span>
            {site.landmark ?? (
              <span className="text-muted-foreground">
                {EM_DASH} none recorded
              </span>
            )}
          </p>
          {site.accessNotes ? (
            // Read before arriving, not after being turned away at the gate.
            <p className="mt-2 rounded-md bg-warning/15 p-2 text-xs text-brand-brown">
              {site.accessNotes}
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-fit self-start"
            render={
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${site.addressLine1} ${site.locality} ${site.city} ${site.pincode}`)}`}
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            <MapPin className="size-4" />
            Navigate
          </Button>
        </Card>

        <Panel title="Contacts" icon={Users} count={site.contacts.length} flush>
          {contactOrder(site.contacts).map((contact) => (
            <div
              key={contact.id}
              className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm", ROW)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{contact.name}</span>
                  {/* The role, next to the number — §7.6's whole point. */}
                  <Badge variant="outline" className="text-xs">
                    {CONTACT_ROLE_LABEL[contact.roleLabel]}
                  </Badge>
                  {contact.isPrimary ? (
                    <span className="text-xs text-muted-foreground">
                      Primary
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {contact.phone}
                  {/* Only when it differs — a duplicate number is noise. */}
                  {contact.whatsapp && contact.whatsapp !== contact.phone
                    ? ` · WhatsApp ${contact.whatsapp}`
                    : null}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a href={`tel:${contact.phone.replace(/\s/g, "")}`} />
                  }
                  nativeButton={false}
                >
                  <Phone className="size-3.5" />
                  Call
                </Button>
                {contact.whatsapp ? (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`https://wa.me/91${contact.whatsapp.replace(/\s/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    <MessageCircle className="size-3.5" />
                    WhatsApp
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </Panel>

        <div>
          <p className="mb-2 text-sm font-medium">
            Service history{" "}
            <span className="text-muted-foreground tabular-nums">
              ({entries.length})
            </span>
          </p>
          {/* Merged across assets, filterable by asset (§6.14). */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={assetFilter === null}
              onClick={() => setAssetFilter(null)}
              className={cn(
                "min-h-8 rounded-full border px-2.5 py-1 text-xs transition-colors",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                assetFilter === null
                  ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              All assets
            </button>
            {site.assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                aria-pressed={assetFilter === asset.id}
                onClick={() => setAssetFilter(asset.id)}
                className={cn(
                  "min-h-8 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  assetFilter === asset.id
                    ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {asset.make} {asset.model}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              No service recorded for this selection.
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm", ROW)}
                >
                  <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {entry.dateWord}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tnum-id">
                    {entry.jobNumber}
                  </span>
                  <span className="min-w-0 flex-1">{entry.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {entry.technician}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {/* ------------------------------- assets ------------------------- */}
      <div className="space-y-3">
        <p className="text-sm font-medium">
          Assets{" "}
          <span className="text-muted-foreground tabular-nums">
            ({site.assets.length})
          </span>
        </p>

        {site.assets.length === 0 ? (
          <Empty className="border">
            <Illustration name="assets" width={170} className="mx-auto mb-1" />
            <EmptyHeader>
              <EmptyTitle>No assets recorded at this site.</EmptyTitle>
              <EmptyDescription>
                Asset records are usually created on a visit, not at a desk.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Unavailable label="Add asset" reason={NEEDS_BACKEND} />
                {/*
                  §6.14 is specific that this second button **sends the
                  technician a task** — "which is how these records actually get
                  created". It is not a hint; it is the realistic path.
                */}
                <Unavailable
                  label="Ask the technician to add on next visit"
                  reason={NEEDS_BACKEND}
                />
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          site.assets.map((asset) => {
            const warranty = warrantyStateFor(asset);
            return (
              <Card key={asset.id} className="p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {asset.make} {asset.model}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      asset.condition === "CRITICAL" &&
                        "border-destructive/40 text-destructive",
                      asset.condition === "NEEDS_ATTENTION" &&
                        "text-brand-brown",
                    )}
                  >
                    {CONDITION_LABEL[asset.condition]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {asset.assetType} · {asset.locationInSite}
                </p>
                <p className="text-xs text-muted-foreground tnum-id">
                  {/* An absent serial is stated; an empty string would read as
                      a rendering bug and stall a warranty claim. */}
                  {asset.serialNumber ?? `${EM_DASH} no serial recorded`}
                </p>
                <p
                  className={cn(
                    "mt-1.5 text-xs",
                    warranty.kind === "in_warranty" && "text-success",
                    warranty.kind === "expiring" && "text-brand-brown",
                    warranty.kind === "expired" && "text-destructive",
                    warranty.kind === "unknown" && "text-muted-foreground",
                  )}
                >
                  {warranty.word}
                </p>
                {asset.repeatFailure ? (
                  // FR-602: derived, and the reason this screen exists.
                  <p className="mt-1.5 rounded-md bg-destructive/10 p-1.5 text-xs text-destructive">
                    Repeat failure — same fault three times in twelve months.
                  </p>
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [query, setQuery] = useState<Query<CustomersData>>(loading());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomers().then((result) => {
      if (!cancelled) setQuery(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();

  return (
    <AppShell
      today={today}
      freshness={{ kind: "fresh", at: today }}
    >
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-4"
          breadcrumb={[{ label: "Work" }]}
          title="Customers &amp; sites"
          description="Everything about one customer, and whether this is a repeat problem."
        />

        <QueryBoundary query={query} label="customers" loadingRows={6}>
          {(data) => {
            const sites = data.customers.flatMap((customer) =>
              customer.sites.map((site) => ({ customer, site })),
            );
            const active =
              sites.find((entry) => entry.site.id === selected) ?? sites[0];

            return (
              <div className="space-y-3">
                {/* The directory is a chip row, not a second column: §6.2 says
                    this screen is "almost always reached through a job or a
                    lead rather than browsed", so browsing gets minimal chrome
                    and the site itself gets the space. */}
                <div className="flex flex-wrap gap-1.5">
                  {sites.map(({ customer, site }) => {
                    const isActive = site.id === active?.site.id;
                    return (
                      <button
                        key={site.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSelected(site.id)}
                        className={cn(
                          "min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors",
                          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          isActive
                            ? "bg-primary font-medium text-primary-foreground shadow-[var(--shadow-card)]"
                            : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {customer.name}
                        <span className="text-muted-foreground">
                          {" "}
                          · {site.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {active ? (
                  <>
                    <Card className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3 text-sm">
                      <span className="font-medium">
                        {active.customer.name}
                      </span>
                      <span className="text-xs text-muted-foreground tnum-id">
                        {/* Most household customers have no GSTIN (§7.4) —
                            said in words, not left blank. */}
                        {active.customer.gstin ?? "No GSTIN — unregistered"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {active.customer.creditDays} day credit
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        Outstanding{" "}
                        <MoneyText
                          amount={asPaise(active.customer.outstandingPaise)}
                          className="font-medium text-foreground"
                        />
                      </span>
                    </Card>
                    <SitePanel key={active.site.id} site={active.site} />
                  </>
                ) : null}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
