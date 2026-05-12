import type { SeatingConfig } from "@/types";

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
