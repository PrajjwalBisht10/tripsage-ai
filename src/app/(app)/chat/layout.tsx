/**
 * @fileoverview Chat route layout implementation.
 */

import "server-only";

import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/lib/a11y/landmarks";

/**
 * Chat route layout. Auth is optional - chat accessible without login.
 *
 * @param props - Layout props.
 * @param props.children - Nested route content.
 * @returns The nested route content.
 */
export default async function ChatLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  return (
    <main id={MAIN_CONTENT_ID} className="flex-1" tabIndex={-1}>
      {children}
    </main>
  );
}
