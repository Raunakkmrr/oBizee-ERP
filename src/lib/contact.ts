/**
 * Phone and WhatsApp links.
 *
 * Both are real destinations, not stubs: `tel:` hands off to the dialler and
 * `wa.me` to WhatsApp, on a desktop as well as a phone. That matters because
 * this product's users work the phone all day — a Call button that does nothing
 * is the single most useless control we could ship.
 *
 * **Numbers are stored the way a human types them** (`98200 12345`), and both
 * schemes need them stripped. India is assumed for a bare ten-digit number,
 * which is the only shape the fixtures contain; anything already carrying a
 * country code is left alone rather than being "corrected" into a wrong number.
 */

/** Digits only, with the country code resolved. Null when unusable. */
export function e164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Already international, in either notation.
  if (trimmed.startsWith("+")) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  // A leading 0 is the domestic trunk prefix and is not dialled internationally.
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;

  // Something we do not recognise. Returning a guess would dial a stranger.
  return null;
}

export function telHref(phone: string | null | undefined): string | null {
  const number = e164(phone);
  return number ? `tel:+${number}` : null;
}

/**
 * A WhatsApp deep link, optionally pre-filled.
 *
 * The message is a *draft* — wa.me cannot send on the user's behalf, and that
 * is the correct boundary: a reminder to a customer who is late on ₹86,400 is
 * not something software should send without the person seeing it first.
 */
export function whatsappHref(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const number = e164(phone);
  if (!number) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${query}`;
}
