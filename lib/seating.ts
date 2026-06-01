import type { SeatingConfig, VipTable } from "@/types";
import { getSeatLabel } from "@/lib/seatLabel";

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

// ─── Group allocation planner ────────────────────────────────────────────────
// Pure helper used by the seat-map page when group-by is active and the admin
// drops a group of N guests on a seat or table. Walks free seats from the drop
// point and returns either an executable plan or a not-enough-free-seats error.

/** Minimal seat shape the planner needs — kept compatible with the SeatInfo
 *  produced by `buildSeatMap` in SeatMapModal, without dragging UI imports
 *  into lib/. */
export interface SeatLike {
  seatNumber: number;
  status: string;
}

export interface AllocationStep {
  /** 0-based index in the layout's tables. Undefined for seat-mode layouts. */
  tableIndex?: number;
  variant?: "vip" | "standard";
  /** Seat numbers receiving group members, in order. */
  seatNumbers: number[];
  /** Human label for the confirm dialog ("Table 2", "VIP · Stage Front", "Row C"). */
  label: string;
}

export type AllocationPlanResult =
  | { ok: true; steps: AllocationStep[] }
  | { ok: false; error: "not-enough-free-seats"; available: number };

export interface PlanGroupAllocationArgs {
  allSeats: SeatLike[];
  seatingConfig: SeatingConfig | undefined;
  totalStandardSeats: number;
  groupSize: number;
  start:
    | { kind: "seat"; seatNumber: number }
    | { kind: "table"; tableIndex: number; variant: "vip" | "standard" };
}

export function planGroupAllocation(args: PlanGroupAllocationArgs): AllocationPlanResult {
  const { allSeats, seatingConfig, totalStandardSeats, groupSize, start } = args;
  const seatsPerTable = seatingConfig?.seatsPerTable ?? 10;
  const isBanquet =
    seatingConfig?.style === "banquet" || seatingConfig?.style === "banquet-runway";
  const statusByNum = new Map(allSeats.map((s) => [s.seatNumber, s.status]));

  // Build the ordered list of candidate seat numbers (post drop point), keeping
  // VIP and standard pools separate so overflow never crosses the boundary.
  let candidates: number[] = [];

  if (start.kind === "seat") {
    // Seat-mode layouts: walk by seat number from the drop point. Standard
    // seats only — drop never lands on a VIP seat in seat-mode layouts.
    candidates = allSeats
      .map((s) => s.seatNumber)
      .filter((n) => n >= start.seatNumber && n <= totalStandardSeats)
      .sort((a, b) => a - b);
  } else if (start.variant === "vip") {
    // VIP table drop: walk VIP tables from this index forward.
    const vipRanges = getVipSeatRanges(seatingConfig, totalStandardSeats);
    const startIdx = vipRanges.findIndex((r) => r.tableIndex === start.tableIndex);
    if (startIdx === -1) return { ok: false, error: "not-enough-free-seats", available: 0 };
    for (let i = startIdx; i < vipRanges.length; i++) {
      for (let n = vipRanges[i].start; n <= vipRanges[i].end; n++) candidates.push(n);
    }
  } else {
    // Standard banquet table drop: walk standard seats starting at this table.
    const startSeat = start.tableIndex * seatsPerTable + 1;
    candidates = allSeats
      .map((s) => s.seatNumber)
      .filter((n) => n >= startSeat && n <= totalStandardSeats)
      .sort((a, b) => a - b);
  }

  // Pick the first `groupSize` available seats from the candidates.
  const picked: number[] = [];
  for (const n of candidates) {
    if (statusByNum.get(n) === "available") {
      picked.push(n);
      if (picked.length === groupSize) break;
    }
  }
  if (picked.length < groupSize) {
    return { ok: false, error: "not-enough-free-seats", available: picked.length };
  }

  // Group picked seats into steps. Banquet layouts → group by table.
  const steps: AllocationStep[] = [];

  if (start.kind === "table" && start.variant === "vip") {
    const vipRanges = getVipSeatRanges(seatingConfig, totalStandardSeats);
    const byTable = new Map<number, number[]>();
    for (const n of picked) {
      const range = vipRanges.find((r) => n >= r.start && n <= r.end);
      if (!range) continue;
      if (!byTable.has(range.tableIndex)) byTable.set(range.tableIndex, []);
      byTable.get(range.tableIndex)!.push(n);
    }
    for (const [tIdx, seats] of byTable.entries()) {
      const range = vipRanges.find((r) => r.tableIndex === tIdx);
      const tableLabel = range?.table.label || `T${tIdx + 1}`;
      steps.push({
        tableIndex: tIdx,
        variant: "vip",
        seatNumbers: seats,
        label: `VIP · ${tableLabel}`,
      });
    }
  } else if (isBanquet) {
    const byTable = new Map<number, number[]>();
    for (const n of picked) {
      const tIdx = Math.ceil(n / seatsPerTable) - 1;
      if (!byTable.has(tIdx)) byTable.set(tIdx, []);
      byTable.get(tIdx)!.push(n);
    }
    for (const [tIdx, seats] of byTable.entries()) {
      steps.push({
        tableIndex: tIdx,
        variant: "standard",
        seatNumbers: seats,
        label: `Table ${tIdx + 1}`,
      });
    }
  } else {
    // Seat-mode layouts: single step. Label uses getSeatLabel for the first
    // seat so admin sees where the group anchors.
    const firstSeat = picked[0];
    const cfg = seatingConfig ?? { style: "theater" as const, seatsPerRow: 10 };
    const lbl = getSeatLabel(firstSeat, cfg);
    steps.push({
      seatNumbers: picked,
      label: lbl ? `Row ${lbl.row} · seat ${lbl.pos}+` : `Seat ${firstSeat}+`,
    });
  }

  return { ok: true, steps };
}
