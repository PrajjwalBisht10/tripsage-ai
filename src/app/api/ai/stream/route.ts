/**
 * @fileoverview Demo streaming route using AI SDK v6. Returns a UI Message Stream suitable for AI Elements and AI SDK UI readers.
 */

import "server-only";

import { resolveProvider } from "@ai/models/registry";
import { buildTimeoutConfigFromSeconds } from "@ai/timeout";
import { consumeStream, streamText } from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { type RouteParamsContext, withApiGuards } from "@/lib/api/factory";
import { errorResponse } from "@/lib/api/route-helpers";
import { getServerEnvVarWithFallback } from "@/lib/env/server";
import {
  type ChatMessage,
  clampMaxTokens,
  countPromptTokens,
} from "@/lib/tokens/budget";
import { getModelContextLimit } from "@/lib/tokens/limits";

const STREAM_BODY_SCHEMA = z.strictObject({
  desiredMaxTokens: z.number().int().min(1).max(4096).default(512),
  messages: z
    .array(
      z.strictObject({
        content: z.string().max(2000),
        role: z.enum(["assistant", "system", "user"]),
      })
    )
    .max(16)
    .default([]),
  model: z.string().trim().min(1).max(200).optional(),
  prompt: z
    .string()
    .max(4000)
    .default("Hello from AI SDK v6")
    .transform((value) => (value.length ? value : "Hello from AI SDK v6")),
});

// Allow streaming responses up to 30 seconds
/** Maximum duration (seconds) to allow for streaming responses. */
export const maxDuration = 30;
const STREAM_TIMEOUT_SECONDS = Math.max(5, maxDuration - 5);

/**
 * Handle POST requests by streaming a simple demo message via AI SDK.
 *
 * @param req - Next.js request object
 * @param routeContext - Route context from withApiGuards
 * @returns A Response implementing the UI message stream protocol (SSE).
 */
// auth: false allows unauthenticated access for demo purposes.
// Uses server-side API keys when user-specific keys are not available.
const guardedPOST = withApiGuards({
  auth: false,
  botId: false, // Temporarily disabled to debug
  degradedMode: "fail_open", // Changed to fail_open to allow requests even if rate limiting fails
  rateLimit: "ai:stream",
  schema: STREAM_BODY_SCHEMA,
  telemetry: "ai.stream",
})(async (req, { user }, body) => {
  console.log("[DEBUG] guardedPOST handler started");
  
  // Use authenticated user ID if available, otherwise use a dummy ID for server-side keys
  const userId = user?.id ?? "anonymous-demo-user";
  console.log("[DEBUG] Using userId:", userId);

  const { desiredMaxTokens, model: modelHint, prompt } = body;
  const messages: ChatMessage[] | undefined = body.messages.length
    ? body.messages
    : undefined;

  // Build message list if not provided
  const finalMessages: ChatMessage[] = messages ?? [{ content: prompt, role: "user" }];

  let resolved: Awaited<ReturnType<typeof resolveProvider>>;
  try {
    console.log("[DEBUG] Attempting to resolve provider for userId:", userId);
    
    // For anonymous users, try to use server-side keys directly to avoid Supabase lookup
    if (userId === "anonymous-demo-user") {
      console.log("[DEBUG] Anonymous user detected, checking server-side keys directly");
      try {
        const { getServerEnvVarWithFallback } = await import("@/lib/env/server");
        const openaiKey = getServerEnvVarWithFallback("OPENAI_API_KEY", undefined);
        console.log("[DEBUG] OPENAI_API_KEY check result:", openaiKey ? `Found (length: ${openaiKey.length})` : "Not found");
        
        if (openaiKey) {
          console.log("[DEBUG] Found OPENAI_API_KEY, creating OpenAI client directly");
          try {
            const { createOpenAI } = await import("@ai-sdk/openai");
            // Default model mapping for OpenAI
            const defaultModelId = modelHint && modelHint.trim().length > 0 
              ? modelHint 
              : "gpt-4o-mini";
            console.log("[DEBUG] Using modelId:", defaultModelId);
            const openai = createOpenAI({ apiKey: openaiKey });
            const model = openai(defaultModelId);
            resolved = { model, modelId: defaultModelId, provider: "openai" };
            console.log("[DEBUG] Provider resolved successfully (direct OpenAI):", {
              provider: resolved.provider,
              modelId: resolved.modelId,
            });
          } catch (createError) {
            console.error("[DEBUG] Error creating OpenAI client:", createError);
            throw createError;
          }
        } else {
          // Fall back to normal resolveProvider
          console.log("[DEBUG] No OPENAI_API_KEY found, falling back to resolveProvider");
          resolved = await resolveProvider(userId, modelHint);
        }
      } catch (directLookupError) {
        console.error("[DEBUG] Direct lookup failed, falling back to resolveProvider:", directLookupError);
        resolved = await resolveProvider(userId, modelHint);
      }
    } else {
      resolved = await resolveProvider(userId, modelHint);
    }
    
    if (!resolved) {
      throw new Error("Failed to resolve provider");
    }
    
    console.log("[DEBUG] Provider resolved successfully:", {
      provider: resolved.provider,
      modelId: resolved.modelId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[DEBUG] resolveProvider failed:", {
      error: errorMessage,
      stack: errorStack,
      userId,
      modelHint,
    });
    return errorResponse({
      err: error instanceof Error ? error : new Error(String(error)),
      error: "provider_unavailable",
      reason: `AI provider is not configured yet. Error: ${errorMessage}. Please configure server-side API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) or AI_GATEWAY_API_KEY.`,
      status: 503,
    });
  }

  const { maxOutputTokens, reasons } = clampMaxTokens(
    finalMessages,
    desiredMaxTokens,
    resolved.modelId
  );

  // If prompt already exhausts the model context window, return a 400 with reasons
  const modelLimit = getModelContextLimit(resolved.modelId);
  const promptTokens = countPromptTokens(finalMessages, resolved.modelId);
  if (modelLimit - promptTokens <= 0) {
    return errorResponse({
      error: "token_budget_exceeded",
      extras: {
        modelContextLimit: modelLimit,
        modelHint: modelHint ?? null,
        modelId: resolved.modelId,
        promptTokens,
        provider: resolved.provider,
        reasons,
      },
      reason: "No output tokens available for the given prompt and model.",
      status: 400,
    });
  }

  const result = streamText({
    abortSignal: req.signal,
    experimental_telemetry: {
      functionId: "ai.stream.demo",
      isEnabled: true,
      metadata: {
        hasMessages: Boolean(messages?.length),
        modelId: resolved.modelId,
        provider: resolved.provider,
        ...(typeof modelHint === "string" ? { modelHint } : {}),
      },
    },
    maxOutputTokens,
    messages: finalMessages,
    model: resolved.model,
    timeout: buildTimeoutConfigFromSeconds(STREAM_TIMEOUT_SECONDS),
  });

  // Return a UI Message Stream response suitable for AI Elements consumers
  return result.toUIMessageStreamResponse({ consumeSseStream: consumeStream });
});

/**
 * Feature-flagged POST handler for AI streaming demo.
 *
 * @param req - Next.js request object
 * @param routeContext - Route context with params
 * @returns 404 error response when ENABLE_AI_DEMO is disabled, otherwise delegates to guardedPOST
 */
export const POST = async (req: NextRequest, routeContext: RouteParamsContext) => {
  // Log immediately to verify the handler is called
  console.log("[DEBUG] ========== POST handler called ==========");
  console.log("[DEBUG] Request URL:", req.url);
  console.log("[DEBUG] Request method:", req.method);
  
  const enabled = getServerEnvVarWithFallback("ENABLE_AI_DEMO", false);
  console.log("[DEBUG] ENABLE_AI_DEMO:", enabled);
  
  if (!enabled) {
    console.log("[DEBUG] ENABLE_AI_DEMO is false, returning 404");
    return errorResponse({ error: "not_found", reason: "Not found", status: 404 });
  }

  // Debug: Check if OPENAI_API_KEY is loaded
  const openaiKey = getServerEnvVarWithFallback("OPENAI_API_KEY", undefined);
  console.log("[DEBUG] OPENAI_API_KEY loaded:", openaiKey ? `YES (length: ${openaiKey.length}, starts with: ${openaiKey.substring(0, 10)}...)` : "NO");
  
  // Also check other potential keys
  const anthropicKey = getServerEnvVarWithFallback("ANTHROPIC_API_KEY", undefined);
  const gatewayKey = getServerEnvVarWithFallback("AI_GATEWAY_API_KEY", undefined);
  console.log("[DEBUG] ANTHROPIC_API_KEY:", anthropicKey ? `YES (length: ${anthropicKey.length})` : "NO");
  console.log("[DEBUG] AI_GATEWAY_API_KEY:", gatewayKey ? `YES (length: ${gatewayKey.length})` : "NO");

  console.log("[DEBUG] About to call guardedPOST");
  try {
    const result = await guardedPOST(req, routeContext);
    console.log("[DEBUG] guardedPOST returned with status:", result.status);
    return result;
  } catch (error) {
    console.error("[DEBUG] guardedPOST threw error:", error);
    console.error("[DEBUG] Error stack:", error instanceof Error ? error.stack : "No stack");
    throw error;
  }
};
