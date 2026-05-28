import type { SeatingConfig, VipTable } from "@/types";

/**
 * Single source of truth for VIP seat math. Every consumer (seat map, allocate
 * API, notify, email template, WhatsApp) must derive VIP info through these
 * helpers — past sessions hit drift bugs when seat-label logic was duplicated.
 */

export interface VipSeatRange {
  table: VipTable;
  tableIndex: number; // position within vipTables array (0-based)
  start: number;      // first global seat number (inclusive)
  end: number;        // last global seat number (inclusive)
}

export function getVipTables(config: SeatingConfig | undefined): VipTable[] {
  return config?.vipTables ?? [];
}

export function getVipSeatCount(config: SeatingConfig | undefined): number {
  return getVipTables(config).reduce((sum, t) => sum + (t.seats > 0 ? t.seats : 0), 0);
}

export function getTotalSeatCount(
  config: SeatingConfig | undefined,
  totalStandardSeats: number
): number {
  return totalStandardSeats + getVipSeatCount(config);
}

export function getVipSeatRanges(
  config: SeatingConfig | undefined,
  totalStandardSeats: number
): VipSeatRange[] {
  const ranges: VipSeatRange[] = [];
  let cursor = totalStandardSeats + 1;
  getVipTables(config).forEach((table, tableIndex) => {
    if (table.seats <= 0) return;
    ranges.push({ table, tableIndex, start: cursor, end: cursor + table.seats - 1 });
    cursor += table.seats;
  });
  return ranges;
}

export interface VipSeatInfo {
  table: VipTable;
  tableIndex: number;
  seatInTable: number; // 1-based seat position within the VIP table
}

export function getVipSeatInfo(
  seatNumber: number,
  config: SeatingConfig | undefined,
  totalStandardSeats: number
): VipSeatInfo | null {
  const ranges = getVipSeatRanges(config, totalStandardSeats);
  for (const r of ranges) {
    if (seatNumber >= r.start && seatNumber <= r.end) {
      return { table: r.table, tableIndex: r.tableIndex, seatInTable: seatNumber - r.start + 1 };
    }
  }
  return null;
}

export function isVipSeat(
  seatNumber: number,
  config: SeatingConfig | undefined,
  totalStandardSeats: number
): boolean {
  return getVipSeatInfo(seatNumber, config, totalStandardSeats) !== null;
}

/**
 * Returns true when `next` preserves every VIP table from `prev` at the same
 * index with the same id and same seat count. Appending new VIP tables at the
 * end is safe; removing, reordering, or shrinking is not (it would orphan
 * already-allocated VIP seat numbers).
 */
export function vipTablesAreAdditionOnly(
  prev: VipTable[] | undefined,
  next: VipTable[] | undefined
): boolean {
  const a = prev ?? [];
  const b = next ?? [];
  if (b.length < a.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].seats !== b[i].seats) return false;
  }
  return true;
}
