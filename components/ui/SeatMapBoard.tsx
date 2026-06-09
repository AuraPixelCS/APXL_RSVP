import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { Event, RSVP } from "@/types";
import { getTotalSeatCount } from "@/lib/seating";
import {
  buildSeatMap,
  buildVipTableGroups,
  GridSeatMap,
  RunwaySeatMap,
  BanquetSeatMap,
  BanquetRunwaySeatMap,
  SeatDetailPanel,
  type SeatInfo,
} from "@/components/ui/SeatMapModal";

interface SelectingFor {
  rsvpId: string;
  name: string;
}

interface Props {
  event: Event;
  rsvps: RSVP[];
  /** When set, the board enters selection mode — free seats glow green and onSeatSelect fires on click. */
  selectingFor?: SelectingFor | null;
  onSeatSelect?: (seatNumber: number) => void;
  /** Locks interactions while an allocation API call is in flight. */
  assigning?: boolean;
  /** Inspector → Change [Seat/Table/VIP] action. Hidden when undefined. */
  onReassign?: (rsvpId: string, guestName: string) => void;
  /** Inspector → Cancel [Seat/Table/VIP] action. Hidden when undefined. */
  onCancel?: (rsvpId: string) => Promise<void>;
  /** Drop-target adapter for the full-page DnD allocator. Return undefined to skip droppable wrapping for a seat. */
  getSeatDropId?: (seatNumber: number) => string | undefined;
  /** Drop-target adapter at the table level (banquet/banquet-runway only).
   *  `variant` distinguishes VIP tables from standard tables — both use 0-based
   *  indices, so the page must namespace droppable ids accordingly. */
  getTableDropId?: (tableIndex: number, variant: "vip" | "standard") => string | undefined;
  /** When in selection mode (selectingFor != null), clicking a table card in
   *  a banquet layout calls this instead of allocating a specific seat. The
   *  page wires this to open the TableSeatPickerModal for the chosen table. */
  onTableSelect?: (tableIndex: number, variant: "vip" | "standard") => void;
}

/**
 * Pure seat-board rendering: layout-switching, selectedSeat state, post-cancel
 * red highlight, and SeatDetailPanel. No modal shell, no Edit Layout — the
 * caller (modal or full page) provides whatever wrapper it needs.
 */
export default function SeatMapBoard({
  event,
  rsvps,
  selectingFor = null,
  onSeatSelect,
  assigning = false,
  onReassign,
  onCancel,
  getSeatDropId,
  getTableDropId,
  onTableSelect,
}: Props) {
  const [selectedSeat, setSelectedSeat] = useState<SeatInfo | null>(null);
  const [recentlyCancelledSeat, setRecentlyCancelledSeat] = useState<number | null>(null);

  // Drop the selection when entering selection mode (reassign flow).
  useEffect(() => {
    if (selectingFor) setSelectedSeat(null);
  }, [selectingFor]);

  // Clear the red mark when the admin moves to a different seat.
  useEffect(() => {
    if (recentlyCancelledSeat === null) return;
    if (selectedSeat && selectedSeat.seatNumber !== recentlyCancelledSeat) {
      setRecentlyCancelledSeat(null);
    }
  }, [selectedSeat, recentlyCancelledSeat]);

  const totalSeatsAll = useMemo(
    () => getTotalSeatCount(event.seatingConfig, event.totalSeats),
    [event.seatingConfig, event.totalSeats]
  );
  const allSeats = useMemo(
    () => buildSeatMap(totalSeatsAll, rsvps),
    [totalSeatsAll, rsvps]
  );

  // Keep the selected snapshot in sync with live seat data so cancel/reassign
  // reflects immediately in the detail panel (no stale guest info).
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

  const config = event.seatingConfig ?? { style: "theater" as const, seatsPerRow: 10 };
  const seatsPerRow = config.seatsPerRow ?? 10;
  const seatsPerTable = config.seatsPerTable ?? 10;
  const selectionMode = !!selectingFor;
  const isTableMode = event.assignmentMode === "table";
  const perGroup =
    config.style === "banquet" || config.style === "banquet-runway" ? seatsPerTable : seatsPerRow;

  const standardSeats = useMemo(
    () => allSeats.slice(0, event.totalSeats),
    [allSeats, event.totalSeats]
  );
  const vipTableGroups = useMemo(
    () => buildVipTableGroups(allSeats, event.seatingConfig, event.totalSeats),
    [allSeats, event.seatingConfig, event.totalSeats]
  );
  const seats = allSeats;

  // Wrap user onCancel so it sets the recent-cancel mark on success (same
  // pattern the modal uses internally).
  const handlePanelCancel = useMemo(
    () =>
      onCancel
        ? async (rsvpId: string) => {
            const seatNum = selectedSeat?.seatNumber ?? null;
            await onCancel(rsvpId);
            if (seatNum != null) setRecentlyCancelledSeat(seatNum);
          }
        : undefined,
    [onCancel, selectedSeat]
  );

  const handleSeatInspect = (seat: SeatInfo) => {
    setSelectedSeat((prev) => (prev?.seatNumber === seat.seatNumber ? null : seat));
  };

  // Esc clears the inspector.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedSeat) setSelectedSeat(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedSeat]);

  const layoutCommon = {
    selectionMode,
    highlightedSeat: selectedSeat?.seatNumber ?? null,
    cancelledSeat: recentlyCancelledSeat,
    isTableMode,
    onSeatAssign: selectionMode && !assigning ? onSeatSelect : undefined,
    onSeatInspect: !selectionMode ? handleSeatInspect : undefined,
    getSeatDropId,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className="p-3 sm:p-6 flex-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border) transparent",
          display: "flex",
          overflow: "auto",
          justifyContent: "safe center",
          alignItems: "flex-start",
        }}
      >
        {config.style === "banquet" ? (
          <BanquetSeatMap
            seats={standardSeats}
            seatsPerTable={seatsPerTable}
            tablesPerSide={
              config.tablesPerSide != null
                ? Math.max(1, Math.min(6, config.tablesPerSide))
                : undefined
            }
            frontRowTablesPerSide={config.frontRowTablesPerSide}
            vipTableGroups={vipTableGroups}
            {...layoutCommon}
            getTableDropId={getTableDropId}
            onTableSelect={onTableSelect}
          />
        ) : config.style === "banquet-runway" ? (
          <BanquetRunwaySeatMap
            seats={standardSeats}
            seatsPerTable={seatsPerTable}
            tablesPerSide={Math.max(1, Math.min(6, config.tablesPerSide ?? 1))}
            frontRowTablesPerSide={config.frontRowTablesPerSide}
            vipTableGroups={vipTableGroups}
            {...layoutCommon}
            getTableDropId={getTableDropId}
            onTableSelect={onTableSelect}
          />
        ) : config.style === "runway" ? (
          <RunwaySeatMap
            seats={seats}
            seatsPerRow={seatsPerRow}
            {...layoutCommon}
          />
        ) : (
          <GridSeatMap
            seats={seats}
            seatsPerRow={seatsPerRow}
            style={config.style as "theater" | "auditorium" | "classroom"}
            {...layoutCommon}
          />
        )}
      </div>

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
    </div>
  );
}
