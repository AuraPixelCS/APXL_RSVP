import type { RSVP } from "@/types";
import { format } from "date-fns";

export function exportRSVPsToCSV(rsvps: RSVP[], eventTitle: string): void {
  const headers = [
    "#",
    "Name",
    "Email",
    "Phone",
    "Attending",
    "+1",
    "+1 Name",
    "Dietary",
    "Status",
    "Seat",
    "Submitted",
  ];

  const rows = rsvps.map((r, i) => [
    String(i + 1),
    r.name,
    r.email,
    r.phone,
    r.attending ? "Yes" : "No",
    r.plusOne ? "Yes" : "No",
    r.plusOneName ?? "",
    r.dietaryRestrictions ?? "",
    r.status,
    r.seatNumber != null ? String(r.seatNumber) : "",
    format(new Date(r.submittedAt), "dd MMM yyyy HH:mm"),
  ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${eventTitle.replace(/\s+/g, "_")}_RSVPs_${format(new Date(), "yyyyMMdd")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
