/**
 * @fileoverview Trip detail route (RSC shell) with TanStack Query prefetch + hydration.
 */

import "server-only";

import { notFound } from "next/navigation";
import { TripDetailClient } from "@/features/trips/components/trip-detail-client";
import { getOptionalUser } from "@/lib/auth/server";
import { keys } from "@/lib/keys";
import { HydrationBoundary } from "@/lib/query/hydration-boundary";
import { prefetchDehydratedState } from "@/lib/query/prefetch";
import { listItineraryItemsForTrip } from "@/server/queries/itinerary-items";
import { listSavedPlacesForTrip } from "@/server/queries/saved-places";
import { getTripByIdForUser } from "@/server/queries/trips";

const ANONYMOUS_USER_ID = "anonymous-demo-user";

type TripDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { supabase, user } = await getOptionalUser();
  const userId = user?.id ?? ANONYMOUS_USER_ID;
  const { id } = await params;

  const tripId = Number.parseInt(id, 10);
  if (!Number.isFinite(tripId) || tripId <= 0) {
    notFound();
  }

  const detailKey = keys.trips.detail(userId, tripId);

  const trip = await getTripByIdForUser(supabase, {
    currentUserId: userId,
    tripId,
  });
  if (!trip) {
    notFound();
  }

  const state = await prefetchDehydratedState(async (queryClient) => {
    queryClient.setQueryData(detailKey, trip);

    await Promise.all([
      queryClient.prefetchQuery({
        queryFn: () => listItineraryItemsForTrip(supabase, { tripId }),
        queryKey: keys.trips.itinerary(userId, tripId),
      }),
      queryClient.prefetchQuery({
        queryFn: () => listSavedPlacesForTrip(supabase, { tripId }),
        queryKey: keys.trips.savedPlaces(userId, tripId),
      }),
    ]);
  });

  return (
    <HydrationBoundary state={state}>
      <TripDetailClient tripId={tripId} userId={userId} />
    </HydrationBoundary>
  );
}
