import type { Event, SeatingConfig } from "@/types";
import { getVipSeatInfo } from "@/lib/seating";

/**
 * Derive a human-readable seat label (row letter + position-within-row)
 * from the global sequential seatNumber stored in Firestore.
 *
 * Runway: a "row" spans both sides of the aisle, so fullRowSize = seatsPerRow * 2.
 * Theater/auditorium/classroom: fullRowSize = seatsPerRow.
 * Banquet has its own tableNumber derivation in notify.ts — not used here.
 */
export function getSeatLabel(
  seatNumber: number,
  config: SeatingConfig
): { row: string; pos: number; fullRowSize: number } {
  const fullRowSize =
    config.style === "runway"
      ? (config.seatsPerRow ?? 5) * 2
      : config.seatsPerRow ?? 10;
  const rowIdx = Math.floor((seatNumber - 1) / fullRowSize);
  const pos = ((seatNumber - 1) % fullRowSize) + 1;
  return { row: String.fromCharCode(65 + rowIdx), pos, fullRowSize };
}

/** Round-table layouts — seats belong to a numbered table rather than a row. */
const TABLE_LAYOUT_STYLES: ReadonlyArray<SeatingConfig["style"]> = ["banquet", "banquet-runway"];

export interface AssignmentLabel {
  /** Compact code for dense admin tables: "T1" | "V1" | "T1-S3" | "V1-S9" | "A3". */
  short: string;
  /** Expanded wording for guest-facing email/WhatsApp: "Table 1" | "VIP Table 1" | "Table 1 · Seat 3" | "Row A · Seat 3". */
  long: string;
  isVip: boolean;
  /** Structured rows for the email "Event Details" table. */
  rows: { label: string; value: string; vip?: boolean }[];
}

/**
 * Single source of truth for turning a global `seatNumber` into a human label.
 *
 * Every surface (admin tables, seat map, notifications, QR email, WhatsApp)
 * MUST route through this so the seat/table scheme stays consistent — past
 * drift bugs came from each site re-deriving its own label.
 *
 * Returns null when the guest has no seat allocated.
 */
export function formatAssignment(
  seatNumber: number | null,
  event: Pick<Event, "assignmentMode" | "totalSeats" | "seatingConfig">
): AssignmentLabel | null {
  if (seatNumber == null) return null;

  const cfg = event.seatingConfig;
  const isTableMode = event.assignmentMode === "table";

  // ── VIP — seats numbered above the standard range ──────────────────────────
  const vip = getVipSeatInfo(seatNumber, cfg, event.totalSeats);
  if (vip) {
    const n = vip.tableIndex + 1;
    const s = vip.seatInTable;
    if (isTableMode) {
      return {
        short: `V${n}`,
        long: `VIP Table ${n}`,
        isVip: true,
        rows: [{ label: "VIP Table", value: String(n), vip: true }],
      };
    }
    return {
      short: `V${n}-S${s}`,
      long: `VIP Table ${n} · Seat ${s}`,
      isVip: true,
      rows: [
        { label: "VIP Table", value: String(n), vip: true },
        { label: "Seat", value: String(s) },
      ],
    };
  }

  // ── Standard ───────────────────────────────────────────────────────────────
  const spt = cfg?.seatsPerTable ?? 10;
  const isTableLayout = cfg ? TABLE_LAYOUT_STYLES.includes(cfg.style) : false;

  if (isTableMode) {
    const t = Math.ceil(seatNumber / spt);
    return {
      short: `T${t}`,
      long: `Table ${t}`,
      isVip: false,
      rows: [{ label: "Table", value: String(t) }],
    };
  }

  // Seat mode.
  if (isTableLayout) {
    const t = Math.floor((seatNumber - 1) / spt) + 1;
    const s = ((seatNumber - 1) % spt) + 1;
    return {
      short: `T${t}-S${s}`,
      long: `Table ${t} · Seat ${s}`,
      isVip: false,
      rows: [
        { label: "Table", value: String(t) },
        { label: "Seat", value: String(s) },
      ],
    };
  }

  // Seat mode, row-based layout (theater/auditorium/classroom/runway).
  const { row, pos } = getSeatLabel(seatNumber, cfg ?? { style: "theater", seatsPerRow: 10 });
  return {
    short: `${row}${pos}`,
    long: `Row ${row} · Seat ${pos}`,
    isVip: false,
    rows: [
      { label: "Row", value: row },
      { label: "Seat", value: String(pos) },
    ],
  };
}
