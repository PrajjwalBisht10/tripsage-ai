/**
 * @fileoverview Generates a PDF from calendar events (trip schedule) for download.
 */

import { jsPDF } from "jspdf";

/** Event shape for PDF (accepts API-validated events with dateTime as Date or string). */
type PdfEvent = {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string | Date };
  end: { date?: string; dateTime?: string | Date };
};

const MARGIN = 20;
const LINE_HEIGHT = 7;
const TITLE_SIZE = 18;
const HEADING_SIZE = 12;
const BODY_SIZE = 10;

function toIsoString(value: string | Date | undefined): string | undefined {
  if (value == null) return undefined;
  return typeof value === "string" ? value : value.toISOString();
}

function formatEventTime(event: PdfEvent): string {
  const start = event.start.date ?? toIsoString(event.start.dateTime as string | Date | undefined);
  const end = event.end.date ?? toIsoString(event.end.dateTime as string | Date | undefined);
  if (!start) return "—";
  if (event.start.date) return "All day";
  const startStr = start.slice(0, 16).replace("T", " ");
  const endStr = end?.slice(11, 16) ?? "";
  return endStr ? `${startStr} – ${endStr}` : startStr;
}

/**
 * Builds a PDF document from calendar name and events. Returns PDF bytes.
 */
export function generatePdfFromEvents(
  calendarName: string,
  events: PdfEvent[]
): Uint8Array {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  let y = MARGIN;

  doc.setFontSize(TITLE_SIZE);
  doc.text(calendarName, MARGIN, y);
  y += LINE_HEIGHT * 2;

  doc.setFontSize(BODY_SIZE);
  doc.text(`${events.length} event${events.length !== 1 ? "s" : ""}`, MARGIN, y);
  y += LINE_HEIGHT * 1.5;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (y > 270) {
      doc.addPage();
      y = MARGIN;
    }

    doc.setFontSize(HEADING_SIZE);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(event.summary, 170);
    doc.text(titleLines, MARGIN, y);
    y += LINE_HEIGHT * titleLines.length;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    doc.text(formatEventTime(event), MARGIN, y);
    y += LINE_HEIGHT;

    if (event.location) {
      doc.text(`📍 ${event.location}`, MARGIN, y);
      y += LINE_HEIGHT;
    }
    if (event.description) {
      const descLines = doc.splitTextToSize(event.description, 170);
      if (descLines.length > 2) {
        doc.text(descLines.slice(0, 2), MARGIN, y);
        y += LINE_HEIGHT * 2;
      } else {
        doc.text(descLines, MARGIN, y);
        y += LINE_HEIGHT * descLines.length;
      }
    }
    y += LINE_HEIGHT;
  }

  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}
