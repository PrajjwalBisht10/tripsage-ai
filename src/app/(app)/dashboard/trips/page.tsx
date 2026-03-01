/**
 * @fileoverview Trips route (RSC shell) with TanStack Query prefetch + hydration.
 */

import { getOptionalUser } from "@/lib/auth/server";
import { keys } from "@/lib/keys";
import { HydrationBoundary } from "@/lib/query/hydration-boundary";
import { prefetchDehydratedState } from "@/lib/query/prefetch";
import { listTripsForUser } from "@/server/queries/trips";
import TripsClient from "./trips-client";

const ANONYMOUS_USER_ID = "anonymous-demo-user";

export default async function TripsPage() {
  const { supabase, user } = await getOptionalUser();
  const userId = user?.id ?? ANONYMOUS_USER_ID;

  const state = await prefetchDehydratedState(async (queryClient) => {
    try {
      await queryClient.prefetchQuery({
        queryFn: () => listTripsForUser(supabase, { currentUserId: userId }),
        queryKey: keys.trips.list(userId),
      });
    } catch {
      await queryClient.prefetchQuery({
        queryFn: () => [] as Awaited<ReturnType<typeof listTripsForUser>>,
        queryKey: keys.trips.list(userId),
      });
    }
  });

  return (
    <HydrationBoundary state={state}>
      <TripsClient userId={userId} />
    </HydrationBoundary>
  );
}
