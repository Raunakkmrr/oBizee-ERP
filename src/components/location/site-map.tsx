"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CENTRE,
  MAP_PROVIDER,
  formatLatLng,
  withinIndia,
  type LatLng,
} from "@/lib/data/geo";

/**
 * Drop a pin on the site — the map half of capturing a location.
 *
 * **Loaded on demand, never on page load.** MapLibre is ~800 kB of JavaScript
 * and tiles are a network round trip; a coordinator taking a call on a hotspot
 * should not pay for either unless she is actually placing a pin. So the map
 * is behind a button, the library is a dynamic `import()`, and the form is
 * fully usable if it never opens.
 *
 * **It fails soft.** No tiles, no network, a provider outage — the panel says
 * so and the typed address underneath is still the record. A map that blocks a
 * lead being saved would be worse than no map.
 */
export function SiteMap({
  value,
  onChange,
  className,
}: {
  value: LatLng | null;
  onChange: (next: LatLng | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  /** Held in a ref so the effect never re-runs when the pin moves. */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!open || !container.current) return;
    let cancelled = false;
    let marker: { remove: () => void } | null = null;

    void (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        if (MAP_PROVIDER.styleUrl === null) {
          setFailed(`${MAP_PROVIDER.label} needs an API key this build does not have.`);
          return;
        }

        const start = value ?? DEFAULT_CENTRE;
        const map = new maplibre.Map({
          container: container.current,
          style: MAP_PROVIDER.styleUrl,
          center: [start.lng, start.lat],
          zoom: value ? 16 : 11,
          attributionControl: { compact: true },
        });
        mapRef.current = map as unknown as { remove: () => void };

        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

        const place = (point: LatLng) => {
          marker?.remove();
          marker = new maplibre.Marker({ color: "#d17c45" })
            .setLngLat([point.lng, point.lat])
            .addTo(map) as unknown as { remove: () => void };
        };
        if (value) place(value);

        map.on("click", (event: { lngLat: { lat: number; lng: number } }) => {
          const point = { lat: event.lngLat.lat, lng: event.lngLat.lng };
          // A pin outside India is a misclick, not a site. Refusing it here
          // stops a nonsense coordinate reaching the job sheet.
          if (!withinIndia(point)) {
            setFailed("That is outside India — tap the site itself.");
            return;
          }
          setFailed(null);
          place(point);
          onChangeRef.current(point);
        });

        map.on("error", () => {
          setFailed("Map tiles could not be loaded. The typed address still works.");
        });
      } catch {
        setFailed("The map could not start. The typed address still works.");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // `value` is read once to centre the map; re-running on every pin move
    // would tear the map down mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** The browser's own position — useful when the technician is already there. */
  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setFailed("This browser will not share a location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        if (!withinIndia(point)) {
          setFailed("Your location is outside India — drop the pin by hand.");
          return;
        }
        setFailed(null);
        onChangeRef.current(point);
        setOpen(true);
      },
      () => {
        setLocating(false);
        setFailed("Location was refused. Drop the pin by hand instead.");
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((was) => !was)}
        >
          <MapPin className="size-3.5" />
          {open ? "Hide map" : value ? "Move the pin" : "Drop a pin on the map"}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locating}
          onClick={useMyLocation}
        >
          <Crosshair className="size-3.5" />
          {locating ? "Finding you…" : "Use my location"}
        </Button>

        {value ? (
          <>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatLatLng(value)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChangeRef.current(null)}
            >
              Clear pin
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Optional — the landmark below is what actually gets them there
          </span>
        )}
      </div>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-xl">
          <div
            ref={container}
            role="application"
            aria-label="Site location map — tap the site to drop a pin"
            className="h-64 w-full bg-muted"
          />
          <p className="bg-muted-bg px-3 py-1.5 text-[11px] text-muted-foreground">
            Tap the building to place the pin &middot; {MAP_PROVIDER.attribution}
          </p>
        </div>
      ) : null}

      {failed ? (
        // Stated, never silent — and never blocking, because the address is
        // the record and the map is the convenience.
        <p role="status" className="mt-1.5 text-xs text-warning">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
