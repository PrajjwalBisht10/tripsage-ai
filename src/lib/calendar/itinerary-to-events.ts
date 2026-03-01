/**
 * @fileoverview Maps itinerary JSON (day-by-day plans) to calendar events for ICS export.
 * Assigns real dates from a trip start date and optional timezone.
 */

import type { ItineraryActivity, ItineraryDay, ItineraryJson } from "@/components/ai-elements/itinerary-card";
import { DateUtils } from "@/lib/dates/unified-date-utils";

/** Event shape sent to POST /api/calendar/ics/export (dateTime as ISO string). */
export interface CalendarEventExport {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_ACTIVITY_TIME = "09:00";

/**
 * Parses a time string (e.g. "10:00", "10:00 AM", "14:30") to { hours, minutes } in 24h.
 * Returns null if unparseable; uses DEFAULT_ACTIVITY_TIME components otherwise.
 */
function parseTimeString(timeStr: string | undefined): { hours: number; minutes: number } {
  if (!timeStr || typeof timeStr !== "string") {
    const [h, m] = DEFAULT_ACTIVITY_TIME.split(":").map(Number);
    return { hours: h ?? 9, minutes: m ?? 0 };
  }
  const trimmed = timeStr.trim();
  // 24h: "10:00", "14:30"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*$|:\d{2})?/);
  if (match24) {
    const hours = Math.min(23, Math.max(0, Number(match24[1])));
    const minutes = Math.min(59, Math.max(0, Number(match24[2])));
    return { hours, minutes };
  }
  // 12h: "10:00 AM", "2:30 PM"
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = Math.min(12, Math.max(1, Number(match12[1])));
    const minutes = Math.min(59, Math.max(0, Number(match12[2])));
    const pm = (match12[3] ?? "").toUpperCase() === "PM";
    if (pm && hours < 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
    return { hours, minutes };
  }
  const [h, m] = DEFAULT_ACTIVITY_TIME.split(":").map(Number);
  return { hours: h ?? 9, minutes: m ?? 0 };
}

/**
 * Builds an ISO date-time string for a given date (YYYY-MM-DD) and time.
 */
function toDateTimeISO(dateIso: string, hours: number, minutes: number, timezone?: string): string {
  const date = DateUtils.parse(dateIso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  // Include Z so the string satisfies z.iso.datetime({ offset: true }) in API validation.
  return `${year}-${month}-${day}T${h}:${m}:00.000Z`;
}

/**
 * Converts itinerary days + trip start date into calendar events for export.
 * Each activity becomes one event; hotel is added as an all-day "Accommodation" event per day when present.
 *
 * @param itinerary - Parsed itinerary with days array.
 * @param tripStartDateIso - Trip start date in YYYY-MM-DD.
 * @param timezone - Optional IANA timezone (e.g. "Europe/Paris"); used for ICS, not for date math here.
 * @param calendarName - Optional; not used in event shape, only for reference.
 * @returns Array of events suitable for POST /api/calendar/ics/export.
 */
export function itineraryToCalendarEvents(
  itinerary: ItineraryJson,
  tripStartDateIso: string,
  timezone?: string
): CalendarEventExport[] {
  const events: CalendarEventExport[] = [];
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i] as ItineraryDay | undefined;
    if (!day?.dayNumber) continue;

    const dayIndex = day.dayNumber - 1;
    const dateIso = DateUtils.format(
      DateUtils.add(DateUtils.parse(tripStartDateIso), dayIndex, "days"),
      "yyyy-MM-dd"
    );

    // Hotel as all-day event (date-only)
    if (day.hotel?.name) {
      events.push({
        summary: `Accommodation: ${day.hotel.name}`,
        description: day.hotel.address ?? undefined,
        start: { date: dateIso },
        end: { date: dateIso },
      });
    }

    const activities = Array.isArray(day.activities) ? day.activities : [];
    for (let a = 0; a < activities.length; a++) {
      const act = activities[a] as ItineraryActivity | undefined;
      if (!act?.title) continue;

      const { hours, minutes } = parseTimeString(act.time);
      const startIso = toDateTimeISO(dateIso, hours, minutes, timezone);
      const endMinutes = minutes + DEFAULT_DURATION_MINUTES;
      const endHours = hours + Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endIso = toDateTimeISO(dateIso, endHours, endMins, timezone);

      events.push({
        summary: act.title,
        description: act.description ?? undefined,
        location: act.location ?? undefined,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      });
    }

    // If the day has a title/summary but no activities, add one all-day event
    if (activities.length === 0 && (day.title || day.summary)) {
      events.push({
        summary: day.title || day.summary || `Day ${day.dayNumber}`,
        description: day.summary ?? undefined,
        start: { date: dateIso },
        end: { date: dateIso },
      });
    }
  }

  return events;
}
