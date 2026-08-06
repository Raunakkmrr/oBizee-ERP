/**
 * Where a site is, and which map draws it.
 *
 * **Why a provider seam rather than calling MapLibre directly.** The choice of
 * tiles is a commercial decision, not an architectural one: OpenFreeMap needs
 * no key and costs nothing, Google has the best Indian coverage and needs a
 * billing account, Mappls has the best Indian *address* data and needs its own.
 * Keeping the app talking to `MAP_PROVIDER` means changing that answer later is
 * a config edit, not a rewrite of every screen that shows a location.
 *
 * **Why a coordinate is not the whole answer.** §6.5.1 already gives a landmark
 * its own field, because *"this is how an Indian address is actually resolved
 * on the ground"* — "opposite the Gurudwara, blue gate" beats a pin dropped
 * fifteen metres off on a lane with no name. The map is added *beside* the
 * landmark, never instead of it, and the navigate link is the thing a
 * technician actually taps.
 */

export type LatLng = { lat: number; lng: number };

export type MapProvider = {
  id: "openfreemap" | "google" | "mappls";
  label: string;
  /** A MapLibre style URL. Null for providers that need their own SDK. */
  styleUrl: string | null;
  /** True when the provider needs a key this build does not have. */
  needsKey: boolean;
  attribution: string;
};

export const MAP_PROVIDER: MapProvider = {
  id: "openfreemap",
  label: "OpenFreeMap",
  // Public, keyless, OSM-derived. Swapping this line is the whole migration to
  // a paid provider's MapLibre-compatible style.
  styleUrl: "https://tiles.openfreemap.org/styles/bright",
  needsKey: false,
  attribution: "© OpenStreetMap contributors",
};

/** Roughly the middle of Delhi — where the map opens before anything is known. */
export const DEFAULT_CENTRE: LatLng = { lat: 28.6139, lng: 77.209 };

/** India's bounding box, used to refuse a pin dropped in the sea. */
const INDIA_BOUNDS = { minLat: 6.5, maxLat: 37.6, minLng: 68.1, maxLng: 97.5 };

export function withinIndia(point: LatLng): boolean {
  return (
    point.lat >= INDIA_BOUNDS.minLat &&
    point.lat <= INDIA_BOUNDS.maxLat &&
    point.lng >= INDIA_BOUNDS.minLng &&
    point.lng <= INDIA_BOUNDS.maxLng
  );
}

/** Six decimals is ~10 cm — more than a doorway needs, and it keeps URLs short. */
export function formatLatLng(point: LatLng): string {
  return `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
}

/**
 * The link a technician actually taps.
 *
 * A `geo:` URI is the correct thing on Android and opens whichever maps app
 * they use; iOS and desktop ignore it. So this returns an https Google Maps
 * URL, which every platform resolves and which hands off to the installed app
 * on a phone. Falls back to the text address when there is no pin — an address
 * search beats no button.
 */
export function navigateHref(
  point: LatLng | null,
  textAddress: string,
): string | null {
  if (point && withinIndia(point)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.lat.toFixed(
      6,
    )},${point.lng.toFixed(6)}`;
  }
  const query = textAddress.trim();
  if (query === "") return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** One line for a job sheet: locality, city, state and PIN, skipping blanks. */
export function addressLine(parts: {
  locality?: string | null;
  city?: string | null;
  stateName?: string | null;
  pin?: string | null;
}): string {
  return [parts.locality, parts.city, parts.stateName, parts.pin]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(", ");
}
