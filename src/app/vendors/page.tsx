"use client";

import Link from "next/link";
import { Plus, ShieldAlert, Store } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { Panel } from "@/components/shared/panel";
import { Button } from "@/components/ui/button";
import { ROW_TR } from "@/components/shared/controls";
import { cn } from "@/lib/utils";
import { MSME_LABEL } from "@/lib/data/money";
import { STATE_BY_CODE } from "@/lib/data/pincode";
import { isUnregistered, msmedApplies, PAN_TYPE_LABEL } from "@/lib/data/vendors";
import { useStoreState } from "@/lib/data/use-store";

/**
 * Vendors — FR-705.
 *
 * The list leads with the two facts that change what happens on a bill: whether
 * the supplier is registered for GST (which decides reverse charge), and
 * whether they are a micro or small enterprise (which starts a 45-day clock
 * with real money on it). Everything else is reference.
 */
export default function VendorsPage() {
  const state = useStoreState();
  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <PageHeader
          className="mb-4"
          breadcrumb={[{ label: "Money" }]}
          title="Vendors"
          description="Who we buy from — and what the tax rules say about each of them."
          actions={
            <Button render={<Link href="/vendors/new" />} nativeButton={false}>
              <Plus className="size-4" />
              Add vendor
            </Button>
          }
        />

        <Panel title="All vendors" icon={Store} count={state.vendors.length} flush>
          {state.vendors.map((vendor) => {
            const msmed = msmedApplies(vendor);
            const unregistered = isUnregistered(vendor);
            return (
              <div
                key={vendor.id}
                className={cn(
                  "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 last:border-b-0",
                  ROW_TR,
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{vendor.name}</p>
                  <p className="truncate text-xs text-muted-foreground tnum-id">
                    {vendor.gstin ?? "No GSTIN"} ·{" "}
                    {STATE_BY_CODE[vendor.stateCode] ?? vendor.stateCode} ·{" "}
                    {PAN_TYPE_LABEL[vendor.panType]}
                  </p>
                </div>

                {unregistered ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                    <ShieldAlert aria-hidden="true" className="size-3.5" />
                    Reverse charge
                  </span>
                ) : null}

                <span
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                    msmed.applies
                      ? "bg-destructive-bg text-destructive"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {msmed.applies
                    ? `${MSME_LABEL[vendor.msmeClass]} · pay within ${msmed.limitDays} days`
                    : MSME_LABEL[vendor.msmeClass]}
                </span>
              </div>
            );
          })}
        </Panel>
      </div>
    </AppShell>
  );
}
