/**
 * @fileoverview Calendar-ready planning – set trip dates, attach itinerary, preview and export to .ics.
 */

"use client";

import {
  CalendarIcon,
  CloudIcon,
  DownloadIcon,
  FileJsonIcon,
  FileTextIcon,
  Loader2Icon,
  MapPinIcon,
  RefreshCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { getLastGeneration } from "@/lib/generations/actions";
import type { ItineraryDay, ItineraryJson } from "@/components/ai-elements/itinerary-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MAIN_CONTENT_ID } from "@/lib/a11y/landmarks";
import { itineraryToCalendarEvents } from "@/lib/calendar/itinerary-to-events";
import { DateUtils } from "@/lib/dates/unified-date-utils";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

function parseItineraryJson(raw: string): ItineraryJson | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const text = trimmed.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const start = text.indexOf("{");
    if (start < 0) return null;
    const parsed = JSON.parse(text.slice(start)) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as ItineraryJson).days)) {
      return null;
    }
    return parsed as ItineraryJson;
  } catch {
    return null;
  }
}

function formatDayDate(tripStartIso: string, dayNumber: number): string {
  const d = DateUtils.add(DateUtils.parse(tripStartIso), dayNumber - 1, "days");
  return DateUtils.format(d, "EEE, MMM d, yyyy");
}

export default function CalendarPlanPage() {
  const [tripStartIso, setTripStartIso] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return DateUtils.format(d, "yyyy-MM-dd");
  });
  const [itineraryJsonRaw, setItineraryJsonRaw] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingToGoogle, setIsSyncingToGoogle] = useState(false);
  const [googleNotRegisteredOpen, setGoogleNotRegisteredOpen] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [isLoadingLast, setIsLoadingLast] = useState(false);

  const loadLastItinerary = useCallback(async () => {
    setIsLoadingLast(true);
    try {
      const last = await getLastGeneration("itinerary");
      if (last?.payload) {
        setItineraryJsonRaw(JSON.stringify(last.payload, null, 2));
      }
    } finally {
      setIsLoadingLast(false);
    }
  }, []);

  const itinerary = parseItineraryJson(itineraryJsonRaw);
  const days = itinerary?.days ?? [];
  const validDays = days.filter((d): d is ItineraryDay => Boolean(d?.dayNumber));
  const canExport = tripStartIso && validDays.length > 0;

  const handleExport = useCallback(async () => {
    if (!canExport || !itinerary) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const events = itineraryToCalendarEvents(itinerary, tripStartIso);
      const calendarName = `${itinerary.destination?.trim() || "Trip"} – TripSage`;
      const res = await fetch("/api/calendar/ics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarName,
          events,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        let msg = `Export failed (${res.status})`;
        try {
          const j = JSON.parse(errBody) as { reason?: string };
          if (j.reason) msg = j.reason;
        } catch {
          if (errBody) msg = errBody.slice(0, 120);
        }
        setExportError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${calendarName.replace(/[^a-z0-9]+/gi, "_")}.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [canExport, itinerary, tripStartIso]);

  const handleExportPdf = useCallback(async () => {
    if (!canExport || !itinerary) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const events = itineraryToCalendarEvents(itinerary, tripStartIso);
      const calendarName = `${itinerary.destination?.trim() || "Trip"} – TripSage`;
      const res = await fetch("/api/calendar/pdf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarName, events }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        let msg = `Export failed (${res.status})`;
        try {
          const j = JSON.parse(errBody) as { reason?: string };
          if (j.reason) msg = j.reason;
        } catch {
          if (errBody) msg = errBody.slice(0, 120);
        }
        setExportError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${calendarName.replace(/[^a-z0-9]+/gi, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [canExport, itinerary, tripStartIso]);

  const handleSyncToGoogle = useCallback(async () => {
    if (!canExport || !itinerary) return;
    setIsSyncingToGoogle(true);
    setExportError(null);
    setSyncSuccessMessage(null);
    try {
      const events = itineraryToCalendarEvents(itinerary, tripStartIso);
      const calendarName = `${itinerary.destination?.trim() || "Trip"} – TripSage`;
      const res = await fetch("/api/calendar/google/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarName, events }),
      });
      const body = await res.json().catch(() => ({})) as {
        reason?: string;
        synced?: number;
        detail?: string;
      };
      if (res.status === 403 && body.reason) {
        setGoogleNotRegisteredOpen(true);
        return;
      }
      if (!res.ok) {
        const msg = body.reason ?? `Sync failed (${res.status})`;
        setExportError(body.detail ? `${msg}: ${body.detail}` : msg);
        return;
      }
      const count = body.synced ?? events.length;
      setSyncSuccessMessage(`${count} event${count !== 1 ? "s" : ""} added to Google Calendar.`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setIsSyncingToGoogle(false);
    }
  }, [canExport, itinerary, tripStartIso]);

  return (
    <main id={MAIN_CONTENT_ID} className="flex min-h-[60vh] flex-col" tabIndex={-1}>
      <MarketingContainer className="py-10 sm:py-14">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/50 text-highlight">
              <CalendarIcon aria-hidden className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Calendar plan
            </h1>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Set your trip start date and paste an itinerary from the{" "}
            <Link href={ROUTES.userItinerary} className="underline hover:no-underline">
              Itinerary builder
            </Link>
            . Preview your dated schedule and export to .ics for Google Calendar, Apple Calendar, or Outlook.
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr,1fr]">
          {/* Left: form */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarIcon className="size-5" />
                  Trip dates
                </CardTitle>
                <CardDescription>Start date of your trip (Day 1).</CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="trip-start">Trip start date</Label>
                <Input
                  id="trip-start"
                  type="date"
                  value={tripStartIso}
                  onChange={(e) => setTripStartIso(e.target.value)}
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileJsonIcon className="size-5" />
                  Itinerary JSON
                </CardTitle>
                <CardDescription>
                  Paste the itinerary JSON from the Itinerary builder, or load your last generated itinerary.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoadingLast}
                  onClick={loadLastItinerary}
                >
                  {isLoadingLast ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-4" />
                  )}
                  Load last itinerary
                </Button>
                <textarea
                  aria-label="Itinerary JSON"
                  className={cn(
                    "min-h-[180px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono",
                    "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  placeholder='{"destination": "Paris", "days": [{ "dayNumber": 1, "title": "Arrival", "activities": [...] }]}'
                  value={itineraryJsonRaw}
                  onChange={(e) => setItineraryJsonRaw(e.target.value)}
                />
                {itineraryJsonRaw && !itinerary && (
                  <p className="mt-2 text-sm text-destructive">Invalid JSON or missing &quot;days&quot; array.</p>
                )}
                {itinerary && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {validDays.length} day{validDays.length !== 1 ? "s" : ""} loaded.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!canExport || isExporting}
                onClick={handleExport}
              >
                {isExporting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <DownloadIcon className="size-4" />
                )}
                Export .ics
              </Button>
              <Button
                variant="outline"
                disabled={!canExport || isExporting}
                onClick={handleExportPdf}
              >
                {isExporting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FileTextIcon className="size-4" />
                )}
                Export PDF
              </Button>
              <Button
                variant="outline"
                disabled={!canExport || isExporting || isSyncingToGoogle}
                onClick={handleSyncToGoogle}
              >
                {isSyncingToGoogle ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CloudIcon className="size-4" />
                )}
                Sync to Google Calendar
              </Button>
              {exportError && (
                <span className="text-sm text-destructive">{exportError}</span>
              )}
              {syncSuccessMessage && (
                <span className="text-sm text-green-600 dark:text-green-400">{syncSuccessMessage}</span>
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Preview by day</h2>
            {validDays.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Set a start date and paste itinerary JSON to see your schedule.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {validDays.map((day) => (
                  <Card key={day.dayNumber}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        Day {day.dayNumber} · {formatDayDate(tripStartIso, day.dayNumber)}
                      </CardTitle>
                      {day.title && (
                        <CardDescription>{day.title}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {day.hotel?.name && (
                        <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span>
                            <strong>Stay:</strong> {day.hotel.name}
                          </span>
                        </div>
                      )}
                      {Array.isArray(day.activities) &&
                        day.activities.map((act, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                          >
                            <span className="shrink-0 font-medium text-muted-foreground">
                              {act.time ?? "—"}
                            </span>
                            <div>
                              <span className="font-medium">{act.title}</span>
                              {act.location && (
                                <span className="text-muted-foreground"> · {act.location}</span>
                              )}
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </MarketingContainer>

      <Dialog open={googleNotRegisteredOpen} onOpenChange={setGoogleNotRegisteredOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not signed in with Google</DialogTitle>
            <DialogDescription>
              To sync events to Google Calendar, sign in with your Google account. You can sign up or log in using Google from the login page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoogleNotRegisteredOpen(false)}>
              Close
            </Button>
            <Button asChild>
              <Link href={ROUTES.login} onClick={() => setGoogleNotRegisteredOpen(false)}>
                Go to Log in
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
