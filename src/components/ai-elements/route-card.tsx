/**
 * @fileoverview Location-aware route card: ordered stops, neighborhood groups, and map.
 * Uses OpenStreetMap + Leaflet (no API key or billing required).
 */

"use client";

import {
  ExternalLinkIcon,
  MapPinIcon,
  RouteIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type L from "leaflet";
import "leaflet/dist/leaflet.css";

export type RouteStop = {
  order: number;
  name: string;
  neighborhood?: string;
  address?: string;
};

export type NeighborhoodGroup = {
  name: string;
  stopIndices?: number[];
};

export type RouteJson = {
  destination?: string;
  summary?: string;
  orderedStops: RouteStop[];
  neighborhoodGroups?: NeighborhoodGroup[];
};

export type RouteCardProps = {
  data: RouteJson;
  className?: string;
};

/** Google Maps directions URL (no API key needed for opening the link) */
function buildGoogleMapsDirectionsUrl(
  destination: string,
  stops: RouteStop[]
): string {
  const base = "https://www.google.com/maps/dir";
  const segments = stops.map((s) => encodeURIComponent(s.name));
  if (segments.length === 0) return `${base}/${encodeURIComponent(destination)}`;
  return `${base}/${segments.join("/")}`;
}

/** OpenStreetMap search URL for the destination area */
function buildOpenStreetMapUrl(destination: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`;
}

const NOMINATIM_USER_AGENT = "TripSage/1.0 (https://tripsage.ai; route planner)";

/** Geocode using Nominatim (OpenStreetMap). Respects 1 req/sec policy. */
async function nominatimGeocode(
  query: string,
  delayMs: number
): Promise<{ lat: number; lng: number } | null> {
  await new Promise((r) => setTimeout(r, delayMs));
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = data?.[0];
  if (!first) return null;
  const lat = Number.parseFloat(first.lat);
  const lng = Number.parseFloat(first.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Client-only map: Leaflet + OpenStreetMap tiles, Nominatim geocoding (no API key) */
function RouteMap({
  destination,
  stops,
  className,
}: {
  destination: string;
  stops: RouteStop[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || stops.length === 0) return;

    let cancelled = false;

    const run = async () => {
      const L = await import("leaflet");
      if (!containerRef.current || cancelled) return;

      // Fix default marker icon when bundled (Next.js/webpack)
      const DefaultIcon = L.Icon.Default;
      if (DefaultIcon?.prototype && !(DefaultIcon.prototype as unknown as { _urlFixed?: boolean })._urlFixed) {
        DefaultIcon.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });
        (DefaultIcon.prototype as unknown as { _urlFixed?: boolean })._urlFixed = true;
      }

      try {
        const coords: Array<{ lat: number; lng: number }> = [];
        for (let i = 0; i < stops.length; i++) {
          if (cancelled) return;
          const query = `${stops[i].name}, ${destination}`.trim();
          const c = await nominatimGeocode(query, i * 1100);
          if (c) coords.push(c);
        }
        if (coords.length === 0 || cancelled) {
          setMapError("Could not locate places");
          return;
        }
        if (!containerRef.current || cancelled) return;

        const map = L.map(containerRef.current).setView(
          [coords[0].lat, coords[0].lng],
          13
        );
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [24, 24] });

        coords.forEach((c, i) => {
          L.marker([c.lat, c.lng])
            .addTo(map)
            .bindTooltip(stops[i]?.name ?? `Stop ${i + 1}`, {
              permanent: false,
              direction: "top",
            });
        });

        if (coords.length >= 2) {
          L.polyline(coords.map((c) => [c.lat, c.lng] as L.LatLngTuple), {
            color: "#2563eb",
            weight: 4,
            opacity: 0.9,
          }).addTo(map);
        }
      } catch (e) {
        setMapError(e instanceof Error ? e.message : "Map error");
      }
    };

    run();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [destination, stops]);

  if (mapError) {
    return (
      <div
        className={cn(
          "flex h-[280px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground",
          className
        )}
      >
        {mapError}
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className={cn("h-[280px] w-full rounded-lg border bg-muted/20", className)}
      aria-label="Route map (OpenStreetMap)"
    />
  );
}

export function RouteCard({ data, className }: RouteCardProps) {
  const { destination, summary, orderedStops, neighborhoodGroups } = data;
  const stops = Array.isArray(orderedStops)
    ? orderedStops
        .filter((s) => s?.name)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [];
  const hasStops = stops.length > 0;
  const mapsUrl = hasStops && destination ? buildGoogleMapsDirectionsUrl(destination, stops) : null;

  return (
    <Card className={cn("overflow-hidden shadow-md", className)}>
      <CardHeader className="border-b bg-gradient-to-b from-muted/40 to-muted/20">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl border-2 border-primary/20 bg-background shadow-sm">
            <RouteIcon aria-hidden="true" className="size-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">
              {destination ? `${destination} route` : "Your route"}
            </CardTitle>
            <CardDescription>
              {stops.length} stop{stops.length !== 1 ? "s" : ""}
              {summary ? " · Optimized order" : ""}
            </CardDescription>
          </div>
        </div>
        {summary && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Open in Google Maps
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
          {destination && (
            <a
              href={buildOpenStreetMapUrl(destination)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Open in OpenStreetMap
              <ExternalLinkIcon className="size-4" />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {hasStops && (
          <>
            <div className="border-b p-5 sm:p-6">
              <h3 className="mb-3 text-sm font-semibold">Stops in order</h3>
              <ol className="space-y-2">
                {stops.map((stop, idx) => (
                  <li
                    key={idx}
                    className="flex gap-3 rounded-lg border bg-background/80 p-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold tabular-nums text-primary">
                      {stop.order ?? idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{stop.name}</p>
                      {stop.neighborhood && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <MapPinIcon className="size-3.5 shrink-0" />
                          {stop.neighborhood}
                        </p>
                      )}
                      {stop.address && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {stop.address}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {Array.isArray(neighborhoodGroups) && neighborhoodGroups.length > 0 && (
              <div className="border-b p-5 sm:p-6">
                <h3 className="mb-2 text-sm font-semibold">Neighborhoods</h3>
                <div className="flex flex-wrap gap-2">
                  {neighborhoodGroups.map((g, i) => (
                    <span
                      key={i}
                      className="rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="p-5 sm:p-6">
              <h3 className="mb-2 text-sm font-semibold">Map (OpenStreetMap)</h3>
              <RouteMap destination={destination ?? ""} stops={stops} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
