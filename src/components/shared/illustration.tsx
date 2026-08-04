import { cn } from "@/lib/utils";

/**
 * A named illustration for an empty or error state.
 *
 * **Why these exist.** An empty state that is one grey circle and a sentence is
 * the moment a product looks unfinished — and empty states are disproportionately
 * what a new tenant sees, because on day one *everything* is empty. A real
 * drawing is the cheapest signal that somebody built this on purpose.
 *
 * The files are unDraw (commercial use, no attribution required), recoloured at
 * import time into this product's warm range: the indigo accent became
 * `#d17c45`, the purple-navy figures became warm darks, the neutral greys became
 * the border warm. Dropped in unchanged they read as foreign objects on
 * `#fbf7f3`. **Skin tones were deliberately left alone** — those are not a brand
 * decision to make.
 *
 * A plain `<img>`, not `next/image`. The optimiser cannot rasterise or resize a
 * vector usefully, and serving SVG through it requires `dangerouslyAllowSVG`,
 * which turns on SVG delivery for *every* remote source — a real XSS surface
 * bought for no gain.
 *
 * Every one carries an explicit empty `alt`: these are decorative, and the
 * sentence beside them already says what the state is. Announcing "illustration
 * of a calendar" to a screen reader adds noise to a complete message.
 */
const SOURCES = {
  jobs: "/illustrations/empty-jobs.svg",
  leads: "/illustrations/empty-leads.svg",
  money: "/illustrations/empty-money.svg",
  stock: "/illustrations/empty-stock.svg",
  assets: "/illustrations/empty-assets.svg",
  gst: "/illustrations/empty-gst.svg",
  contracts: "/illustrations/empty-contracts.svg",
  offline: "/illustrations/error-offline.svg",
  dispatch: "/illustrations/hero-dispatch.svg",
} as const;

export type IllustrationName = keyof typeof SOURCES;

export function Illustration({
  name,
  className,
  /** Rendered box width in px. Height follows the file's own aspect ratio. */
  width = 200,
}: {
  name: IllustrationName;
  className?: string;
  width?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see note above
    <img
      src={SOURCES[name]}
      // Decorative: the adjacent sentence is the message.
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={cn("h-auto w-full", className)}
      style={{ maxWidth: width }}
    />
  );
}
