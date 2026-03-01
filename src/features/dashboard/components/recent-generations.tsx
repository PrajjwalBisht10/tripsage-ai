/**
 * @fileoverview Dashboard widget showing the user's recent AI generations (itinerary, budget, route) for Overview.
 */

import {
  BanknoteIcon,
  CalendarIcon,
  CompassIcon,
  RouteIcon,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listRecentGenerations,
  type GenerationType,
  type SavedGeneration,
} from "@/lib/generations/actions";
import { ROUTES } from "@/lib/routes";

const TYPE_CONFIG: Record<
  GenerationType,
  { href: string; icon: React.ReactNode; label: string }
> = {
  itinerary: {
    href: ROUTES.userItinerary,
    icon: <CompassIcon className="h-4 w-4" />,
    label: "Itinerary",
  },
  budget: {
    href: ROUTES.userBudget,
    icon: <BanknoteIcon className="h-4 w-4" />,
    label: "Budget",
  },
  route: {
    href: ROUTES.userRoutes,
    icon: <RouteIcon className="h-4 w-4" />,
    label: "Route",
  },
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3600_000);
  const diffDays = Math.floor(diffMs / 86400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface RecentGenerationsProps {
  limit?: number;
}

export async function RecentGenerations({ limit = 10 }: RecentGenerationsProps) {
  const items = await listRecentGenerations(limit);
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SparklesIconPlaceholder />
            Recent activity
          </CardTitle>
          <CardDescription>Your recent itineraries, budgets, and routes will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use <Link href={ROUTES.userItinerary} className="underline">Itinerary</Link>,{" "}
            <Link href={ROUTES.userBudget} className="underline">Budget</Link>, or{" "}
            <Link href={ROUTES.userRoutes} className="underline">Route planner</Link> to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <SparklesIconPlaceholder />
          Recent activity
        </CardTitle>
        <CardDescription>Your recent interactions with AI planning tools.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((gen) => (
            <GenerationItem key={gen.id} generation={gen} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SparklesIconPlaceholder() {
  return (
    <span className="grid size-8 place-items-center rounded-lg border bg-muted/50 text-primary">
      <CalendarIcon className="size-4" />
    </span>
  );
}

function GenerationItem({ generation }: { generation: SavedGeneration }) {
  const config = TYPE_CONFIG[generation.type];
  return (
    <li>
      <Link
        href={config.href}
        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {config.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{generation.title}</p>
          <p className="text-xs text-muted-foreground">
            {config.label} · {formatRelativeTime(generation.created_at)}
          </p>
        </div>
      </Link>
    </li>
  );
}
