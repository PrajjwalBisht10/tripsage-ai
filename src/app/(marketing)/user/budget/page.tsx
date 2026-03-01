/**
 * @fileoverview Budget planner demo – user sets amount, currency, place, duration;
 * AI splits the budget or returns notPossible.
 */

"use client";

import type { BudgetPlanResult } from "@schemas/agents";
import {
  BanknoteIcon,
  CalendarIcon,
  Loader2Icon,
  MapPinIcon,
  SendIcon,
  WalletIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { BudgetChart } from "@/components/ai-elements/budget-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAIN_CONTENT_ID } from "@/lib/a11y/landmarks";
import { cn } from "@/lib/utils";

const CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "INR", label: "INR" },
  { value: "JPY", label: "JPY" },
] as const;

const BUILDING_STEPS = [
  { icon: WalletIcon, label: "Checking your budget" },
  { icon: MapPinIcon, label: "Looking up destination costs" },
  { icon: BanknoteIcon, label: "Splitting by category" },
  { icon: CalendarIcon, label: "Finalizing plan" },
] as const;

type ParseResult =
  | { kind: "budget"; data: BudgetPlanResult }
  | { kind: "notPossible"; message: string }
  | { kind: "error" };

function parseBudgetResponse(raw: string): ParseResult {
  let text = raw.trim();
  if (!text) return { kind: "error" };
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) text = jsonMatch[1].trim();
  const startIdx = text.indexOf("{");
  if (startIdx >= 0) text = text.slice(startIdx);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { kind: "error" };
    if (parsed.notPossible === true && typeof parsed.message === "string") {
      return { kind: "notPossible", message: parsed.message };
    }
    if (
      Array.isArray(parsed.allocations) &&
      parsed.allocations.length > 0 &&
      typeof parsed.currency === "string"
    ) {
      return {
        kind: "budget",
        data: {
          allocations: parsed.allocations as BudgetPlanResult["allocations"],
          currency: parsed.currency,
          schemaVersion: "budget.v1",
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          tips: Array.isArray(parsed.tips) ? parsed.tips : undefined,
        },
      };
    }
  } catch {
    // fall through
  }
  return { kind: "error" };
}

function buildBudgetPrompt(
  amount: number,
  currency: string,
  destination: string,
  durationDays: number
): string {
  return `You are a travel budget analyst. The user has a total budget of ${amount} ${currency} for a trip to ${destination} for ${durationDays} days.

CRITICAL: Respond with ONLY valid JSON. No markdown, no code blocks, no extra text.

If a reasonable trip to this destination for this duration is NOT possible within this budget (e.g. typical costs are much higher), respond with ONLY:
{"notPossible":true,"message":"A reasonable trip to ${destination} for ${durationDays} days typically costs more than ${amount} ${currency}. Try increasing your budget or shortening your trip."}

If the budget is workable, respond with a budget split using this exact schema:
{
  "schemaVersion": "budget.v1",
  "currency": "${currency}",
  "allocations": [
    { "category": "Flights", "amount": number, "rationale": "optional short reason" },
    { "category": "Accommodation", "amount": number, "rationale": "optional" },
    { "category": "Food & dining", "amount": number, "rationale": "optional" },
    { "category": "Transport", "amount": number, "rationale": "optional" },
    { "category": "Activities & experiences", "amount": number, "rationale": "optional" }
  ],
  "tips": ["optional array of 1-3 short tips"]
}

Total of allocations must equal ${amount}. Use realistic proportions for ${destination}.`;
}

function BudgetBuildingLoader() {
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
            <WalletIcon className="size-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-semibold">Splitting your budget</h3>
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

export default function UserBudgetPage() {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [destination, setDestination] = useState("");
  const [durationDays, setDurationDays] = useState("5");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logTelemetry = useCallback((status: "success" | "error") => {
    fetch("/api/telemetry/ai-demo", {
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => {});
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const numAmount = Number.parseFloat(amount.replace(/,/g, ""), 10);
      const numDays = Number.parseInt(durationDays, 10) || 5;
      const dest = destination.trim();
      if (!Number.isFinite(numAmount) || numAmount <= 0 || !dest) return;

      const prompt = buildBudgetPrompt(numAmount, currency, dest, numDays);
      setIsLoading(true);
      setOutput("");
      setError(null);
      try {
        const res = await fetch("/api/ai/stream", {
          body: JSON.stringify({ prompt, desiredMaxTokens: 1024 }),
          headers: { "content-type": "application/json" },
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
        logTelemetry("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        logTelemetry("error");
      } finally {
        setIsLoading(false);
      }
    },
    [amount, currency, destination, durationDays, logTelemetry]
  );

  const isValid =
    Number.isFinite(Number.parseFloat(amount.replace(/,/g, ""), 10)) &&
    Number.parseFloat(amount.replace(/,/g, ""), 10) > 0 &&
    destination.trim().length > 0;

  return (
    <main id={MAIN_CONTENT_ID} className="flex min-h-[60vh] flex-col" tabIndex={-1}>
      <MarketingContainer className="py-10 sm:py-14">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg border bg-muted/50 text-highlight">
              <WalletIcon aria-hidden className="size-5" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Budget planner
            </h1>
          </div>
          <p className="max-w-2xl text-muted-foreground">
            Set your budget and place. We split it into a realistic plan—or tell you if it&apos;s not possible.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="budget-amount">Budget amount</Label>
              <Input
                id="budget-amount"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 2000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={isLoading}>
                <SelectTrigger id="budget-currency" className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-destination">Place / destination</Label>
              <Input
                id="budget-destination"
                type="text"
                placeholder="e.g. Paris, Tokyo"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-duration">Duration (days)</Label>
              <Input
                id="budget-duration"
                type="number"
                min={1}
                max={90}
                placeholder="5"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value || "5")}
                disabled={isLoading}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isLoading || !isValid}
              className="rounded-xl"
            >
              {isLoading ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <>
                  Split budget
                  <SendIcon className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>

        {(output || error || isLoading) && (
          <div className="mt-8">
            {error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <strong>Error:</strong> {error}
              </div>
            ) : isLoading ? (
              <BudgetBuildingLoader />
            ) : (
              (() => {
                const parsed = parseBudgetResponse(output);
                if (parsed.kind === "budget") {
                  return <BudgetChart result={parsed.data} className="shadow-md" />;
                }
                if (parsed.kind === "notPossible") {
                  return (
                    <div className="rounded-xl border-2 border-amber-200/80 bg-amber-50/80 p-6 dark:border-amber-800/50 dark:bg-amber-950/30">
                      <p className="font-medium text-amber-900 dark:text-amber-100">
                        Not possible within your budget
                      </p>
                      <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-200/90">
                        {parsed.message}
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    Couldn&apos;t parse the budget. Try again.
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
