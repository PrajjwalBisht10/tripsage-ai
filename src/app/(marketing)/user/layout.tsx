/**
 * @fileoverview Passthrough layout for /user/* (itinerary, budget, routes).
 * Ensures Next.js resolves /user/itinerary, /user/budget, /user/routes correctly.
 */

import type { ReactNode } from "react";

export default function UserSegmentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
