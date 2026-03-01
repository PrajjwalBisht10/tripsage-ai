/**
 * @fileoverview Server actions for user_feature_generations: save and fetch itinerary, budget, route outputs for Overview and Calendar plan.
 */

"use server";

import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { insertSingle } from "@/lib/supabase/typed-helpers";

export type GenerationType = "itinerary" | "budget" | "route";

export interface SavedGeneration {
  id: number;
  user_id: string;
  type: GenerationType;
  title: string;
  payload: unknown;
  created_at: string;
}

export interface SaveGenerationInput {
  type: GenerationType;
  title: string;
  payload: unknown;
}

/**
 * Saves a generation for the current user. Requires auth.
 */
export async function saveGeneration(
  input: SaveGenerationInput
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const supabase = await createServerSupabase();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (authError || !user) {
    return { ok: false, error: "Not authenticated" };
  }
  const { data, error } = await insertSingle(supabase, "user_feature_generations", {
    user_id: user.id,
    type: input.type,
    title: input.title,
    payload: input.payload ?? {},
  });
  if (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to save" };
  }
  if (!data?.id) {
    return { ok: false, error: "No id returned" };
  }
  return { ok: true, id: data.id };
}

/**
 * Returns the most recent generation of the given type for the current user, or null.
 */
export async function getLastGeneration(
  type: GenerationType
): Promise<SavedGeneration | null> {
  const supabase = await createServerSupabase();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from("user_feature_generations")
    .select("id, user_id, type, title, payload, created_at")
    .eq("user_id", user.id)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as SavedGeneration;
}

/**
 * Returns recent generations for the current user (all types), newest first.
 */
export async function listRecentGenerations(
  limit: number = 20
): Promise<SavedGeneration[]> {
  const supabase = await createServerSupabase();
  const { user, error: authError } = await getCurrentUser(supabase);
  if (authError || !user) return [];

  const { data, error } = await supabase
    .from("user_feature_generations")
    .select("id, user_id, type, title, payload, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));

  if (error || !data) return [];
  return data as SavedGeneration[];
}
