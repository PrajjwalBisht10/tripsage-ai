/**
 * @fileoverview AI itinerary builder demo page – wired to ROUTES.userItinerary.
 * Describe the vibe, constraints, and must‑dos. TripSage turns it into an itinerary you can refine.
 */

"use client";

import {
  CalendarIcon,
  CompassIcon,
  Loader2Icon,
  MapPinIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ItineraryCard,
  type ItineraryJson,
} from "@/components/ai-elements/itinerary-card";
import { saveGeneration } from "@/lib/generations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MAIN_CONTENT_ID } from "@/lib/a11y/landmarks";
import { cn } from "@/lib/utils";

const QUICK_SUGGESTIONS = [
  "Paris",
  "5 days",
  "beaches",
  "museums",
  "food tours",
  "relaxed",
  "culture",
  "local food",
] as const;

const BUILDING_STEPS = [
  { icon: CompassIcon, label: "Understanding your preferences" },
  { icon: MapPinIcon, label: "Researching destinations" },
  { icon: CalendarIcon, label: "Building day-by-day plan" },
  { icon: SparklesIcon, label: "Adding hotels & activities" },
] as const;

function ItineraryBuildingLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % BUILDING_STEPS.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[280px] overflow-hidden rounded-xl border-2 border-primary/20 bg-gradient-to-b from-muted/30 to-muted/10 shadow-lg">
      <div className="flex flex-col items-center justify-center gap-8 p-10">
        <div className="relative">
          <div className="absolute -inset-4 animate-pulse rounded-full bg-primary/10" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl border-2 border-primary/30 bg-background shadow-md">
            <CompassIcon className="size-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="space-y-4 text-center">
          <h3 className="text-lg font-semibold">Building your itinerary</h3>
          <div className="flex items-center justify-center gap-2">
            <span className="inline-block size-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="inline-block size-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
            <span className="inline-block size-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
          </div>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          {BUILDING_STEPS.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300",
                i === step
                  ? "border-primary/40 bg-primary/10 shadow-sm"
                  : "border-muted bg-background/50"
              )}
            >
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg transition-colors",
                  i === step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="size-4" />
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  i === step ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {i === step && (
                <div className="ml-auto">
                  <div className="size-2 animate-pulse rounded-full bg-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ParseResult =
  | { kind: "itinerary"; data: ItineraryJson }
  | { kind: "notTravelRelated"; message: string }
  | { kind: "error" };

/**
 * Extracts and parses JSON from AI response. Handles markdown code blocks, truncated JSON,
 * and notTravelRelated validation response.
 */
function parseItineraryResponse(raw: string): ParseResult {
  let text = raw.trim();
  if (!text) return { kind: "error" };
  // Strip markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1].trim();
  // Extract JSON object: find first { and try to parse
  const startIdx = text.indexOf("{");
  if (startIdx >= 0) text = text.slice(startIdx);

  const tryParse = (str: string): ParseResult => {
    try {
      const parsed = JSON.parse(str) as unknown;
      if (!parsed || typeof parsed !== "object") return { kind: "error" };
      const obj = parsed as Record<string, unknown>;
      if (obj.notTravelRelated === true && typeof obj.message === "string") {
        return { kind: "notTravelRelated", message: obj.message };
      }
      if (
        Array.isArray((parsed as ItineraryJson).days) &&
        (parsed as ItineraryJson).days.length > 0
      ) {
        return { kind: "itinerary", data: parsed as ItineraryJson };
      }
    } catch {
      // Fall through
    }
    return { kind: "error" };
  };

  let result = tryParse(text);
  if (result.kind !== "error") return result;

  // Try to repair truncated JSON: find last complete day object and close structure
  const daysArrayStart = text.indexOf('"days"');
  if (daysArrayStart >= 0) {
    const bracketStart = text.indexOf("[", daysArrayStart);
    if (bracketStart >= 0) {
      let depth = 0;
      let inString = false;
      let stringChar = "";
      let escape = false;
      let lastClosedDayEnd = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\" && inString) {
          escape = true;
          continue;
        }
        if ((c === '"' || c === "'") && !escape) {
          if (!inString) {
            inString = true;
            stringChar = c;
          } else if (c === stringChar) {
            inString = false;
          }
          continue;
        }
        if (!inString) {
          if (c === "{" || c === "[") depth++;
          if (c === "}" || c === "]") {
            if (c === "}" && depth === 3) lastClosedDayEnd = i;
            depth--;
          }
        }
      }
      if (lastClosedDayEnd > 0) {
        const repaired = text.slice(0, lastClosedDayEnd + 1) + "]}";
        result = tryParse(repaired);
        if (result.kind !== "error") return result;
      }
    }
  }

  return { kind: "error" };
}

const ITINERARY_JSON_SCHEMA = `
{
  "destination": "string (e.g. Paris, France)",
  "overview": "string (brief 1–2 sentence trip summary)",
  "flightBookingUrls": ["string (2-3 valid URLs: e.g. Google Flights, Skyscanner, Kayak search links for the destination)"],
  "days": [
    {
      "dayNumber": 1,
      "title": "string (e.g. Arrival & Historic Center)",
      "date": "optional string",
      "summary": "optional string (day summary)",
      "activities": [
        {
          "time": "string (e.g. 10:00)",
          "title": "string",
          "description": "optional string",
          "location": "optional string"
        }
      ],
      "hotel": {
        "name": "string (actual or plausible hotel name)",
        "address": "optional string",
        "bookingUrl": "string (primary booking link)",
        "bookingUrls": ["string (2-3 URLs: Booking.com, Hotels.com, Expedia for this property/destination)"]
      }
    }
  ]
}`;

/**
 * Builds the system prompt for the itinerary builder.
 * Instructs AI to return ONLY valid JSON with day-wise itinerary, hotels, and booking links.
 */
function buildItineraryPrompt(userWords: string): string {
  const trimmed = userWords.trim();
  if (!trimmed) return trimmed;

  return `You are a travel planning expert. The user has shared words and phrases related to their dream trip. Create a personalized, day-by-day itinerary.

CRITICAL: You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no extra text. Use this exact schema:
${ITINERARY_JSON_SCHEMA}

Requirements:
- Infer destination, duration, interests, pace, and budget from the user's input.
- Include flightBookingUrls: 2-3 real booking/search URLs for flights (e.g. Google Flights, Skyscanner, Kayak - use search URLs for the destination).
- For each day include hotel with name, address, bookingUrl (primary), and bookingUrls array with 2-3 links (Booking.com, Hotels.com, Expedia) for that property or destination.
- Each day must have activities with time, title, and optional description/location.
- Keep overview concise. Make it actionable and realistic.

IMPORTANT – Return notTravelRelated ONLY when input is clearly unrelated to travel (e.g. "cricket" alone, "chess" alone, "weather" alone). When in doubt, generate an itinerary.
IS travel-related (always generate itinerary): food tours, culinary tours, local food, street food, culture, local experiences, beaches, museums, wine tasting, any destination, trip duration, travel style, activities, anything about where to go or how to travel.

User's travel preferences and keywords:
---
${trimmed}
---`;
}

/**
 * Render the AI itinerary builder demo page.
 *
 * Header with feature name and description, then input for travel-related words.
 * Submits to `/api/ai/stream` and streams the response.
 *
 * @returns The demo page component.
 */
export default function UserItineraryPage() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedOutputRef = useRef<string>("");
  const submitStatus = error ? "error" : isLoading ? "submitted" : undefined;

  // Persist successful itinerary to DB for Overview and Calendar plan "Load last"
  useEffect(() => {
    if (isLoading || !output) return;
    const parsed = parseItineraryResponse(output);
    if (parsed.kind !== "itinerary" || output === lastSavedOutputRef.current) return;
    lastSavedOutputRef.current = output;
    const title = `${parsed.data.destination?.trim() || "Trip"} Itinerary`;
    saveGeneration({ type: "itinerary", title, payload: parsed.data }).catch(() => {});
  }, [output, isLoading]);

  const addSuggestion = useCallback((word: string) => {
    setInput((prev) => (prev ? `${prev}, ${word}` : word));
  }, []);

  const logTelemetry = useCallback((status: "success" | "error", detail?: string) => {
    (async () => {
      try {
        await fetch("/api/telemetry/ai-demo", {
          body: JSON.stringify({ detail, status }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
      } catch {
        // Ignore telemetry failures
      }
    })();
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      const prompt = buildItineraryPrompt(trimmed);
      if (!prompt.trim()) return;

      setIsLoading(true);
      setInput("");
      setOutput("");
      setError(null);
      try {
        const res = await fetch("/api/ai/stream", {
          body: JSON.stringify({
            prompt,
            desiredMaxTokens: 4096,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Response body is not available");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let shouldStop = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const lines = evt.split("\n");
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (!data) continue;
              if (data === "[DONE]") {
                shouldStop = true;
                break;
              }
              try {
                const payload = JSON.parse(data) as { type?: string; delta?: string };
                if (
                  payload.type === "text-delta" &&
                  typeof payload.delta === "string"
                ) {
                  setOutput((prev) => prev + payload.delta);
                }
              } catch {
                // Ignore malformed chunks
              }
            }
            if (shouldStop) break;
          }
          if (shouldStop) break;
        }
        logTelemetry("success");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(`Failed to stream response: ${errorMessage}`);
        logTelemetry("error", errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [input, logTelemetry]
  );

  return (
    <main id={MAIN_CONTENT_ID} className="flex min-h-[60vh] flex-col" tabIndex={-1}>
      <MarketingContainer className="py-10 sm:py-14">
        {/* Header: feature name + description */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/50 text-highlight">
              <CompassIcon aria-hidden="true" className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              AI Itinerary Builder
            </h1>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Describe the vibe, constraints, and must‑dos. TripSage turns it into an
            itinerary you can refine.
          </p>
        </header>

        {/* Input prompt */}
        <div className="mt-8 space-y-4">
          <p className="text-sm font-medium text-muted-foreground">
            What are you dreaming of? Add a few words to get started.
          </p>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="relative min-w-0 flex-1">
              <Input
                id="itinerary-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paris, beaches, museums, 5 days..."
                disabled={isLoading}
                className="h-11 rounded-xl border-2 bg-background/80 pr-12 shadow-sm transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 sm:h-12"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="absolute right-1 top-1/2 size-9 -translate-y-1/2 rounded-lg sm:size-10"
              >
                {submitStatus === "submitted" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-4" />
                )}
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {QUICK_SUGGESTIONS.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => addSuggestion(word)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
                  "hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                )}
              >
                {word}
              </button>
            ))}
          </div>
        </div>

        {/* Response area */}
        {(output || error || isLoading) && (
          <div className="mt-8">
            {error ? (
              <div className="text-destructive rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
                <strong>Error:</strong> {error}
              </div>
            ) : (
              <>
                {(() => {
                  if (isLoading) {
                    return <ItineraryBuildingLoader />;
                  }
                  const parsed = parseItineraryResponse(output);
                  if (parsed.kind === "itinerary") {
                    return <ItineraryCard data={parsed.data} />;
                  }
                  if (parsed.kind === "notTravelRelated") {
                    return (
                      <div className="overflow-hidden rounded-xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-50 to-amber-100/50 shadow-md dark:border-amber-800/50 dark:from-amber-950/40 dark:to-amber-900/20">
                        <div className="flex gap-4 p-6">
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-amber-300/50 bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/50">
                            <MapPinIcon className="size-6 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-3">
                            <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                              {parsed.message}
                            </h3>
                            <p className="text-sm text-amber-800/90 dark:text-amber-200/90">
                              Try adding words like:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                "Paris",
                                "5 days",
                                "beaches",
                                "museums",
                                "relaxed",
                                "adventure",
                                "food tours",
                                "budget-friendly",
                              ].map((example) => (
                                <span
                                  key={example}
                                  className="inline-flex rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200"
                                >
                                  {example}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        The response couldn&apos;t be displayed as an itinerary. It may have been
                        incomplete. Please try again with fewer days or a shorter trip.
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </MarketingContainer>
    </main>
  );
}
