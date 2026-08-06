"use client";

import { renderSVG } from "uqr";
import { upiUri, type UpiPayee } from "@/lib/upi";

/**
 * A scannable UPI QR — FR-901.
 *
 * Rendered as an SVG in the browser from the `upi://pay` URI. No image request,
 * no vendor, nothing to go stale: the code *is* the link, so it cannot drift
 * away from the amount printed beside it. That also means it works under DR-9,
 * which a PSP-hosted QR would not.
 *
 * `renderSVG` is given the string only; error-correction level M is the default
 * and is the right one here — a payment QR is scanned from a phone held a foot
 * away, not read off a dusty crate, so paying for H-level redundancy in module
 * count just makes the code denser to scan.
 */
export function UpiQr({
  payee,
  amountPaise,
  invoiceNumber,
  size = 160,
}: {
  payee: UpiPayee;
  amountPaise: number;
  invoiceNumber: string;
  size?: number;
}) {
  const uri = upiUri(payee, amountPaise, invoiceNumber);

  if (!uri) {
    // A QR that fails in the customer's hand is worse than none — they have
    // already walked to the counter and got their phone out.
    return (
      <div
        style={{ width: size, height: size }}
        className="grid place-items-center rounded-lg bg-muted p-3 text-center text-xs text-muted-foreground"
      >
        No UPI ID on record — add one in Settings to print a payment QR
      </div>
    );
  }

  return (
    <figure className="w-fit">
      <div
        style={{ width: size, height: size }}
        className="[&>svg]:size-full rounded-lg bg-white p-2"
        // uqr returns a complete, self-contained SVG document.
        dangerouslySetInnerHTML={{ __html: renderSVG(uri) }}
      />
      <figcaption className="mt-1 text-center text-xs text-muted-foreground tabular-nums">
        Scan to pay {payee.vpa}
      </figcaption>
    </figure>
  );
}
