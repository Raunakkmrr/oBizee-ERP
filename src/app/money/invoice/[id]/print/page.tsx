"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { QueryBoundary } from "@/components/data-states/query-boundary";
import { Button } from "@/components/ui/button";
import { getInvoice, type Invoice } from "@/lib/data/money";
import { getFirmProfile, type FirmProfile } from "@/lib/data/series";
import { asPaise, formatMoney } from "@/lib/money";
import { loading, type Query } from "@/lib/data/result";
import { STATE_NAMES } from "@/lib/tax";

/**
 * The invoice, as a document.
 *
 * **The gap this closes.** Nothing in the product could produce a copy of a
 * single invoice. The GST workspace exports CSV, XLSX, JSON and a Tally
 * envelope — every shape an accountant's software wants and none that a
 * customer asks for. A firm whose customer says "send me the bill" had no
 * answer, on a screen called Money.
 *
 * **Print rather than a rendered PDF**, for the same reason as the job card:
 * the browser's own dialog gives paper or a PDF from one button with no
 * dependency to keep alive. The difference here is that this document has
 * statutory content, so what it must carry is not a design choice:
 *
 * - both GSTINs, the supplier's and — where the customer has one — theirs;
 * - **place of supply**, which is what decides the tax head and is the field
 *   an officer looks for first;
 * - SAC/HSN per line, the rate slab, and the tax split as either CGST+SGST or
 *   IGST, never both (FR-802);
 * - the invoice number and date, which under Rule 46 are the document's
 *   identity.
 *
 * **A draft prints, and says so.** Refusing would be worse: an office often
 * wants to check a bill on paper before issuing it, and a draft that quietly
 * looked identical to an issued invoice is the actual danger. So the watermark
 * and the missing number do the saying.
 */

/** `07` → `Delhi (07)`. The code alone is not something a reader can check. */
function stateWords(code: string): string {
  const name = STATE_NAMES[code];
  return name ? `${name} (${code})` : code;
}

function Money({ paise }: { paise: number }) {
  return <span className="tabular-nums">{formatMoney(asPaise(paise))}</span>;
}

export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [query, setQuery] = useState<Query<Invoice>>(loading());
  const [firm, setFirm] = useState<FirmProfile | null>(null);

  useEffect(() => {
    void getInvoice(id).then(setQuery);
    void getFirmProfile().then((result) => {
      if (result.status === "ready") setFirm(result.data);
    });
  }, [id]);

  return (
    <main className="mx-auto max-w-[820px] bg-white p-6 text-neutral-900 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/money/invoice?id=${id}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back to the invoice
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Print or save as PDF
        </Button>
      </div>

      <QueryBoundary query={query} label="the invoice" loadingRows={6}>
        {(invoice) => {
          const igst = invoice.head === "IGST";
          const half = Math.round(invoice.totalTaxPaise / 2);

          return (
            <article className="relative border border-neutral-300 p-6 print:border-0 print:p-4">
              {invoice.status !== "ISSUED" ? (
                /*
                  Said twice — as a band and as the missing number — because a
                  draft that reaches a customer is a bill for money that was
                  never actually charged, and one of the two will be noticed.
                */
                <p className="mb-3 border border-neutral-900 px-3 py-1 text-center text-sm font-semibold tracking-wide uppercase">
                  {invoice.status === "CANCELLED" ? "Cancelled" : "Draft — not issued"}
                </p>
              ) : null}

              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-300 pb-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">
                    {firm?.legalName ?? firm?.businessName ?? "Tax invoice"}
                  </p>
                  {firm?.branch ? (
                    <p className="text-xs text-neutral-600">
                      {firm.branch.name}
                      <br />
                      GSTIN {firm.branch.gstin} · {stateWords(firm.branch.stateCode)}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                    Tax invoice
                  </p>
                  <p className="font-mono text-lg font-semibold">
                    {/* Rule 46: the number is the document's identity. A draft
                        has not been given one, and must not borrow a shape that
                        looks like one. */}
                    {invoice.number ?? "— not yet issued —"}
                  </p>
                  <p className="text-xs text-neutral-600">{invoice.dateWord}</p>
                </div>
              </header>

              <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <section>
                  <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                    Billed to
                  </p>
                  <p className="mt-1 text-sm font-medium">{invoice.customer}</p>
                  {invoice.billTo ? (
                    <>
                      <p className="text-sm">{invoice.billTo.siteAddress}</p>
                      <p className="text-sm">
                        {invoice.billTo.siteLocality} {invoice.billTo.sitePincode}
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="text-neutral-500">GSTIN: </span>
                        {/* An unregistered customer is a fact, not a blank. */}
                        {invoice.billTo.gstin ?? "Unregistered"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm">Address not on file.</p>
                  )}
                </section>

                <section>
                  <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                    Place of supply
                  </p>
                  {/* FR-802. The field that decides the tax head, printed
                      beside the head it decided so the two can be checked
                      against each other without arithmetic. */}
                  <p className="mt-1 text-sm font-medium">
                    {invoice.billTo ? stateWords(invoice.billTo.siteStateCode) : "—"}
                  </p>
                  <p className="text-sm text-neutral-600">{invoice.explanation}</p>
                  {invoice.jobNumber ? (
                    <p className="mt-1 text-sm">
                      <span className="text-neutral-500">Against work order: </span>
                      {invoice.jobNumber}
                    </p>
                  ) : null}
                </section>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-neutral-300 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                      <th className="py-1.5 pr-2 font-semibold">Description</th>
                      <th className="py-1.5 px-2 font-semibold">SAC/HSN</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Qty</th>
                      <th className="py-1.5 px-2 text-right font-semibold">Rate</th>
                      <th className="py-1.5 px-2 text-right font-semibold">GST</th>
                      <th className="py-1.5 pl-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line, index) => (
                      <tr key={`${line.description}-${index}`} className="border-b border-neutral-200">
                        <td className="py-1.5 pr-2">{line.description}</td>
                        <td className="py-1.5 px-2 font-mono text-xs">{line.code}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{line.qty}</td>
                        <td className="py-1.5 px-2 text-right">
                          <Money paise={line.ratePaise} />
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {line.ratePercent}%
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <Money paise={line.qty * line.ratePaise} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap justify-end">
                <dl className="w-full max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-600">Taxable value</dt>
                    <dd><Money paise={invoice.taxablePaise} /></dd>
                  </div>
                  {/*
                    One head or the other, never both (FR-802). Printing an
                    empty IGST line beside a filled CGST one invites somebody
                    to fill it in.
                  */}
                  {igst ? (
                    <div className="flex justify-between">
                      <dt className="text-neutral-600">IGST</dt>
                      <dd><Money paise={invoice.totalTaxPaise} /></dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-neutral-600">CGST</dt>
                        <dd><Money paise={half} /></dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-neutral-600">SGST</dt>
                        <dd><Money paise={invoice.totalTaxPaise - half} /></dd>
                      </div>
                    </>
                  )}
                  {invoice.roundOffPaise !== 0 ? (
                    <div className="flex justify-between">
                      <dt className="text-neutral-600">Round off</dt>
                      <dd><Money paise={invoice.roundOffPaise} /></dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-neutral-400 pt-1 text-base font-semibold">
                    <dt>Total</dt>
                    <dd><Money paise={invoice.grandTotalPaise} /></dd>
                  </div>
                </dl>
              </div>

              <footer className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-neutral-300 pt-3">
                <p className="max-w-sm text-[11px] text-neutral-500">
                  {invoice.status === "ISSUED"
                    ? "Computer-generated tax invoice. Errors and omissions excepted."
                    : "This is not a tax invoice. It carries no number and nothing is due against it."}
                </p>
                <div className="text-right">
                  <div className="h-12" />
                  <p className="border-t border-neutral-400 pt-1 text-xs text-neutral-500">
                    For {firm?.businessName ?? "the supplier"}
                  </p>
                </div>
              </footer>
            </article>
          );
        }}
      </QueryBoundary>
    </main>
  );
}
