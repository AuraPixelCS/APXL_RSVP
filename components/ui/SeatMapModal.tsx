import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import type { Event, RSVP, SeatingConfig, VipTable } from "@/types";
import SeatingConfigurator from "@/components/ui/SeatingConfigurator";
import { getSeatLabel } from "@/lib/seatLabel";
import { getTotalSeatCount, getVipSeatRanges, vipTableShortLabel } from "@/lib/seating";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SelectingFor {
  rsvpId: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  event: Event;
  rsvps: RSVP[];
  selectingFor?: SelectingFor | null;
  onSeatSelect?: (seatNumber: number) => void;
  assigning?: boolean;
  onReassign?: (rsvpId: string, guestName: string) => void;
  onCancel?: (rsvpId: string) => Promise<void>;
  onLayoutChange?: (config: SeatingConfig, assignmentMode: "seat" | "table") => Promise<void>;
}

// ─── Status config ─────────────────────────────────────────────────────────────

// Optional drop-target wrapper used by the full-page seat allocator. Only
// registers as a droppable when an id is provided — modal usage passes nothing
// and the wrapper renders as a plain pass-through.
function MaybeDroppable({ id, children }: { id?: string; children: ReactNode }) {
  if (!id) return <>{children}</>;
  return <DroppableEl id={id}>{children}</DroppableEl>;
}

function DroppableEl({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <span
      ref={setNodeRef}
      data-drop-id={id}
      style={{
        display: "inline-flex",
        position: "relative",
        outline: isOver ? "2px solid #22c55e" : "none",
        outlineOffset: 2,
        borderRadius: 999,
        transition: "outline-color 120ms",
      }}
    >
      {children}
    </span>
  );
}

// Block-level variant used by container elements that participate in flex/grid
// layouts (e.g. BanquetTableCell). When id is omitted, pass-through with no
// extra DOM wrapper.
function MaybeDroppableBlock({ id, children, style }: { id?: string; children: ReactNode; style?: React.CSSProperties }) {
  if (!id) return <>{children}</>;
  return <DroppableBlock id={id} style={style}>{children}</DroppableBlock>;
}

function DroppableBlock({ id, children, style }: { id: string; children: ReactNode; style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-drop-id={id}
      style={{
        display: "flex",
        flex: 1,
        position: "relative",
        borderRadius: 14,
        // box-shadow ring + soft glow so the indicator is visible even on top
        // of gold-bordered VIP cards (an outline would be hidden behind them).
        boxShadow: isOver
          ? "0 0 0 2px #22c55e, 0 0 18px rgba(34,197,94,0.45)"
          : "none",
        transition: "box-shadow 120ms",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string; dot: string }> = {
  available:     { fill: "var(--surface-3)",         stroke: "var(--border)",                  label: "Available",     dot: "var(--muted)" },
  pending:       { fill: "rgba(251,191,36,0.18)",     stroke: "rgba(251,191,36,0.55)",           label: "Pending",       dot: "#fbbf24" },
  allocated:     { fill: "rgba(61,155,245,0.18)",     stroke: "rgba(61,155,245,0.55)",           label: "Allocated",     dot: "#3d9bf5" },
  checked_in:    { fill: "rgba(34,197,94,0.18)",      stroke: "rgba(34,197,94,0.55)",            label: "Checked In",    dot: "#22c55e" },
  not_attending: { fill: "rgba(239,68,68,0.12)",      stroke: "rgba(239,68,68,0.35)",            label: "Not Attending", dot: "#ef4444" },
};

const SELECTABLE_HOVER  = "rgba(34,197,94,0.7)";
const SELECTABLE_FILL   = "rgba(34,197,94,0.08)";
const SELECTABLE_STROKE = "rgba(34,197,94,0.4)";

// ─── Seat info ─────────────────────────────────────────────────────────────────

export interface SeatInfo {
  seatNumber: number;
  status: string;
  guestName?: string;
  guestEmail?: string;
  rsvpId?: string;
}

export function buildSeatMap(totalSeats: number, rsvps: RSVP[]): SeatInfo[] {
  const map = new Map<number, SeatInfo>();
  for (const rsvp of rsvps) {
    if (rsvp.seatNumber != null) {
      map.set(rsvp.seatNumber, {
        seatNumber: rsvp.seatNumber,
        status: rsvp.status,
        guestName: rsvp.name,
        guestEmail: rsvp.email,
        rsvpId: rsvp.id,
      });
    }
  }
  return Array.from({ length: totalSeats }, (_, i) => {
    const n = i + 1;
    return map.get(n) ?? { seatNumber: n, status: "available" };
  });
}

// ─── Stage bar (banquet layouts) ───────────────────────────────────────────────

const VIP_GOLD       = "#d4af37";
const VIP_GOLD_SOFT  = "rgba(212,175,55,0.10)";
const VIP_GOLD_RING  = "rgba(212,175,55,0.55)";
const VIP_GOLD_FILL  = "rgba(212,175,55,0.18)";

function StageBar({ width }: { width?: number | string }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center"
      style={{
        width: width ?? "100%",
        height: 32,
        background: "rgba(61,155,245,0.08)",
        border: "1px solid rgba(61,155,245,0.25)",
        fontSize: 11,
        fontWeight: 700,
        color: "rgba(61,155,245,0.7)",
        letterSpacing: "0.2em",
      }}
    >
      STAGE
    </div>
  );
}

export interface VipTableGroup {
  table: VipTable;
  tableIndex: number;
  seats: SeatInfo[];
}

export function buildVipTableGroups(
  allSeats: SeatInfo[],
  config: SeatingConfig | undefined,
  totalStandardSeats: number
): VipTableGroup[] {
  const ranges = getVipSeatRanges(config, totalStandardSeats);
  return ranges.map((r) => ({
    table: r.table,
    tableIndex: r.tableIndex,
    seats: allSeats.slice(r.start - 1, r.end),
  }));
}

// ─── Individual seat (grid layouts) ───────────────────────────────────────────

interface SeatProps {
  seat: SeatInfo;
  shape: "circle" | "rect";
  selectionMode: boolean;
  isHighlighted?: boolean;
  isCancelled?: boolean;                      // post-cancel red highlight (takes precedence over isHighlighted)
  isTableMode?: boolean;
  displayNumber?: number;                     // position-within-row, shown inside the seat in seat mode
  onAssign?: (seatNumber: number) => void;   // selection mode: assign seat
  onInspect?: (seat: SeatInfo) => void;       // view mode: show detail panel
  dropId?: string;                            // when set, wraps the seat in a @dnd-kit droppable
}

export function SeatEl({ seat, shape, selectionMode, isHighlighted, isCancelled, isTableMode, displayNumber, onAssign, onInspect, dropId }: SeatProps) {
  const isAvailable  = seat.status === "available";
  const isSelectable = selectionMode && isAvailable;
  const isDisabled   = selectionMode && !isAvailable;
  const isInspectable = !selectionMode && !!seat.guestName;

  const c = STATUS_COLORS[seat.status] ?? STATUS_COLORS.available;
  const SEAT_SIZE = 24;
  const showNumber = !isTableMode && displayNumber != null;

  const baseFill   = isSelectable ? SELECTABLE_FILL   : c.fill;
  const baseStroke = isSelectable ? SELECTABLE_STROKE : c.stroke;

  const handleClick = () => {
    if (isSelectable) onAssign?.(seat.seatNumber);
    else if (isInspectable) onInspect?.(seat);
  };

  const isClickable = isSelectable || isInspectable;

  return (
    <MaybeDroppable id={dropId}>
    <div
      title={
        seat.guestName
          ? `${seat.seatNumber} · ${seat.guestName}`
          : `${isTableMode ? "Table" : "Seat"} ${seat.seatNumber}${isSelectable ? " · Click to assign" : ""}`
      }
      onClick={isClickable ? handleClick : undefined}
      style={{
        width:          SEAT_SIZE,
        height:         SEAT_SIZE,
        background:     isCancelled ? "rgba(239,68,68,0.35)" : isHighlighted ? "rgba(61,155,245,0.35)" : baseFill,
        border:         `1.5px solid ${isCancelled ? "#ef4444" : isHighlighted ? "var(--accent)" : baseStroke}`,
        borderRadius:   shape === "circle" ? "50%" : 3,
        flexShrink:     0,
        cursor:         isClickable ? "pointer" : isDisabled ? "not-allowed" : "default",
        opacity:        isDisabled ? 0.4 : 1,
        boxShadow:      isCancelled ? "0 0 0 2px rgba(239,68,68,0.45)" : isHighlighted ? "0 0 0 2px rgba(61,155,245,0.4)" : "none",
        transition:     "border-color 120ms, background 120ms, box-shadow 120ms",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     "'Fira Code', monospace",
        fontSize:       9,
        fontWeight:     600,
        color:          isCancelled ? "#ef4444" : isHighlighted ? "var(--accent)" : c.dot,
        userSelect:     "none",
        lineHeight:     1,
      }}
      onMouseEnter={(e) => {
        if (isHighlighted || isCancelled) return;
        const el = e.currentTarget as HTMLElement;
        if (isSelectable) {
          el.style.boxShadow = `0 0 0 2px ${SELECTABLE_HOVER}`;
          el.style.background = "rgba(34,197,94,0.18)";
        } else if (isInspectable) {
          el.style.boxShadow = `0 0 0 2px ${c.stroke}`;
          el.style.background = c.fill.replace("0.18", "0.28");
        }
      }}
      onMouseLeave={(e) => {
        if (isHighlighted || isCancelled) return;
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "none";
        el.style.background = baseFill;
      }}
    >
      {showNumber ? displayNumber : null}
    </div>
    </MaybeDroppable>
  );
}

// ─── Grid seat map (theater / auditorium / classroom) ─────────────────────────

export function GridSeatMap({
  seats, seatsPerRow, style, selectionMode, highlightedSeat, cancelledSeat,
  isTableMode,
  onSeatAssign, onSeatInspect, getSeatDropId,
}: {
  seats: SeatInfo[];
  seatsPerRow: number;
  style: "theater" | "auditorium" | "classroom";
  selectionMode: boolean;
  highlightedSeat: number | null;
  cancelledSeat: number | null;
  isTableMode: boolean;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
  getSeatDropId?: (seatNumber: number) => string | undefined;
}) {
  const rows: SeatInfo[][] = [];
  for (let i = 0; i < seats.length; i += seatsPerRow) {
    rows.push(seats.slice(i, i + seatsPerRow));
  }

  return (
    <div className="space-y-5">
      {style === "classroom" && (
        <div
          className="rounded mx-auto flex items-center justify-center"
          style={{
            height: 22, maxWidth: seatsPerRow * 26,
            background: "rgba(61,155,245,0.1)",
            border: "1px solid rgba(61,155,245,0.3)",
            fontSize: 10, fontWeight: 700,
            color: "rgba(61,155,245,0.7)", letterSpacing: "0.15em",
          }}
        >
          BOARD
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-center gap-2">
            <span
              className="text-xs font-mono w-6 shrink-0 text-center select-none mr-1"
              style={{
                color: isTableMode ? "var(--muted)" : "var(--accent)",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {isTableMode ? ri + 1 : String.fromCharCode(65 + ri)}
            </span>
            <div className="flex gap-1 flex-wrap" style={{ marginLeft: style === "auditorium" ? ri * 4 : 0 }}>
              {row.map((seat, idx) => (
                <SeatEl
                  key={seat.seatNumber}
                  seat={seat}
                  shape={style === "classroom" ? "rect" : "circle"}
                  selectionMode={selectionMode}
                  isHighlighted={highlightedSeat === seat.seatNumber}
                  isCancelled={cancelledSeat === seat.seatNumber}
                  isTableMode={isTableMode}
                  displayNumber={idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
                  dropId={getSeatDropId?.(seat.seatNumber)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {(style === "theater" || style === "auditorium") && (
        <div className="space-y-1.5 mt-2">
          <div className="rounded mx-auto" style={{ height: 8, maxWidth: seatsPerRow * 26, background: "rgba(61,155,245,0.25)", border: "1px solid rgba(61,155,245,0.4)" }} />
          <p className="text-center text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)", letterSpacing: "0.2em" }}>Stage</p>
        </div>
      )}
    </div>
  );
}

// ─── Runway seat map (stage front, red carpet center aisle, seats on sides) ────

export function RunwaySeatMap({
  seats, seatsPerRow, selectionMode, highlightedSeat, cancelledSeat,
  isTableMode,
  onSeatAssign, onSeatInspect, getSeatDropId,
}: {
  seats: SeatInfo[];
  seatsPerRow: number;
  selectionMode: boolean;
  highlightedSeat: number | null;
  cancelledSeat: number | null;
  isTableMode: boolean;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
  getSeatDropId?: (seatNumber: number) => string | undefined;
}) {
  const perSide = seatsPerRow;
  const fullRowSize = perSide * 2;
  const rows: SeatInfo[][] = [];
  for (let i = 0; i < seats.length; i += fullRowSize) {
    rows.push(seats.slice(i, i + fullRowSize));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Stage */}
      <div
        className="rounded-lg flex items-center justify-center"
        style={{
          width: "100%",
          maxWidth: perSide * 52 + 60,
          height: 28,
          background: "rgba(61,155,245,0.08)",
          border: "1px solid rgba(61,155,245,0.25)",
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(61,155,245,0.7)",
          letterSpacing: "0.2em",
        }}
      >
        STAGE
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5 mt-1">
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-center">
            {/* Row label */}
            <span
              className="text-xs font-mono w-6 shrink-0 text-center select-none mr-2"
              style={{
                color: isTableMode ? "var(--muted)" : "var(--accent)",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {isTableMode ? ri + 1 : String.fromCharCode(65 + ri)}
            </span>
            {/* Left side */}
            <div className="flex gap-1">
              {row.slice(0, perSide).map((seat, idx) => (
                <SeatEl
                  key={seat.seatNumber}
                  seat={seat}
                  shape="circle"
                  selectionMode={selectionMode}
                  isHighlighted={highlightedSeat === seat.seatNumber}
                  isCancelled={cancelledSeat === seat.seatNumber}
                  isTableMode={isTableMode}
                  displayNumber={idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
                  dropId={getSeatDropId?.(seat.seatNumber)}
                />
              ))}
            </div>
            {/* Red carpet aisle */}
            <div style={{ width: 32, flexShrink: 0, display: "flex", justifyContent: "center", marginInline: 4 }}>
              <div
                style={{
                  width: 10,
                  height: 22,
                  background: "rgba(220,38,38,0.18)",
                  borderRadius: 3,
                  border: "1px solid rgba(220,38,38,0.3)",
                }}
              />
            </div>
            {/* Right side */}
            <div className="flex gap-1">
              {row.slice(perSide).map((seat, idx) => (
                <SeatEl
                  key={seat.seatNumber}
                  seat={seat}
                  shape="circle"
                  selectionMode={selectionMode}
                  isHighlighted={highlightedSeat === seat.seatNumber}
                  isCancelled={cancelledSeat === seat.seatNumber}
                  isTableMode={isTableMode}
                  displayNumber={perSide + idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
                  dropId={getSeatDropId?.(seat.seatNumber)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Invisible placeholder that occupies EXACTLY one table-card's footprint, so
// padding an incomplete/reduced row keeps the remaining tables column-aligned
// with full rows and the centre aisle stays straight. Mirrors the standard
// BanquetTableCell box model (border + padding + svg of svgSize).
function TableCellSpacer({ svgSize }: { svgSize: number }) {
  return (
    <div
      aria-hidden
      style={{
        flex: 1,
        minWidth: svgSize,
        padding: "12px 10px 10px",
        border: "1px solid transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        visibility: "hidden",
      }}
    >
      <svg width={svgSize} height={svgSize} />
    </div>
  );
}

// ─── Banquet seat map ──────────────────────────────────────────────────────────

export function BanquetSeatMap({
  seats, seatsPerTable, tablesPerSide, frontRowTablesPerSide, selectionMode, highlightedSeat, cancelledSeat,
  isTableMode,
  vipTableGroups = [],
  onSeatAssign, onSeatInspect, getSeatDropId, getTableDropId, onTableSelect,
}: {
  seats: SeatInfo[]; // standard seats only (excludes VIP seats — those come via vipTableGroups)
  seatsPerTable: number;
  tablesPerSide?: number;
  frontRowTablesPerSide?: number; // banquet only — smaller FIRST row (drops inner tables to widen front aisle)
  selectionMode: boolean;
  highlightedSeat: number | null;
  cancelledSeat: number | null;
  isTableMode: boolean;
  vipTableGroups?: VipTableGroup[];
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
  getSeatDropId?: (seatNumber: number) => string | undefined;
  getTableDropId?: (tableIndex: number, variant: "vip" | "standard") => string | undefined;
  onTableSelect?: (tableIndex: number, variant: "vip" | "standard") => void;
}) {
  const tables: SeatInfo[][] = [];
  for (let i = 0; i < seats.length; i += seatsPerTable) {
    tables.push(seats.slice(i, i + seatsPerTable));
  }

  const TABLE_R = 34;
  const SEAT_R  = 9;
  const ORBIT_R = TABLE_R + SEAT_R + 5;
  const SVG_SIZE = (ORBIT_R + SEAT_R + 4) * 2;

  const stageAndVip = (
    <div className="flex flex-col items-stretch gap-3 w-full" style={{ marginBottom: vipTableGroups.length > 0 ? 4 : 0 }}>
      <StageBar />
      {vipTableGroups.length > 0 && (
        <div className="flex items-stretch gap-2 justify-center flex-wrap">
          {vipTableGroups.map((g) => (
            <BanquetTableCell
              key={g.table.id}
              tableSeats={g.seats}
              tableIndex={g.tableIndex}
              getSeatDropId={getSeatDropId}
              tableDropId={getTableDropId?.(g.tableIndex, "vip")}
              seatsPerTable={g.table.seats}
              selectionMode={selectionMode}
              highlightedSeat={highlightedSeat}
              cancelledSeat={cancelledSeat}
              isTableMode={isTableMode}
              onSeatAssign={onSeatAssign}
              onSeatInspect={onSeatInspect}
              onTableSelect={onTableSelect}
              tableR={TABLE_R}
              seatR={SEAT_R}
              orbitR={ORBIT_R}
              svgSize={SVG_SIZE}
              variant="vip"
              tableLabel={g.table.label}
            />
          ))}
        </div>
      )}
    </div>
  );

  // New mode: explicit tablesPerSide → fixed left/right structure per row.
  if (tablesPerSide != null) {
    const perRow = tablesPerSide * 2;
    // Optional smaller FIRST row: drop the inner tables nearest the centre so
    // the front of the room gets a wider aisle / dance floor. Defaults to
    // tablesPerSide (uniform rows — unchanged behaviour for every other event).
    const frontPerSide = Math.max(1, Math.min(tablesPerSide, frontRowTablesPerSide ?? tablesPerSide));
    const firstRowCount = frontPerSide * 2;
    const hasFrontRow = frontPerSide < tablesPerSide;

    // Build rows, recording each row's starting GLOBAL table index. tableIndex
    // must stay equal to the seat-block index (tables[k] = seats k*spt+1…) so
    // the positional label sites — caption `Table {tableIndex+1}` and the
    // per-seat tooltip `ceil(seatNumber/spt)` — always agree.
    const rows: { startTi: number; tables: SeatInfo[][]; perSide: number; isFront: boolean }[] = [];
    if (tables.length > 0) {
      rows.push({
        startTi: 0,
        tables: tables.slice(0, firstRowCount),
        perSide: frontPerSide,
        isFront: hasFrontRow,
      });
    }
    for (let i = firstRowCount; i < tables.length; i += perRow) {
      rows.push({ startTi: i, tables: tables.slice(i, i + perRow), perSide: tablesPerSide, isFront: false });
    }

    return (
      <div className="flex flex-col items-center gap-3 w-full">
        {stageAndVip}
        {rows.map((row, ri) => {
          const { startTi, perSide, isFront } = row;
          const leftTables  = row.tables.slice(0, perSide);
          const rightTables = row.tables.slice(perSide);
          // Pad to the widest row's per-side count so outer columns line up.
          // A reduced front row pads its INNER edges (toward the gutter) so the
          // missing tables read as a centre aisle; other rows keep the original
          // outer padding used for a partial last row.
          const leftPad       = tablesPerSide - leftTables.length;
          const rightInnerPad = isFront ? tablesPerSide - rightTables.length : 0;
          const rightOuterPad = isFront ? 0 : tablesPerSide - rightTables.length;
          return (
            <div key={ri} className="flex items-stretch gap-2 w-full justify-center">
              <div className="flex items-stretch gap-2" style={{ flex: 1, minWidth: 0 }}>
                {leftTables.map((tableSeats, li) => (
                  <BanquetTableCell
                    key={li}
                    tableSeats={tableSeats}
                    tableIndex={startTi + li}
                    getSeatDropId={getSeatDropId}
                    tableDropId={getTableDropId?.(startTi + li, "standard")}
                    seatsPerTable={seatsPerTable}
                    selectionMode={selectionMode}
                    highlightedSeat={highlightedSeat}
                    cancelledSeat={cancelledSeat}
                    isTableMode={isTableMode}
                    onSeatAssign={onSeatAssign}
                    onSeatInspect={onSeatInspect}
                    onTableSelect={onTableSelect}
                    tableR={TABLE_R}
                    seatR={SEAT_R}
                    orbitR={ORBIT_R}
                    svgSize={SVG_SIZE}
                  />
                ))}
                {Array.from({ length: leftPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-l-${i}`} svgSize={SVG_SIZE} />
                ))}
              </div>

              {/* Center gutter — banquet has no aisle, just visual space */}
              <div style={{ width: 24, flexShrink: 0 }} />

              <div className="flex items-stretch gap-2" style={{ flex: 1, minWidth: 0 }}>
                {Array.from({ length: rightInnerPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-ri-${i}`} svgSize={SVG_SIZE} />
                ))}
                {rightTables.map((tableSeats, ri2) => (
                  <BanquetTableCell
                    key={ri2}
                    tableSeats={tableSeats}
                    tableIndex={startTi + perSide + ri2}
                    getSeatDropId={getSeatDropId}
                    tableDropId={getTableDropId?.(startTi + perSide + ri2, "standard")}
                    seatsPerTable={seatsPerTable}
                    selectionMode={selectionMode}
                    highlightedSeat={highlightedSeat}
                    cancelledSeat={cancelledSeat}
                    isTableMode={isTableMode}
                    onSeatAssign={onSeatAssign}
                    onSeatInspect={onSeatInspect}
                    onTableSelect={onTableSelect}
                    tableR={TABLE_R}
                    seatR={SEAT_R}
                    orbitR={ORBIT_R}
                    svgSize={SVG_SIZE}
                  />
                ))}
                {Array.from({ length: rightOuterPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-r-${i}`} svgSize={SVG_SIZE} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Legacy mode: no tablesPerSide → keep responsive grid.
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {stageAndVip}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center w-full">
      {tables.map((tableSeats, ti) => (
        <BanquetTableCell
          key={ti}
          tableSeats={tableSeats}
          tableIndex={ti}
          getSeatDropId={getSeatDropId}
          tableDropId={getTableDropId?.(ti, "standard")}
          seatsPerTable={seatsPerTable}
          selectionMode={selectionMode}
          highlightedSeat={highlightedSeat}
          cancelledSeat={cancelledSeat}
          isTableMode={isTableMode}
          onSeatAssign={onSeatAssign}
          onSeatInspect={onSeatInspect}
          onTableSelect={onTableSelect}
          tableR={TABLE_R}
          seatR={SEAT_R}
          orbitR={ORBIT_R}
          svgSize={SVG_SIZE}
        />
      ))}
      </div>
    </div>
  );
}

// ─── Banquet-Runway seat map (stage front, red carpet aisle, round tables on each side) ───

export function BanquetRunwaySeatMap({
  seats, seatsPerTable, tablesPerSide, frontRowTablesPerSide, selectionMode, highlightedSeat, cancelledSeat,
  isTableMode,
  vipTableGroups = [],
  onSeatAssign, onSeatInspect, getSeatDropId, getTableDropId, onTableSelect,
}: {
  seats: SeatInfo[];
  seatsPerTable: number;
  tablesPerSide: number;
  frontRowTablesPerSide?: number; // smaller FIRST row (drops inner tables nearest the aisle to widen the front)
  selectionMode: boolean;
  highlightedSeat: number | null;
  cancelledSeat: number | null;
  isTableMode: boolean;
  vipTableGroups?: VipTableGroup[];
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
  getSeatDropId?: (seatNumber: number) => string | undefined;
  getTableDropId?: (tableIndex: number, variant: "vip" | "standard") => string | undefined;
  onTableSelect?: (tableIndex: number, variant: "vip" | "standard") => void;
}) {
  const tables: SeatInfo[][] = [];
  for (let i = 0; i < seats.length; i += seatsPerTable) {
    tables.push(seats.slice(i, i + seatsPerTable));
  }

  const TABLE_R = 34;
  const SEAT_R  = 9;
  const ORBIT_R = TABLE_R + SEAT_R + 5;
  const SVG_SIZE = (ORBIT_R + SEAT_R + 4) * 2;

  // Pack N tables on each side per row. T1..Tn = left of row 1, T(n+1)..T(2n) = right of row 1, etc.
  const perRow = tablesPerSide * 2;
  // Optional smaller FIRST row: drop the inner tables nearest the aisle so the
  // front of the room gets a wider gap. Defaults to tablesPerSide (uniform).
  const frontPerSide = Math.max(1, Math.min(tablesPerSide, frontRowTablesPerSide ?? tablesPerSide));
  const firstRowCount = frontPerSide * 2;
  const hasFrontRow = frontPerSide < tablesPerSide;
  // Rows carry their starting GLOBAL table index so tableIndex stays equal to
  // the seat-block index (positional labels must agree across all sites).
  const rows: { startTi: number; tables: SeatInfo[][]; perSide: number; isFront: boolean }[] = [];
  if (tables.length > 0) {
    rows.push({ startTi: 0, tables: tables.slice(0, firstRowCount), perSide: frontPerSide, isFront: hasFrontRow });
  }
  for (let i = firstRowCount; i < tables.length; i += perRow) {
    rows.push({ startTi: i, tables: tables.slice(i, i + perRow), perSide: tablesPerSide, isFront: false });
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <StageBar />

      {vipTableGroups.length > 0 && (
        <div className="flex items-stretch gap-2 justify-center flex-wrap">
          {vipTableGroups.map((g) => (
            <BanquetTableCell
              key={g.table.id}
              tableSeats={g.seats}
              tableIndex={g.tableIndex}
              getSeatDropId={getSeatDropId}
              tableDropId={getTableDropId?.(g.tableIndex, "vip")}
              seatsPerTable={g.table.seats}
              selectionMode={selectionMode}
              highlightedSeat={highlightedSeat}
              cancelledSeat={cancelledSeat}
              isTableMode={isTableMode}
              onSeatAssign={onSeatAssign}
              onSeatInspect={onSeatInspect}
              onTableSelect={onTableSelect}
              tableR={TABLE_R}
              seatR={SEAT_R}
              orbitR={ORBIT_R}
              svgSize={SVG_SIZE}
              variant="vip"
              tableLabel={g.table.label}
            />
          ))}
        </div>
      )}

      {/* Rows of (N tables) | aisle | (N tables) */}
      <div className="flex flex-col gap-2 w-full">
        {rows.map((row, ri) => {
          const { startTi, perSide, isFront } = row;
          const leftTables  = row.tables.slice(0, perSide);
          const rightTables = row.tables.slice(perSide);
          // A reduced front row pads its INNER edges (toward the aisle) so the
          // missing tables widen the centre; other rows keep outer padding.
          const leftPad       = tablesPerSide - leftTables.length;
          const rightInnerPad = isFront ? tablesPerSide - rightTables.length : 0;
          const rightOuterPad = isFront ? 0 : tablesPerSide - rightTables.length;
          return (
            <div key={ri} className="flex items-stretch gap-2 w-full">
              {/* Left side */}
              <div className="flex items-stretch gap-2" style={{ flex: 1, minWidth: 0 }}>
                {leftTables.map((tableSeats, li) => (
                  <BanquetTableCell
                    key={li}
                    tableSeats={tableSeats}
                    tableIndex={startTi + li}
                    getSeatDropId={getSeatDropId}
                    tableDropId={getTableDropId?.(startTi + li, "standard")}
                    seatsPerTable={seatsPerTable}
                    selectionMode={selectionMode}
                    highlightedSeat={highlightedSeat}
                    cancelledSeat={cancelledSeat}
                    isTableMode={isTableMode}
                    onSeatAssign={onSeatAssign}
                    onSeatInspect={onSeatInspect}
                    onTableSelect={onTableSelect}
                    tableR={TABLE_R}
                    seatR={SEAT_R}
                    orbitR={ORBIT_R}
                    svgSize={SVG_SIZE}
                  />
                ))}
                {/* Pad missing left tables to keep alignment (inner edge) */}
                {Array.from({ length: leftPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-l-${i}`} svgSize={SVG_SIZE} />
                ))}
              </div>

              {/* Red carpet aisle */}
              <div style={{ width: 28, display: "flex", justifyContent: "center", alignItems: "stretch" }}>
                <div
                  style={{
                    width: 10,
                    background: "rgba(220,38,38,0.18)",
                    borderRadius: 3,
                    border: "1px solid rgba(220,38,38,0.3)",
                  }}
                />
              </div>

              {/* Right side */}
              <div className="flex items-stretch gap-2" style={{ flex: 1, minWidth: 0 }}>
                {Array.from({ length: rightInnerPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-ri-${i}`} svgSize={SVG_SIZE} />
                ))}
                {rightTables.map((tableSeats, ri2) => (
                  <BanquetTableCell
                    key={ri2}
                    tableSeats={tableSeats}
                    tableIndex={startTi + perSide + ri2}
                    getSeatDropId={getSeatDropId}
                    tableDropId={getTableDropId?.(startTi + perSide + ri2, "standard")}
                    seatsPerTable={seatsPerTable}
                    selectionMode={selectionMode}
                    highlightedSeat={highlightedSeat}
                    cancelledSeat={cancelledSeat}
                    isTableMode={isTableMode}
                    onSeatAssign={onSeatAssign}
                    onSeatInspect={onSeatInspect}
                    onTableSelect={onTableSelect}
                    tableR={TABLE_R}
                    seatR={SEAT_R}
                    orbitR={ORBIT_R}
                    svgSize={SVG_SIZE}
                  />
                ))}
                {Array.from({ length: rightOuterPad }).map((_, i) => (
                  <TableCellSpacer key={`pad-r-${i}`} svgSize={SVG_SIZE} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BanquetTableCell({
  tableSeats, tableIndex, seatsPerTable, selectionMode, highlightedSeat, cancelledSeat, isTableMode,
  onSeatAssign, onSeatInspect, onTableSelect,
  tableR, seatR, orbitR, svgSize,
  variant = "standard", tableLabel,
  getSeatDropId, tableDropId,
}: {
  tableSeats: SeatInfo[];
  tableIndex: number;
  seatsPerTable: number;
  selectionMode: boolean;
  highlightedSeat: number | null;
  cancelledSeat: number | null;
  isTableMode: boolean;
  /** When provided AND selectionMode is on, clicking the table card fires
   *  this callback (instead of clicking individual seats) so the page can
   *  open the table seat-picker modal. */
  onTableSelect?: (tableIndex: number, variant: "vip" | "standard") => void;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
  tableR: number;
  seatR: number;
  orbitR: number;
  svgSize: number;
  variant?: "standard" | "vip";
  /** Override the "T{n+1}" label inside the table circle (used for VIP tables). */
  tableLabel?: string;
  getSeatDropId?: (seatNumber: number) => string | undefined;
  tableDropId?: string;
}) {
  const occupiedSeats = tableSeats.filter((s) => s.status !== "available");
  const isVip = variant === "vip";
  const innerLabel = isVip ? vipTableShortLabel(tableIndex) : (tableLabel ?? `T${tableIndex + 1}`);
  // In selection mode AND when the page wants table-level clicks (page-allocator
  // flow), the entire card becomes the click target — individual seat circles
  // stop being directly clickable so the only entry point is the table picker.
  const tableLevelClick = selectionMode && !!onTableSelect;
  const effectiveSeatAssign = tableLevelClick ? undefined : onSeatAssign;
  return (
    <MaybeDroppableBlock id={tableDropId} style={{ flex: 1, minWidth: isVip ? svgSize * 2.4 : svgSize }}>
    <div
      onClick={tableLevelClick ? () => onTableSelect!(tableIndex, isVip ? "vip" : "standard") : undefined}
      style={{
        flex: 1,
        width: "100%",
        border: `1px solid ${isVip ? VIP_GOLD_RING : "var(--border)"}`,
        borderRadius: 12,
        padding: isVip ? "14px 28px 12px" : "12px 10px 10px",
        background: isVip ? VIP_GOLD_SOFT : "var(--surface-2)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minWidth: isVip ? svgSize * 2.4 : svgSize,
        cursor: tableLevelClick ? "pointer" : undefined,
        transition: "border-color 120ms, background 120ms, box-shadow 120ms",
      }}
      onMouseEnter={(e) => {
        if (!tableLevelClick) return;
        (e.currentTarget as HTMLElement).style.borderColor = isVip ? VIP_GOLD : SELECTABLE_HOVER;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${isVip ? "rgba(212,175,55,0.55)" : SELECTABLE_HOVER}`;
      }}
      onMouseLeave={(e) => {
        if (!tableLevelClick) return;
        (e.currentTarget as HTMLElement).style.borderColor = isVip ? VIP_GOLD_RING : "var(--border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {isVip && (
        <div
          className="rounded-full"
          style={{
            background: "rgba(212,175,55,0.18)",
            color: VIP_GOLD,
            border: `1px solid ${VIP_GOLD_RING}`,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.15em",
            padding: "1px 8px",
            marginBottom: 6,
          }}
        >
          VIP
        </div>
      )}
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} overflow="visible">
        <circle
          cx={svgSize / 2}
          cy={svgSize / 2}
          r={tableR}
          fill={isVip ? "rgba(212,175,55,0.10)" : "var(--surface-3)"}
          stroke={isVip ? VIP_GOLD_RING : "var(--border)"}
          strokeWidth="1.5"
        />
        <text
          x={svgSize / 2}
          y={svgSize / 2 + 4}
          textAnchor="middle"
          fontSize="10"
          fill={isVip ? VIP_GOLD : "var(--muted)"}
          fontFamily="'Fira Code', monospace"
        >
          {innerLabel}
        </text>
        {tableSeats.map((seat, si) => {
          const angle = (si / tableSeats.length) * Math.PI * 2 - Math.PI / 2;
          const sx = svgSize / 2 + Math.cos(angle) * orbitR;
          const sy = svgSize / 2 + Math.sin(angle) * orbitR;
          const isAvailable   = seat.status === "available";
          const isSelectable  = selectionMode && isAvailable;
          const isDisabled    = selectionMode && !isAvailable;
          const isInspectable = !selectionMode && !!seat.guestName;
          const isHighlighted = highlightedSeat === seat.seatNumber;
          const isCancelled   = cancelledSeat === seat.seatNumber;
          const c = STATUS_COLORS[seat.status] ?? STATUS_COLORS.available;

          const vipAvailable = isVip && isAvailable && !isSelectable;
          const fill   = isCancelled ? "rgba(239,68,68,0.35)" : isHighlighted ? "rgba(61,155,245,0.35)" : isSelectable ? SELECTABLE_FILL   : vipAvailable ? VIP_GOLD_FILL : c.fill;
          const stroke = isCancelled ? "#ef4444"              : isHighlighted ? "var(--accent)"          : isSelectable ? SELECTABLE_STROKE : vipAvailable ? VIP_GOLD_RING : c.stroke;
          const emphasized = isHighlighted || isCancelled;

          return (
            <circle
              key={si}
              cx={sx} cy={sy} r={seatR}
              fill={fill} stroke={stroke} strokeWidth={emphasized ? 2 : 1.5}
              opacity={isDisabled ? 0.4 : 1}
              style={{
                cursor: (isSelectable || isInspectable) ? "pointer" : isDisabled ? "not-allowed" : "default",
                transition: "fill 120ms, stroke 120ms",
                filter: isCancelled ? "drop-shadow(0 0 4px rgba(239,68,68,0.55))" : isHighlighted ? "drop-shadow(0 0 4px rgba(61,155,245,0.5))" : "none",
              }}
              onClick={(e) => {
                if (tableLevelClick) {
                  // Let the click bubble to the table card so the picker opens
                  // for the whole table — don't allocate this specific seat.
                  return;
                }
                if (isSelectable) {
                  e.stopPropagation();
                  effectiveSeatAssign?.(seat.seatNumber);
                } else if (isInspectable) {
                  e.stopPropagation();
                  onSeatInspect?.(seat);
                }
              }}
              onMouseEnter={(e) => {
                if (isHighlighted || isCancelled) return;
                const el = e.currentTarget as SVGCircleElement;
                if (isSelectable) {
                  el.setAttribute("fill", "rgba(34,197,94,0.28)");
                  el.setAttribute("stroke", SELECTABLE_HOVER);
                } else if (isInspectable) {
                  el.setAttribute("fill", c.fill.replace("0.18", "0.32"));
                  el.setAttribute("stroke-width", "2");
                }
              }}
              onMouseLeave={(e) => {
                if (isHighlighted || isCancelled) return;
                const el = e.currentTarget as SVGCircleElement;
                el.setAttribute("fill", fill);
                el.setAttribute("stroke", stroke);
                el.setAttribute("stroke-width", emphasized ? "2" : "1.5");
              }}
            >
              <title>
                {(() => {
                  const seatLabel = isVip
                    ? `${innerLabel} · Seat ${si + 1}`
                    : isTableMode
                      ? `Table ${Math.ceil(seat.seatNumber / seatsPerTable)}`
                      : `Seat ${seat.seatNumber}`;
                  if (seat.guestName) {
                    return `${seatLabel} · ${seat.guestName}${isInspectable ? " · Click for details" : ""}`;
                  }
                  return `${seatLabel}${isSelectable ? " · Click to assign" : ""}`;
                })()}
              </title>
            </circle>
          );
        })}
      </svg>

      {!isVip && (
        <p
          className="text-[10px] font-mono uppercase tracking-wider mt-1 mb-1.5"
          style={{ color: "var(--muted)" }}
        >
          Table {tableIndex + 1}
        </p>
      )}

      <div style={{ width: "100%", height: 1, background: "var(--border)", marginTop: isVip ? 8 : 0, marginBottom: 6 }} />

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
        {occupiedSeats.length > 0 ? (
          occupiedSeats.map((s) => (
            <p
              key={s.seatNumber}
              style={{
                fontSize: 10,
                color: "var(--foreground)",
                opacity: 0.85,
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.guestName}
            </p>
          ))
        ) : (
          <p style={{ fontSize: 10, color: "var(--muted)", margin: 0, fontStyle: "italic" }}>Empty</p>
        )}
      </div>
    </div>
    </MaybeDroppableBlock>
  );
}

// ─── Seat detail panel ─────────────────────────────────────────────────────────

export function SeatDetailPanel({
  seat, onDismiss, isTableMode, perGroup, seatingConfig, totalStandardSeats, onReassign, onCancel,
}: {
  seat: SeatInfo;
  onDismiss: () => void;
  isTableMode: boolean;
  perGroup: number;
  seatingConfig: SeatingConfig;
  totalStandardSeats: number;
  onReassign?: (rsvpId: string, guestName: string) => void;
  onCancel?: (rsvpId: string) => Promise<void>;
}) {
  const c = STATUS_COLORS[seat.status] ?? STATUS_COLORS.available;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Reset confirm state when admin switches to a different seat
  useEffect(() => {
    setConfirmingCancel(false);
    setCancelling(false);
  }, [seat.seatNumber]);

  const handleCancelClick = async () => {
    if (!onCancel || !seat.rsvpId) return;
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    setCancelling(true);
    try {
      await onCancel(seat.rsvpId);
      // Modal stays open; parent's Firestore subscription will re-render this
      // panel as an empty-seat view, naturally hiding Change/Cancel buttons.
    } catch {
      // Parent surfaces the error; just reset local state so admin can retry
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };
  const vipInfo = getVipSeatRanges(seatingConfig, totalStandardSeats)
    .find((r) => seat.seatNumber >= r.start && seat.seatNumber <= r.end);
  const isVip = !!vipInfo;
  const label = isVip ? "VIP Table" : isTableMode ? "Table" : "Seat";
  const seatLabel = !isVip && !isTableMode ? getSeatLabel(seat.seatNumber, seatingConfig) : null;
  const displayNumber = isVip
    ? vipInfo!.tableIndex + 1
    : isTableMode
      ? Math.ceil(seat.seatNumber / perGroup)
      : seatLabel
        ? `${seatLabel.row}${seatLabel.pos}`
        : seat.seatNumber;

  return (
    <motion.div
      key={seat.seatNumber}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="shrink-0"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-4 px-6 py-4">
        {/* Seat/Table number badge */}
        <div
          className="flex flex-col items-center justify-center rounded-xl shrink-0"
          style={{
            width: 52,
            height: 52,
            background: c.fill,
            border: `1.5px solid ${c.stroke}`,
          }}
        >
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: c.dot }}>{label}</span>
          <span className="text-lg font-bold leading-tight" style={{ color: c.dot, fontFamily: "'Fira Code', monospace" }}>
            {displayNumber}
          </span>
        </div>

        {/* Guest info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{seat.guestName}</p>
          {seat.guestEmail && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>{seat.guestEmail}</p>
          )}
          {/* Status badge */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: c.dot }}
            />
            <span className="text-[10px] font-medium" style={{ color: c.dot }}>
              {c.label}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Change seat button — only for allocated guests */}
          {onReassign && seat.rsvpId && seat.guestName && seat.status === "allocated" && !confirmingCancel && (
            <button
              onClick={() => onReassign(seat.rsvpId!, seat.guestName!)}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
              style={{
                background: "rgba(61,155,245,0.1)",
                color: "var(--accent)",
                border: "1px solid rgba(61,155,245,0.25)",
                opacity: cancelling ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(61,155,245,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(61,155,245,0.1)"; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Change {label}
            </button>
          )}

          {/* Cancel seat button — only for allocated guests; two-step inline confirm */}
          {onCancel && seat.rsvpId && seat.status === "allocated" && (
            <>
              {confirmingCancel && (
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                  style={{
                    background: "var(--surface-3)",
                    color: "white",
                    border: "1px solid var(--border)",
                    opacity: cancelling ? 0.5 : 1,
                  }}
                >
                  Keep
                </button>
              )}
              <button
                onClick={handleCancelClick}
                disabled={cancelling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
                style={{
                  background: confirmingCancel ? "#dc2626" : "rgba(220,38,38,0.1)",
                  color: confirmingCancel ? "white" : "#f87171",
                  border: `1px solid ${confirmingCancel ? "#dc2626" : "rgba(220,38,38,0.25)"}`,
                  opacity: cancelling ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (cancelling) return;
                  e.currentTarget.style.background = confirmingCancel ? "#b91c1c" : "rgba(220,38,38,0.2)";
                }}
                onMouseLeave={(e) => {
                  if (cancelling) return;
                  e.currentTarget.style.background = confirmingCancel ? "#dc2626" : "rgba(220,38,38,0.1)";
                }}
              >
                {!confirmingCancel && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                )}
                {cancelling ? "Cancelling…" : confirmingCancel ? `Confirm Cancel` : `Cancel ${label}`}
              </button>
            </>
          )}

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            aria-label="Dismiss seat details"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors shrink-0"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Edit Layout icon ─────────────────────────────────────────────────────────

function EditLayoutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

// ─── Main modal ────────────────────────────────────────────────────────────────

export default function SeatMapModal({
  open, onClose, event, rsvps,
  selectingFor = null,
  onSeatSelect,
  assigning = false,
  onReassign,
  onCancel,
  onLayoutChange,
}: Props) {
  const [selectedSeat, setSelectedSeat] = useState<SeatInfo | null>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<SeatingConfig | null>(null);
  const [pendingAssignmentMode, setPendingAssignmentMode] = useState<"seat" | "table">("seat");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  // Seat number that was just cancelled inline — rendered with a red highlight
  // ring so the admin sees confirmation of the deallocation, since Firestore
  // can take a moment to propagate the empty-seat state across the grid.
  const [recentlyCancelledSeat, setRecentlyCancelledSeat] = useState<number | null>(null);

  // Clear selection when modal closes or when entering selection mode (reassign)
  useEffect(() => {
    if (!open) {
      setSelectedSeat(null);
      setEditingLayout(false);
      setPendingConfig(null);
      setConfirmingClear(false);
      setRecentlyCancelledSeat(null);
    }
  }, [open]);

  useEffect(() => {
    if (selectingFor) setSelectedSeat(null);
  }, [selectingFor]);

  // Clear the red-cancelled mark when admin moves to a different seat
  useEffect(() => {
    if (recentlyCancelledSeat === null) return;
    if (selectedSeat && selectedSeat.seatNumber !== recentlyCancelledSeat) {
      setRecentlyCancelledSeat(null);
    }
  }, [selectedSeat, recentlyCancelledSeat]);

  // Wrap the user-supplied onCancel so we can mark the seat as recently
  // cancelled on success. The panel awaits this — order matters: parent's
  // updateRSVP first, then flip the red flag, so the grid re-renders with
  // both fresh data and the red highlight in the same React commit.
  const handlePanelCancel = useMemo(
    () => onCancel
      ? async (rsvpId: string) => {
          const seatNum = selectedSeat?.seatNumber ?? null;
          await onCancel(rsvpId);
          if (seatNum != null) setRecentlyCancelledSeat(seatNum);
        }
      : undefined,
    [onCancel, selectedSeat]
  );

  const enterEditLayout = () => {
    setPendingConfig(event.seatingConfig ?? { style: "theater", seatsPerRow: 10 });
    setPendingAssignmentMode(event.assignmentMode ?? "seat");
    setConfirmingClear(false);
    setEditingLayout(true);
  };

  const cancelEditLayout = () => {
    setEditingLayout(false);
    setPendingConfig(null);
    setConfirmingClear(false);
  };

  const handleSaveLayout = async () => {
    if (!pendingConfig || !onLayoutChange) return;
    const layoutChanged =
      pendingConfig.style !== event.seatingConfig?.style ||
      (pendingConfig.seatsPerRow ?? null) !== (event.seatingConfig?.seatsPerRow ?? null) ||
      (pendingConfig.seatsPerTable ?? null) !== (event.seatingConfig?.seatsPerTable ?? null);
    const allocatedCount = rsvps.filter(
      (r) => r.status === "allocated" || r.status === "checked_in"
    ).length;
    // Only show the destructive-clear confirmation when the layout actually changes.
    // A pure assignmentMode flip is cosmetic and keeps allocations intact.
    if (layoutChanged && allocatedCount > 0 && !confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setSavingLayout(true);
    try {
      await onLayoutChange(pendingConfig, pendingAssignmentMode);
      setEditingLayout(false);
      setPendingConfig(null);
      setConfirmingClear(false);
    } finally {
      setSavingLayout(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedSeat) { setSelectedSeat(null); return; }
        if (!assigning) onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, assigning, selectedSeat]);

  const totalSeatsAll = useMemo(
    () => getTotalSeatCount(event.seatingConfig, event.totalSeats),
    [event.seatingConfig, event.totalSeats]
  );
  const allSeats = useMemo(
    () => buildSeatMap(totalSeatsAll, rsvps),
    [totalSeatsAll, rsvps]
  );

  // Keep the selected-seat snapshot in sync with live seat data. Without this,
  // cancelling or reassigning from the panel leaves it pointing at a stale
  // SeatInfo captured at click time — the panel would keep showing the old
  // guest until the modal is reopened.
  useEffect(() => {
    if (!selectedSeat) return;
    const fresh = allSeats[selectedSeat.seatNumber - 1];
    if (!fresh) return;
    if (
      fresh.status !== selectedSeat.status ||
      fresh.rsvpId !== selectedSeat.rsvpId ||
      fresh.guestName !== selectedSeat.guestName
    ) {
      setSelectedSeat(fresh);
    }
  }, [allSeats, selectedSeat]);
  const config      = event.seatingConfig ?? { style: "theater" as const, seatsPerRow: 10 };
  const seatsPerRow   = config.seatsPerRow ?? 10;
  const seatsPerTable = config.seatsPerTable ?? 10;
  const selectionMode = !!selectingFor;
  const isTableMode   = event.assignmentMode === "table";
  const perGroup      = (config.style === "banquet" || config.style === "banquet-runway") ? seatsPerTable : seatsPerRow;

  // Split into standard seats (used by all renderers) and VIP table groups (only banquet variants render them).
  const standardSeats   = useMemo(() => allSeats.slice(0, event.totalSeats), [allSeats, event.totalSeats]);
  const vipTableGroups  = useMemo(
    () => buildVipTableGroups(allSeats, event.seatingConfig, event.totalSeats),
    [allSeats, event.seatingConfig, event.totalSeats]
  );
  // For stats and grid renderers we count every seat (standard + VIP).
  const seats = allSeats;

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of seats) counts[s.status] = (counts[s.status] ?? 0) + 1;
    return counts;
  }, [seats]);

  const statItems = [
    { key: "available",     label: "Available" },
    { key: "pending",       label: "Pending" },
    { key: "allocated",     label: "Allocated" },
    { key: "checked_in",    label: "Checked In" },
    { key: "not_attending", label: "Not Attending" },
  ].filter(({ key }) => (stats[key] ?? 0) > 0);

  const handleSeatInspect = (seat: SeatInfo) => {
    setSelectedSeat((prev) => prev?.seatNumber === seat.seatNumber ? null : seat);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !assigning) {
              setSelectedSeat(null);
              onClose();
            }
          }}
        >
          <motion.div
            className="w-full max-w-[1400px] rounded-xl sm:rounded-2xl flex flex-col mx-2 sm:mx-0"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              maxHeight: "90dvh",
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            }}
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0 gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-lg items-center justify-center shrink-0 hidden sm:flex" style={{ background: "rgba(61,155,245,0.1)", border: "1px solid rgba(61,155,245,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white leading-tight truncate">{event.title}</h2>
                  <p className="text-xs hidden sm:block" style={{ color: "var(--muted)" }}>
                    Seat Map · {totalSeatsAll} seats{vipTableGroups.length > 0 ? ` (incl. ${vipTableGroups.reduce((n, g) => n + g.table.seats, 0)} VIP)` : ""} · <span style={{ textTransform: "capitalize" }}>{config.style} layout</span>
                  </p>
                  <p className="text-xs sm:hidden" style={{ color: "var(--muted)", textTransform: "capitalize" }}>{config.style} · {totalSeatsAll} seats</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Edit Layout button — only in view mode */}
                {!selectingFor && !assigning && onLayoutChange && (
                  <button
                    onClick={editingLayout ? cancelEditLayout : enterEditLayout}
                    aria-label="Edit seating layout"
                    className="flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0"
                    style={{
                      background: editingLayout ? "rgba(61,155,245,0.15)" : "var(--surface-3)",
                      color: editingLayout ? "var(--accent)" : "var(--muted)",
                      border: `1px solid ${editingLayout ? "rgba(61,155,245,0.35)" : "var(--border)"}`,
                    }}
                  >
                    <EditLayoutIcon />
                    <span className="hidden sm:inline">{editingLayout ? "Cancel" : "Edit Layout"}</span>
                  </button>
                )}

                <button
                  onClick={() => { if (!assigning) { setSelectedSeat(null); onClose(); } }}
                  disabled={assigning}
                  aria-label="Close seat map"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 shrink-0"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => { if (!assigning) { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "white"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
                >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              </div>
            </div>

            {/* Selection mode banner */}
            <AnimatePresence>
              {selectionMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: "hidden", flexShrink: 0 }}
                >
                  <div
                    className="flex items-center gap-2 px-4 py-2"
                    style={{
                      background: assigning ? "rgba(251,191,36,0.06)" : "rgba(34,197,94,0.06)",
                      borderBottom: `1px solid ${assigning ? "rgba(251,191,36,0.2)" : "rgba(34,197,94,0.2)"}`,
                      minHeight: 36,
                    }}
                  >
                    {assigning ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: "#fbbf24", borderTopColor: "transparent" }} />
                        <p className="text-xs font-medium leading-tight" style={{ color: "#fbbf24" }}>
                          Assigning seat to <strong>{selectingFor?.name}</strong>…
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="relative flex w-2 h-2 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: "#22c55e" }} />
                          <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: "#22c55e" }} />
                        </span>
                        <p className="text-xs leading-tight" style={{ color: "#22c55e" }}>
                          Pick a seat for <strong>{selectingFor?.name}</strong>
                          <span className="hidden sm:inline"> — green seats are available</span>
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats pills */}
            <div
              className="flex items-center gap-1.5 px-4 flex-wrap shrink-0"
              style={{ borderBottom: "1px solid var(--border)", minHeight: 40, paddingTop: 8, paddingBottom: 8 }}
            >
              {statItems.map(({ key, label }) => {
                const c = STATUS_COLORS[key];
                return (
                  <div
                    key={key}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{ background: c.fill, border: `1px solid ${c.stroke}`, fontSize: 11, whiteSpace: "nowrap" }}
                  >
                    <span className="font-semibold" style={{ color: c.dot }}>{stats[key]}</span>
                    <span style={{ color: "var(--muted)" }}>{label}</span>
                  </div>
                );
              })}
              {!selectionMode && !selectedSeat && (
                <span className="text-[10px] ml-auto" style={{ color: "var(--muted)" }}>
                  Click an occupied seat to view details
                </span>
              )}
            </div>

            {/* Layout editor — shown when editingLayout */}
            <AnimatePresence>
              {editingLayout && pendingConfig && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-y-auto p-6 flex-1 flex flex-col gap-5"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
                >
                  {/* Warning if allocated seats exist */}
                  {rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length > 0 && (
                    <div
                      className="flex items-start gap-3 rounded-xl px-4 py-3"
                      style={{
                        background: "rgba(251,191,36,0.08)",
                        border: "1px solid rgba(251,191,36,0.25)",
                      }}
                    >
                      <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      <p className="text-xs leading-relaxed" style={{ color: "#fbbf24" }}>
                        <strong>{rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length} guest{rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length !== 1 ? "s" : ""} already have seats assigned.</strong>
                        {" "}Changing the layout will clear all seat allocations and reset those guests back to pending. They will need to be re-allocated.
                      </p>
                    </div>
                  )}

                  <SeatingConfigurator
                    totalSeats={event.totalSeats}
                    config={pendingConfig}
                    onChange={setPendingConfig}
                  />

                  {/* Assignment Type toggle */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                      Assignment Type
                    </p>
                    <div className="flex gap-2">
                      {(["seat", "table"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPendingAssignmentMode(mode)}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150"
                          style={{
                            background: pendingAssignmentMode === mode ? "var(--accent)" : "var(--surface-3)",
                            color: pendingAssignmentMode === mode ? "#000" : "var(--muted)",
                            border: `1.5px solid ${pendingAssignmentMode === mode ? "var(--accent)" : "var(--border)"}`,
                          }}
                        >
                          {mode === "seat" ? "Seat Numbers" : "Table Numbers"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] mt-1.5" style={{ color: "var(--muted)" }}>
                      {pendingAssignmentMode === "seat"
                        ? "Guests receive individual seat numbers (e.g. Row A, Seat 7) in their confirmation."
                        : "Guests receive table numbers — best used with Banquet layout."}
                    </p>
                  </div>

                  {/* Confirm clear warning */}
                  {confirmingClear && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl px-4 py-3"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}
                    >
                      <p className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                        Are you sure? This will clear{" "}
                        {rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length} seat allocation(s) and cannot be undone.
                      </p>
                    </motion.div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEditLayout}
                      disabled={savingLayout}
                      className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                      style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveLayout}
                      disabled={savingLayout}
                      className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                      style={{ background: confirmingClear ? "#ef4444" : "var(--accent)", color: "#000" }}
                    >
                      {savingLayout
                        ? "Saving…"
                        : confirmingClear
                        ? "Yes, Clear & Change Layout"
                        : "Save Layout"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Seat grid — scrollable (both axes). `safe center` centers
                content that fits, but falls back to scroll-from-left when the
                seat map is wider than the viewport so the leftmost tables
                remain reachable. */}
            <div
              className="p-3 sm:p-6 flex-1"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "var(--border) transparent",
                display: editingLayout ? "none" : "flex",
                overflow: "auto",
                justifyContent: "safe center",
                alignItems: "flex-start",
              }}
            >
              {config.style === "banquet" ? (
                <BanquetSeatMap
                  seats={standardSeats}
                  seatsPerTable={seatsPerTable}
                  tablesPerSide={config.tablesPerSide != null ? Math.max(1, Math.min(6, config.tablesPerSide)) : undefined}
                  frontRowTablesPerSide={config.frontRowTablesPerSide}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
                  cancelledSeat={recentlyCancelledSeat}
                  isTableMode={isTableMode}
                  vipTableGroups={vipTableGroups}
                  onSeatAssign={selectionMode && !assigning ? onSeatSelect : undefined}
                  onSeatInspect={!selectionMode ? handleSeatInspect : undefined}
                />
              ) : config.style === "banquet-runway" ? (
                <BanquetRunwaySeatMap
                  seats={standardSeats}
                  seatsPerTable={seatsPerTable}
                  tablesPerSide={Math.max(1, Math.min(6, config.tablesPerSide ?? 1))}
                  frontRowTablesPerSide={config.frontRowTablesPerSide}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
                  cancelledSeat={recentlyCancelledSeat}
                  isTableMode={isTableMode}
                  vipTableGroups={vipTableGroups}
                  onSeatAssign={selectionMode && !assigning ? onSeatSelect : undefined}
                  onSeatInspect={!selectionMode ? handleSeatInspect : undefined}
                />
              ) : config.style === "runway" ? (
                <RunwaySeatMap
                  seats={seats}
                  seatsPerRow={seatsPerRow}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
                  cancelledSeat={recentlyCancelledSeat}
                  isTableMode={isTableMode}
                  onSeatAssign={selectionMode && !assigning ? onSeatSelect : undefined}
                  onSeatInspect={!selectionMode ? handleSeatInspect : undefined}
                />
              ) : (
                <GridSeatMap
                  seats={seats}
                  seatsPerRow={seatsPerRow}
                  style={config.style as "theater" | "auditorium" | "classroom"}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
                  cancelledSeat={recentlyCancelledSeat}
                  isTableMode={isTableMode}
                  onSeatAssign={selectionMode && !assigning ? onSeatSelect : undefined}
                  onSeatInspect={!selectionMode ? handleSeatInspect : undefined}
                />
              )}
            </div>

            {/* Seat detail panel — appears when an occupied seat is clicked */}
            <AnimatePresence>
              {selectedSeat && (
                <SeatDetailPanel
                  seat={selectedSeat}
                  onDismiss={() => setSelectedSeat(null)}
                  isTableMode={isTableMode}
                  perGroup={perGroup}
                  seatingConfig={config}
                  totalStandardSeats={event.totalSeats}
                  onReassign={onReassign}
                  onCancel={handlePanelCancel}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
