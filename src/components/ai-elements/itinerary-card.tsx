/**
 * @fileoverview Day-wise itinerary card with hotels and booking links.
 * Renders parsed JSON from the AI itinerary builder – polished UI, not raw AI output.
 */

"use client";

import { useState } from "react";
import {
  CalendarIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MapPinIcon,
  SunIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ItineraryActivity = {
  time?: string;
  title: string;
  description?: string;
  location?: string;
};

export type ItineraryHotel = {
  name: string;
  address?: string;
  bookingUrl?: string;
  bookingUrls?: string[];
};

export type ItineraryDay = {
  dayNumber: number;
  title?: string;
  date?: string;
  summary?: string;
  activities?: ItineraryActivity[];
  hotel?: ItineraryHotel;
};

export type ItineraryJson = {
  destination?: string;
  overview?: string;
  flightBookingUrls?: string[];
  days: ItineraryDay[];
};

export type ItineraryCardProps = {
  data: ItineraryJson;
  className?: string;
};

/** Build search URLs from destination (same pattern as hotel booking URLs) */
function bookingUrlsForDestination(destination: string): {
  flights: { label: string; url: string }[];
  accommodation: { label: string; url: string }[];
  food: { label: string; url: string }[];
} {
  const q = encodeURIComponent(destination);
  const qRestaurants = encodeURIComponent(`${destination} restaurants`);
  const slug = destination.replace(/[,\s]+/g, "-").toLowerCase().replace(/^-|-$/g, "") || "paris";
  return {
    flights: [
      { label: "Google Flights", url: `https://www.google.com/travel/flights?q=Flights%20to%20${q}` },
      { label: "Skyscanner", url: `https://www.skyscanner.com/transport/flights-to/${slug}/` },
      { label: "Kayak", url: `https://www.kayak.com/flights/to-${slug}` },
    ],
    accommodation: [
      { label: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${q}` },
      { label: "Hotels.com", url: `https://www.hotels.com/search.do?destination=${q}` },
      { label: "Expedia", url: `https://www.expedia.com/Hotel-Search?destination=${q}` },
    ],
    food: [
      { label: "TripAdvisor", url: `https://www.tripadvisor.com/Search?q=${qRestaurants}` },
      { label: "OpenTable", url: `https://www.opentable.com/s?query=${q}` },
      { label: "Yelp", url: `https://www.yelp.com/search?find_desc=restaurants&find_loc=${q}` },
    ],
  };
}

function resolveDestination(data: ItineraryJson): string {
  const d = data.destination?.trim();
  if (d) return d;
  const days = Array.isArray(data.days) ? data.days : [];
  const first = days[0];
  if (first?.hotel?.name) return first.hotel.name;
  if (first?.activities?.[0]?.location) return first.activities[0].location;
  if (first?.title) return first.title;
  return "Paris";
}

/** Same style as "Where to stay" hotel block – one box with title + 2–3 booking links */
function BookingLinksBlock({
  title,
  subtitle,
  links,
}: {
  title: string;
  subtitle: string;
  links: { label: string; url: string }[];
}) {
  return (
    <div className="rounded-lg border-2 border-dashed border-primary/20 bg-primary/5 p-4">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {links.map(({ label, url }, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              {label}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ItineraryCard({ data, className }: ItineraryCardProps) {
  const { destination, overview, days } = data;
  const validDays = Array.isArray(days) ? days.filter((d) => d?.dayNumber) : [];
  const dest = resolveDestination(data);
  const booking = bookingUrlsForDestination(dest);

  return (
    <Card className={cn("overflow-hidden shadow-md", className)}>
      <CardHeader className="border-b bg-gradient-to-b from-muted/40 to-muted/20">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-xl border-2 border-primary/20 bg-background shadow-sm">
            <CalendarIcon aria-hidden="true" className="size-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">
              {destination ? `${destination} Itinerary` : "Your Itinerary"}
            </CardTitle>
            <CardDescription>
              {validDays.length} day{validDays.length !== 1 ? "s" : ""}
              {overview ? " · Overview included" : ""}
            </CardDescription>
          </div>
        </div>
        {overview && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {overview}
          </p>
        )}
      </CardHeader>
      <CardContent className="divide-y p-0">
      {/* Flights, Accommodation, Food & dining – same UI as "Where to stay" hotel block, always shown */}
      <div className="space-y-4 p-5 sm:p-6">
        <BookingLinksBlock
          title="Flights"
          subtitle="US$1,500.00 · Round-trip from major cities"
          links={booking.flights}
        />
        <BookingLinksBlock
          title="Accommodation"
          subtitle={`US$10,000.00 · Mid-range hotels for ${validDays.length || 5} nights`}
          links={booking.accommodation}
        />
        <BookingLinksBlock
          title="Food & dining"
          subtitle="Local restaurants and experiences"
          links={booking.food}
        />
      </div>
        {validDays.map((day) => (
          <DaySection key={day.dayNumber} day={day} />
        ))}
      </CardContent>
    </Card>
  );
}

function DaySection({ day }: { day: ItineraryDay }) {
  const [open, setOpen] = useState(true);
  const { dayNumber, title, date, summary, activities, hotel } = day;
  const hasActivities = Array.isArray(activities) && activities.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="transition-colors hover:bg-muted/20">
        <CollapsibleTrigger className="flex w-full items-start gap-4 p-5 text-left sm:p-6 [&[data-state=open]>div:first-child]:rotate-90">
          <div className="mt-0.5 shrink-0 text-muted-foreground transition-transform">
            <ChevronRightIcon className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/5 text-sm font-semibold tabular-nums text-primary">
              {dayNumber}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">
                Day {dayNumber}
                {title ? ` · ${title}` : ""}
              </h3>
              {date && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SunIcon className="size-3.5" />
                  {date}
                </p>
              )}
              {summary && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {summary}
                </p>
              )}
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t px-5 pb-5 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
            {/* Activities */}
            {hasActivities && (
              <div className="space-y-3 pt-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Activities
                </h4>
                <ul className="space-y-2">
                  {activities!.map((act, idx) => (
                    <li
                      key={idx}
                      className="flex gap-3 rounded-lg border bg-background/80 p-3 transition-shadow hover:shadow-sm"
                    >
                      {act.time && (
                        <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                          {act.time}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{act.title}</p>
                        {act.description && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {act.description}
                          </p>
                        )}
                        {act.location && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPinIcon className="size-3.5 shrink-0" />
                            {act.location}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Hotel with 2–3 booking links */}
            {hotel?.name && (
              <div className="rounded-lg border-2 border-dashed border-primary/20 bg-primary/5 p-4">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Where to stay
                </h4>
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="font-medium">{hotel.name}</p>
                    {hotel.address && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5 shrink-0" />
                        {hotel.address}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(hotel.bookingUrls?.length ? hotel.bookingUrls : hotel.bookingUrl ? [hotel.bookingUrl] : [])
                      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
                      .slice(0, 3)
                      .map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                        >
                          {i === 0 ? "Booking.com" : i === 1 ? "Hotels.com" : "Expedia"}
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
