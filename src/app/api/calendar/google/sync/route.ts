/**
 * @fileoverview Sync calendar events to the user's Google Calendar (primary).
 * Requires the user to be signed in with Google so the provider token is available.
 */

import "server-only";

import type { CalendarEvent, CreateEventRequest, EventDateTime } from "@schemas/calendar";
import { type IcsExportRequest, icsExportRequestSchema } from "@schemas/calendar";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { GoogleTokenError } from "@/lib/calendar/auth";
import { createEvent, GoogleCalendarApiError } from "@/lib/calendar/google";
import { withApiGuards } from "@/lib/api/factory";

/** Ensure dateTime is a Date so createEvent can call .toISOString(). */
function normalizeDateTime(dt: EventDateTime): EventDateTime {
  const dateTime =
    dt.dateTime instanceof Date
      ? dt.dateTime
      : typeof dt.dateTime === "string"
        ? new Date(dt.dateTime)
        : undefined;
  return {
    ...dt,
    ...(dateTime !== undefined ? { dateTime } : {}),
  };
}

function toCreateEventRequest(event: CalendarEvent): CreateEventRequest {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: normalizeDateTime(event.start),
    end: normalizeDateTime(event.end),
    timeZone: event.start.timeZone ?? event.end.timeZone,
  };
}

export const POST = withApiGuards({
  auth: true,
  degradedMode:
    process.env.NODE_ENV === "development" ? "fail_open" : undefined,
  rateLimit: "calendar:google:sync",
  schema: icsExportRequestSchema,
  telemetry: "calendar.google.sync",
})(async (_req: NextRequest, _context, validated: IcsExportRequest): Promise<NextResponse> => {
  const { createServerLogger } = await import("@/lib/telemetry/logger");
  const log = createServerLogger("api.calendar.google.sync");

  try {
    // Ensure Google provider token exists (user must have signed in with Google)
    const { getGoogleProviderToken } = await import("@/lib/calendar/auth");
    await getGoogleProviderToken();
  } catch (error) {
    if (error instanceof GoogleTokenError) {
      return NextResponse.json(
        {
          reason:
            "Not signed in with Google. Please sign in with Google to sync events to your Google Calendar.",
        },
        { status: 403 }
      );
    }
    throw error;
  }

  const events = validated.events;
  let synced = 0;

  for (const event of events) {
    try {
      const payload = toCreateEventRequest(event);
      await createEvent(payload, "primary");
      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isGoogleApiError = err instanceof GoogleCalendarApiError;
      log.error("Failed to create event in Google Calendar", {
        summary: event.summary,
        error: message,
        statusCode: isGoogleApiError ? err.statusCode : undefined,
      });
      const reason =
        isGoogleApiError && err.statusCode === 403
          ? "Calendar access not granted. Please sign in with Google and allow calendar access."
          : isGoogleApiError && err.statusCode === 401
            ? "Google sign-in expired. Please sign in again with Google."
            : "Failed to add some events to Google Calendar. Please try again.";
      return NextResponse.json(
        {
          reason,
          synced,
          ...(process.env.NODE_ENV === "development" && { detail: message }),
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ synced }, { status: 200 });
});
