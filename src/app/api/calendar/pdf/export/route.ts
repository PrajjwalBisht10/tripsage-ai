/**
 * @fileoverview PDF export endpoint – generates a trip schedule PDF from calendar events.
 */

import "server-only";

import { type IcsExportRequest, icsExportRequestSchema } from "@schemas/calendar";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withApiGuards } from "@/lib/api/factory";
import { generatePdfFromEvents } from "@/lib/calendar/events-to-pdf";
import { sanitizeCalendarFilename } from "@/lib/calendar/ics";

export const POST = withApiGuards({
  auth: true,
  degradedMode:
    process.env.NODE_ENV === "development" ? "fail_open" : undefined,
  rateLimit: "calendar:pdf:export",
  schema: icsExportRequestSchema,
  telemetry: "calendar.pdf.export",
})((_req: NextRequest, _context, validated: IcsExportRequest): NextResponse => {
  const pdfBytes = generatePdfFromEvents(validated.calendarName, validated.events);
  const filename = `${sanitizeCalendarFilename(validated.calendarName)}.pdf`;

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
    status: 200,
  });
});
