/**
 * @fileoverview Location-aware route planner – user enters destination + places;
 * AI returns optimized order and neighborhood groups; map shows the route.
 */

"use client";

import {
  Loader2Icon,
  MapPinIcon,
  RouteIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  RouteCard,
  type RouteJson,
} from "@/components/ai-elements/route-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { saveGeneration } from "@/lib/generations/actions";
import { MAIN_CONTENT_ID } from "@/lib/a11y/landmarks";
import { cn } from "@/lib/utils";

const QUICK_SUGGESTIONS = [
  "Eiffel Tower, Louvre, Montmartre",
  "Shibuya, Senso-ji, teamLab",
  "Colosseum, Vatican, Trastevere",
  "Museums and cafés",
  "One day walking tour",
] as const;

const BUILDING_STEPS = [
  { icon: MapPinIcon, label: "Reading your places" },
  { icon: RouteIcon, label: "Optimizing order" },
  { icon: SparklesIcon, label: "Grouping neighborhoods" },
  { icon: MapPinIcon, label: "Preparing map" },
] as const;

type ParseResult =
  | { kind: "route"; data: RouteJson }
  | { kind: "error" };

function parseRouteResponse(raw: string): ParseResult {
  let text = raw.trim();
  if (!text) return { kind: "error" };
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1].trim();
  const startIdx = text.indexOf("{");
  if (startIdx >= 0) text = text.slice(startIdx);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { kind: "error" };
    const stops = parsed.orderedStops;
    if (!Array.isArray(stops) || stops.length === 0) return { kind: "error" };
    return {
      kind: "route",
      data: {
        destination:
          typeof parsed.destination === "string" ? parsed.destination : undefined,
        summary:
          typeof parsed.summary === "string" ? parsed.summary : undefined,
        orderedStops: stops.map((s: unknown) => {
          const o = s as Record<string, unknown>;
          return {
            order:
              typeof o.order === "number" ? o.order : 0,
            name: typeof o.name === "string" ? o.name : String(o.name ?? ""),
            neighborhood:
              typeof o.neighborhood === "string" ? o.neighborhood : undefined,
            address: typeof o.address === "string" ? o.address : undefined,
          };
        }),
        neighborhoodGroups: Array.isArray(parsed.neighborhoodGroups)
          ? (parsed.neighborhoodGroups as RouteJson["neighborhoodGroups"])
          : undefined,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

const ROUTE_JSON_SCHEMA = `
{
  "destination": "string (e.g. Paris, Tokyo)",
  "summary": "string (1–2 sentence summary: e.g. 6 stops, 2 neighborhoods, walking-friendly order)",
  "orderedStops": [
    { "order": 1, "name": "Place name", "neighborhood": "optional area name", "address": "optional" }
  ],
  "neighborhoodGroups": [
    { "name": "Neighborhood name", "stopIndices": [0, 1, 2] }
  ]
}`;

function buildRoutePrompt(destination: string, placesText: string): string {
  const dest = destination.trim();
  const places = placesText.trim();
  if (!dest || !places) return "";

  return `You are a travel route planner. The user wants to visit these places in ${dest}. Return an optimized order so they explore more and commute less (group by neighborhood when possible).

CRITICAL: Respond with ONLY a valid JSON object. No markdown, no code blocks, no extra text. Use this schema:
${ROUTE_JSON_SCHEMA}

Requirements:
- orderedStops: list every place the user mentioned, in the best visiting order (e.g. cluster by neighborhood, minimize backtracking).
- Each stop must have order (1-based), name (exact or clear place name). Add neighborhood and address when helpful.
- neighborhoodGroups: optional list of neighborhood names and which stop indices (0-based) belong there.
- summary: brief line like "6 stops · 2 neighborhoods · walking-friendly order".

User's destination: ${dest}

Places they want to visit (one per line or comma-separated):
---
${places}
---`;
}

function RouteBuildingLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(
      () => setStep((s) => (s + 1) % BUILDING_STEPS.length),
      1200
    );
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[260px] overflow-hidden rounded-xl border-2 border-primary/20 bg-gradient-to-b from-muted/30 to-muted/10 shadow-lg">
      <div className="flex flex-col items-center justify-center gap-6 p-10">
        <div className="relative">
          <div className="absolute -inset-4 animate-pulse rounded-full bg-primary/10" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl border-2 border-primary/30 bg-background shadow-md">
            <RouteIcon className="size-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold">Building your route</h3>
          <div className="flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "inline-block size-2 animate-bounce rounded-full bg-primary",
                  i === 0 && "[animation-delay:0ms]",
                  i === 1 && "[animation-delay:150ms]",
                  i === 2 && "[animation-delay:300ms]"
                )}
              />
            ))}
          </div>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-2">
          {BUILDING_STEPS.map(({ icon: Icon, label }, i) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-all duration-300",
                i === step
                  ? "border-primary/40 bg-primary/10"
                  : "border-muted bg-background/50"
              )}
            >
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UserRoutesPage() {
  const [destination, setDestination] = useState("");
  const [places, setPlaces] = useState("");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedOutputRef = useRef<string>("");

  useEffect(() => {
    if (isLoading || !output) return;
    const parsed = parseRouteResponse(output);
    if (parsed.kind !== "route" || output === lastSavedOutputRef.current) return;
    lastSavedOutputRef.current = output;
    const title = `${parsed.data.destination?.trim() || destination.trim() || "Trip"} Route`;
    saveGeneration({ type: "route", title, payload: parsed.data }).catch(() => {});
  }, [output, isLoading, destination]);

  const addSuggestion = useCallback((text: string) => {
    setPlaces((prev) => (prev ? `${prev}\n${text}` : text));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const dest = destination.trim();
      const placesText = places.trim();
      if (!dest || !placesText) return;

      const prompt = buildRoutePrompt(dest, placesText);
      if (!prompt) return;

      setIsLoading(true);
      setOutput("");
      setError(null);
      try {
        const res = await fetch("/api/ai/stream", {
          body: JSON.stringify({ prompt, desiredMaxTokens: 2048 }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No body");
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            for (const line of evt.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const data = t.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const payload = JSON.parse(data) as { type?: string; delta?: string };
                if (payload.type === "text-delta" && typeof payload.delta === "string") {
                  setOutput((prev) => prev + payload.delta);
                }
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setIsLoading(false);
      }
    },
    [destination, places]
  );

  const isValid = destination.trim().length > 0 && places.trim().length > 0;

  return (
    <main id={MAIN_CONTENT_ID} className="flex min-h-[60vh] flex-col" tabIndex={-1}>
      <MarketingContainer className="py-10 sm:py-14">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/50 text-highlight">
              <RouteIcon aria-hidden className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Location-aware routing
            </h1>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Add your destination and the places you want to visit. We optimize the order and group by neighborhood—with a map.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="routes-destination">Destination</Label>
              <Input
                id="routes-destination"
                type="text"
                placeholder="e.g. Paris, Tokyo"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routes-places">Places to visit (one per line or comma-separated)</Label>
              <textarea
                id="routes-places"
                rows={4}
                placeholder="Eiffel Tower&#10;Louvre Museum&#10;Montmartre&#10;Canal Saint-Martin"
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
                disabled={isLoading}
                className="flex w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {QUICK_SUGGESTIONS.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => addSuggestion(text)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
                  "hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                )}
              >
                {text.length > 28 ? `${text.slice(0, 28)}…` : text}
              </button>
            ))}
          </div>
          <Button
            type="submit"
            disabled={isLoading || !isValid}
            className="rounded-xl"
          >
            {isLoading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <>
                Plan route
                <SendIcon className="size-4" />
              </>
            )}
          </Button>
        </form>

        {(output || error || isLoading) && (
          <div className="mt-8">
            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <strong>Error:</strong> {error}
              </div>
            ) : isLoading ? (
              <RouteBuildingLoader />
            ) : (
              (() => {
                const parsed = parseRouteResponse(output);
                if (parsed.kind === "route") {
                  return <RouteCard data={parsed.data} className="shadow-md" />;
                }
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    Couldn&apos;t build a route. Try again with a clear list of places.
                  </div>
                );
              })()
            )}
          </div>
        )}
      </MarketingContainer>
    </main>
  );
}
