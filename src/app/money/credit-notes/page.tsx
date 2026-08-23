"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileMinus } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shared/page-header";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Card } from "@/components/ui/card";
import { Panel, ValuePill } from "@/components/shared/panel";
import { MoneyText } from "@/components/shared/money-text";
import { asPaise } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import { getCreditNotes, type CreditNoteList } from "@/lib/data/gst";
import { cn } from "@/lib/utils";

/**
 * Every credit note, and — the only reason this screen exists — which of them
 * have not been accepted.
 *
 * **What it is for.** Since Rule 67B a credit note reduces the supplier's
 * liability only once the recipient accepts it on their portal. Rejected or
 * ignored, the liability comes back in the following month's GSTR-3B. So an
 * issued note sitting unaccepted is a reduction the firm has declared and not
 * received, and nothing anywhere else in the product would say so.
 *
 * The GST readiness checklist links here, because "3 credit notes the customer
 * has not accepted" is only useful if you can then see which three.
 *
 * ⚠️ Nothing here is tax advice, and none of it is automated: acceptance
 * happens on the customer's portal and is recorded here by whoever looked.
 */
const IMS: Record<string, { label: string; tone: "good" | "warn" | "bad"; says: string }> = {
  ACCEPTED: { label: "Accepted", tone: "good", says: "The reduction stands." },
  PENDING: {
    label: "Not yet accepted",
    tone: "warn",
    says: "Reported in GSTR-1, but the liability is still standing.",
  },
  REJECTED: {
    label: "Rejected",
    tone: "bad",
    says: "The liability has come back. Talk to them before the next GSTR-3B.",
  },
};

export default function CreditNotesPage() {
  const [query, setQuery] = useState<Query<CreditNoteList>>(loading());

  const load = useCallback(() => {
    void getCreditNotes().then(setQuery);
  }, []);
  useEffect(load, [load]);

  const today = new Date();

  return (
    <AppShell today={today} freshness={{ kind: "fresh", at: today }}>
      <div className="p-4 md:p-6">
        <PageHeader
          breadcrumb={[{ label: "Money", href: "/money" }]}
          title="Credit notes"
          description="What has been credited back, and whether the customer has accepted it."
        />

        <QueryBoundary query={query} label="credit notes" loadingRows={5}>
          {(data) => {
            const waiting = data.creditNotes.filter(
              (n) => n.status === "ISSUED" && n.imsState !== "ACCEPTED",
            );
            return (
              <div className="mt-4 space-y-4">
                {/*
                  The sentence before the list. A count of credit notes is not
                  actionable; a count of *unaccepted* ones is the thing somebody
                  has to do something about before the next return.
                */}
                <Card className="p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-lg font-semibold">
                      {data.creditNotes.length} credit note
                      {data.creditNotes.length === 1 ? "" : "s"}
                    </p>
                    {waiting.length > 0 ? (
                      <ValuePill tone="warn">{waiting.length} not accepted</ValuePill>
                    ) : (
                      <ValuePill tone="good">All accepted</ValuePill>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {waiting.length > 0
                      ? "Until the customer accepts a note on their portal, the liability it was meant to reduce is still standing."
                      : "Every issued note has been accepted, so every reduction stands."}
                  </p>
                </Card>

                {data.creditNotes.length === 0 ? (
                  <Card className="p-6 text-center">
                    <FileMinus
                      aria-hidden="true"
                      className="mx-auto mb-2 size-6 text-muted-foreground"
                    />
                    <p className="text-sm font-medium">No credit notes yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      They are raised from an issued invoice, and are the one
                      lawful way to reduce tax already declared.
                    </p>
                  </Card>
                ) : (
                  <Panel title="All credit notes" icon={FileMinus}>
                    <ul>
                      {/* Unaccepted first: they are the ones that need doing. */}
                      {[...data.creditNotes]
                        .sort(
                          (a, b) =>
                            Number(b.status === "ISSUED" && b.imsState !== "ACCEPTED") -
                            Number(a.status === "ISSUED" && a.imsState !== "ACCEPTED"),
                        )
                        .map((note) => {
                          const ims = IMS[note.imsState]!;
                          const unaccepted =
                            note.status === "ISSUED" && note.imsState !== "ACCEPTED";
                          return (
                            <li
                              key={note.id}
                              className={cn(
                                "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-4 py-3 last:border-0",
                                unaccepted && "border-l-2 border-l-warning bg-warning/5",
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="tnum-id text-sm">
                                    {note.number ?? "Draft — no number yet"}
                                  </span>
                                  <span className="font-medium">{note.customer}</span>
                                  <Link
                                    href={`/money/invoice?id=${note.invoiceId}`}
                                    className="text-xs text-muted-foreground hover:underline"
                                  >
                                    against {note.invoiceNumber ?? "an invoice"}
                                  </Link>
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {note.reason}
                                </span>
                              </span>

                              <MoneyText
                                amount={asPaise(note.grandTotalPaise)}
                                className="w-28 shrink-0 text-right font-medium"
                              />

                              <span className="w-56 shrink-0">
                                {note.status === "DRAFT" ? (
                                  <span className="text-xs text-muted-foreground">
                                    Not issued — reduces nothing yet
                                  </span>
                                ) : (
                                  <>
                                    <ValuePill tone={ims.tone}>{ims.label}</ValuePill>
                                    <span className="block text-xs text-muted-foreground">
                                      {ims.says}
                                    </span>
                                  </>
                                )}
                              </span>
                            </li>
                          );
                        })}
                    </ul>
                  </Panel>
                )}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </AppShell>
  );
}
