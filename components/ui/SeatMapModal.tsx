import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Event, RSVP, SeatingConfig } from "@/types";
import SeatingConfigurator from "@/components/ui/SeatingConfigurator";
import { getSeatLabel } from "@/lib/seatLabel";

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
  onLayoutChange?: (config: SeatingConfig, assignmentMode: "seat" | "table") => Promise<void>;
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string; dot: string }> = {
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

interface SeatInfo {
  seatNumber: number;
  status: string;
  guestName?: string;
  guestEmail?: string;
  rsvpId?: string;
}

function buildSeatMap(totalSeats: number, rsvps: RSVP[]): SeatInfo[] {
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

// ─── Individual seat (grid layouts) ───────────────────────────────────────────

interface SeatProps {
  seat: SeatInfo;
  shape: "circle" | "rect";
  selectionMode: boolean;
  isHighlighted?: boolean;
  isTableMode?: boolean;
  displayNumber?: number;                     // position-within-row, shown inside the seat in seat mode
  onAssign?: (seatNumber: number) => void;   // selection mode: assign seat
  onInspect?: (seat: SeatInfo) => void;       // view mode: show detail panel
}

function SeatEl({ seat, shape, selectionMode, isHighlighted, isTableMode, displayNumber, onAssign, onInspect }: SeatProps) {
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
        background:     isHighlighted ? "rgba(61,155,245,0.35)" : baseFill,
        border:         `1.5px solid ${isHighlighted ? "var(--accent)" : baseStroke}`,
        borderRadius:   shape === "circle" ? "50%" : 3,
        flexShrink:     0,
        cursor:         isClickable ? "pointer" : isDisabled ? "not-allowed" : "default",
        opacity:        isDisabled ? 0.4 : 1,
        boxShadow:      isHighlighted ? "0 0 0 2px rgba(61,155,245,0.4)" : "none",
        transition:     "border-color 120ms, background 120ms, box-shadow 120ms",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontFamily:     "'Fira Code', monospace",
        fontSize:       9,
        fontWeight:     600,
        color:          isHighlighted ? "var(--accent)" : c.dot,
        userSelect:     "none",
        lineHeight:     1,
      }}
      onMouseEnter={(e) => {
        if (isHighlighted) return;
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
        if (isHighlighted) return;
        const el = e.currentTarget as HTMLElement;
        el.style.boxShadow = "none";
        el.style.background = baseFill;
      }}
    >
      {showNumber ? displayNumber : null}
    </div>
  );
}

// ─── Grid seat map (theater / auditorium / classroom) ─────────────────────────

function GridSeatMap({
  seats, seatsPerRow, style, selectionMode, highlightedSeat,
  isTableMode,
  onSeatAssign, onSeatInspect,
}: {
  seats: SeatInfo[];
  seatsPerRow: number;
  style: "theater" | "auditorium" | "classroom";
  selectionMode: boolean;
  highlightedSeat: number | null;
  isTableMode: boolean;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
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
                  isTableMode={isTableMode}
                  displayNumber={idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
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

function RunwaySeatMap({
  seats, seatsPerRow, selectionMode, highlightedSeat,
  isTableMode,
  onSeatAssign, onSeatInspect,
}: {
  seats: SeatInfo[];
  seatsPerRow: number;
  selectionMode: boolean;
  highlightedSeat: number | null;
  isTableMode: boolean;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
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
                  isTableMode={isTableMode}
                  displayNumber={idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
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
                  isTableMode={isTableMode}
                  displayNumber={perSide + idx + 1}
                  onAssign={onSeatAssign}
                  onInspect={onSeatInspect}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Banquet seat map ──────────────────────────────────────────────────────────

function BanquetSeatMap({
  seats, seatsPerTable, selectionMode, highlightedSeat,
  isTableMode,
  onSeatAssign, onSeatInspect,
}: {
  seats: SeatInfo[];
  seatsPerTable: number;
  selectionMode: boolean;
  highlightedSeat: number | null;
  isTableMode: boolean;
  onSeatAssign?: (seatNumber: number) => void;
  onSeatInspect?: (seat: SeatInfo) => void;
}) {
  const tables: SeatInfo[][] = [];
  for (let i = 0; i < seats.length; i += seatsPerTable) {
    tables.push(seats.slice(i, i + seatsPerTable));
  }

  const TABLE_R = 34;
  const SEAT_R  = 9;
  const ORBIT_R = TABLE_R + SEAT_R + 5;
  const SVG_SIZE = (ORBIT_R + SEAT_R + 4) * 2;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
      {tables.map((tableSeats, ti) => {
        const occupiedSeats = tableSeats.filter((s) => s.status !== "available");
        return (
          <div
            key={ti}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "12px 10px 10px",
              background: "var(--surface-2)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* Orbital SVG */}
            <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} overflow="visible">
              <circle cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={TABLE_R} fill="var(--surface-3)" stroke="var(--border)" strokeWidth="1.5" />
              <text x={SVG_SIZE / 2} y={SVG_SIZE / 2 + 4} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="'Fira Code', monospace">
                T{ti + 1}
              </text>
              {tableSeats.map((seat, si) => {
                const angle = (si / tableSeats.length) * Math.PI * 2 - Math.PI / 2;
                const sx = SVG_SIZE / 2 + Math.cos(angle) * ORBIT_R;
                const sy = SVG_SIZE / 2 + Math.sin(angle) * ORBIT_R;
                const isAvailable   = seat.status === "available";
                const isSelectable  = selectionMode && isAvailable;
                const isDisabled    = selectionMode && !isAvailable;
                const isInspectable = !selectionMode && !!seat.guestName;
                const isHighlighted = highlightedSeat === seat.seatNumber;
                const c = STATUS_COLORS[seat.status] ?? STATUS_COLORS.available;

                const fill   = isHighlighted ? "rgba(61,155,245,0.35)" : isSelectable ? SELECTABLE_FILL   : c.fill;
                const stroke = isHighlighted ? "var(--accent)"          : isSelectable ? SELECTABLE_STROKE : c.stroke;

                return (
                  <circle
                    key={si}
                    cx={sx} cy={sy} r={SEAT_R}
                    fill={fill} stroke={stroke} strokeWidth={isHighlighted ? 2 : 1.5}
                    opacity={isDisabled ? 0.4 : 1}
                    style={{
                      cursor: (isSelectable || isInspectable) ? "pointer" : isDisabled ? "not-allowed" : "default",
                      transition: "fill 120ms, stroke 120ms",
                      filter: isHighlighted ? "drop-shadow(0 0 4px rgba(61,155,245,0.5))" : "none",
                    }}
                    onClick={() => {
                      if (isSelectable) onSeatAssign?.(seat.seatNumber);
                      else if (isInspectable) onSeatInspect?.(seat);
                    }}
                    onMouseEnter={(e) => {
                      if (isHighlighted) return;
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
                      if (isHighlighted) return;
                      const el = e.currentTarget as SVGCircleElement;
                      el.setAttribute("fill", fill);
                      el.setAttribute("stroke", stroke);
                      el.setAttribute("stroke-width", isHighlighted ? "2" : "1.5");
                    }}
                  >
                    <title>
                      {seat.guestName
                        ? `${isTableMode ? `Table ${Math.ceil(seat.seatNumber / seatsPerTable)}` : `Seat ${seat.seatNumber}`} · ${seat.guestName}${isInspectable ? " · Click for details" : ""}`
                        : `${isTableMode ? `Table ${Math.ceil(seat.seatNumber / seatsPerTable)}` : `Seat ${seat.seatNumber}`}${isSelectable ? " · Click to assign" : ""}`}
                    </title>
                  </circle>
                );
              })}
            </svg>

            {/* Table label */}
            <p className="text-[10px] font-mono uppercase tracking-wider mt-1 mb-1.5" style={{ color: "var(--muted)" }}>
              Table {ti + 1}
            </p>

            {/* Divider */}
            <div style={{ width: "100%", height: 1, background: "var(--border)", marginBottom: 6 }} />

            {/* Guest name list */}
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
        );
      })}
    </div>
  );
}

// ─── Seat detail panel ─────────────────────────────────────────────────────────

function SeatDetailPanel({
  seat, onDismiss, isTableMode, perGroup, seatingConfig, onReassign,
}: {
  seat: SeatInfo;
  onDismiss: () => void;
  isTableMode: boolean;
  perGroup: number;
  seatingConfig: SeatingConfig;
  onReassign?: (rsvpId: string, guestName: string) => void;
}) {
  const c = STATUS_COLORS[seat.status] ?? STATUS_COLORS.available;
  const label = isTableMode ? "Table" : "Seat";
  const seatLabel = !isTableMode ? getSeatLabel(seat.seatNumber, seatingConfig) : null;
  const displayNumber = isTableMode
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
          {onReassign && seat.rsvpId && seat.guestName && seat.status === "allocated" && (
            <button
              onClick={() => onReassign(seat.rsvpId!, seat.guestName!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all"
              style={{
                background: "rgba(61,155,245,0.1)",
                color: "var(--accent)",
                border: "1px solid rgba(61,155,245,0.25)",
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
  onLayoutChange,
}: Props) {
  const [selectedSeat, setSelectedSeat] = useState<SeatInfo | null>(null);
  const [editingLayout, setEditingLayout] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<SeatingConfig | null>(null);
  const [pendingAssignmentMode, setPendingAssignmentMode] = useState<"seat" | "table">("seat");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  // Clear selection when modal closes or when entering selection mode (reassign)
  useEffect(() => {
    if (!open) {
      setSelectedSeat(null);
      setEditingLayout(false);
      setPendingConfig(null);
      setConfirmingClear(false);
    }
  }, [open]);

  useEffect(() => {
    if (selectingFor) setSelectedSeat(null);
  }, [selectingFor]);

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

  const seats = useMemo(() => buildSeatMap(event.totalSeats, rsvps), [event.totalSeats, rsvps]);
  const config      = event.seatingConfig ?? { style: "theater" as const, seatsPerRow: 10 };
  const seatsPerRow   = config.seatsPerRow ?? 10;
  const seatsPerTable = config.seatsPerTable ?? 10;
  const selectionMode = !!selectingFor;
  const isTableMode   = event.assignmentMode === "table";
  const perGroup      = config.style === "banquet" ? seatsPerTable : seatsPerRow;

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
            className="w-full max-w-4xl rounded-xl sm:rounded-2xl flex flex-col mx-2 sm:mx-0"
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
                    Seat Map · {event.totalSeats} seats · <span style={{ textTransform: "capitalize" }}>{config.style} layout</span>
                  </p>
                  <p className="text-xs sm:hidden" style={{ color: "var(--muted)", textTransform: "capitalize" }}>{config.style} · {event.totalSeats} seats</p>
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

            {/* Seat grid — scrollable */}
            <div
              className="overflow-y-auto p-3 sm:p-6 flex-1"
              style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent", display: editingLayout ? "none" : undefined }}
            >
              {config.style === "banquet" ? (
                <BanquetSeatMap
                  seats={seats}
                  seatsPerTable={seatsPerTable}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
                  isTableMode={isTableMode}
                  onSeatAssign={selectionMode && !assigning ? onSeatSelect : undefined}
                  onSeatInspect={!selectionMode ? handleSeatInspect : undefined}
                />
              ) : config.style === "runway" ? (
                <RunwaySeatMap
                  seats={seats}
                  seatsPerRow={seatsPerRow}
                  selectionMode={selectionMode}
                  highlightedSeat={selectedSeat?.seatNumber ?? null}
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
                  onReassign={onReassign}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
