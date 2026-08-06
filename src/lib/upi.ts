/**
 * UPI collect links and the QR that carries them — FR-901.
 *
 * A UPI QR is not an image fetched from anywhere: it is a `upi://pay` URI
 * encoded as a QR symbol. That matters here because it means a scannable code
 * can be produced entirely in the browser, with no backend and no vendor, which
 * is why this could be built under DR-9 while the payment *status* half cannot.
 *
 * **What is real and what is not.** The link and the code are genuine — a phone
 * scanning this opens its UPI app with the payee, amount and reference filled
 * in. What does not exist is any way to *know it was paid*: reconciliation needs
 * a PSP webhook, so "mark received" stays a human act until Phase 13.
 */

export type UpiPayee = {
  /** The merchant VPA, e.g. `shakticooling@okhdfcbank`. */
  vpa: string;
  /** Shown in the payer's app, so it has to be the trading name. */
  name: string;
};

/**
 * The `upi://pay` URI.
 *
 * `tn` (transaction note) carries the invoice number so the money arrives
 * identifiable — an amount landing with no reference is a reconciliation
 * problem somebody solves by hand later.
 */
export function upiUri(
  payee: UpiPayee,
  amountPaise: number,
  invoiceNumber: string,
): string | null {
  // A malformed VPA produces a QR that fails in the customer's hand, which is
  // worse than showing none: they have already walked to the counter.
  if (!/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(payee.vpa)) return null;

  /*
    Encoded by hand rather than with `URLSearchParams`, which writes a space as
    `+`. That is an HTML *form* convention, not a URI one, and a UPI app that
    does not undo it shows the payer `Invoice+SVC/26-27/0151` in the note field.
    Percent-encoding is unambiguous everywhere.
  */
  const params: [string, string][] = [
    ["pa", payee.vpa],
    ["pn", payee.name],
    // Rupees with two decimals — UPI rejects paise integers.
    ["am", (amountPaise / 100).toFixed(2)],
    ["cu", "INR"],
    ["tn", `Invoice ${invoiceNumber}`],
  ];
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `upi://pay?${query}`;
}
