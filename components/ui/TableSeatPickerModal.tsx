import { motion, AnimatePresence } from "framer-motion";
import { BanquetTableCell, type SeatInfo } from "@/components/ui/SeatMapModal";

interface Props {
  open: boolean;
  onClose: () => void;
  tableSeats: SeatInfo[];
  tableIndex: number;
  tableLabel?: string;
  guestName: string;
  /** Called when admin clicks a free seat circle. */
  onSeatPick: (seatNumber: number) => void;
  /** Disables interaction while the parent's allocate API call is in flight. */
  assigning?: boolean;
  /** Gold styling when the table is a VIP table. */
  isVip?: boolean;
}

/**
 * Mini interactive seat picker shown when a guest is dropped onto a table
 * (banquet / banquet-runway layouts). Renders the same BanquetTableCell at a
 * larger scale so seats are easy to tap, with selection mode on so free seats
 * glow green and taken seats are dimmed.
 */
export default function TableSeatPickerModal({
  open,
  onClose,
  tableSeats,
  tableIndex,
  tableLabel,
  guestName,
  onSeatPick,
  assigning = false,
  isVip = false,
}: Props) {
  const freeCount = tableSeats.filter((s) => s.status === "available").length;
  const total = tableSeats.length;
  // Scale: standard tables get a tighter circle; VIP cards have built-in
  // gold padding (minWidth: svgSize * 2.4) so use a smaller SVG so the whole
  // card stays inside the modal body.
  const TABLE_R = isVip ? 44 : 56;
  const SEAT_R = isVip ? 12 : 14;
  const ORBIT_R = TABLE_R + SEAT_R + 8;
  const SVG_SIZE = (ORBIT_R + SEAT_R + 6) * 2;
  // VIP cards need ~2.4× their svgSize for their internal gold border padding;
  // give the modal enough horizontal room so nothing bleeds out.
  const MODAL_MAX = isVip ? 560 : 460;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !assigning) onClose();
          }}
        >
          <motion.div
            className="rounded-2xl flex flex-col"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              maxWidth: MODAL_MAX,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {tableLabel ?? `Table ${tableIndex + 1}`} — {freeCount} free of {total}
                </h3>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--muted)" }}
                >
                  Click a free seat to assign{" "}
                  <strong style={{ color: "var(--accent)" }}>{guestName}</strong>
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={assigning}
                aria-label="Cancel seat pick"
                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 shrink-0"
                style={{ color: "var(--muted)" }}
                onMouseEnter={(e) => {
                  if (!assigning) {
                    e.currentTarget.style.background = "var(--surface-3)";
                    e.currentTarget.style.color = "white";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted)";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body — reuse BanquetTableCell, in selection mode. The inline-flex
                wrapper sizes to the card's natural width (especially important
                for VIP which has a 2.4× minWidth from its gold border padding). */}
            <div className="flex items-center justify-center px-5 py-6">
              <div style={{ display: "inline-flex", maxWidth: "100%" }}>
                <BanquetTableCell
                  tableSeats={tableSeats}
                  tableIndex={tableIndex}
                  seatsPerTable={tableSeats.length}
                  selectionMode={true}
                  highlightedSeat={null}
                  cancelledSeat={null}
                  isTableMode={false}
                  onSeatAssign={assigning ? undefined : onSeatPick}
                  tableR={TABLE_R}
                  seatR={SEAT_R}
                  orbitR={ORBIT_R}
                  svgSize={SVG_SIZE}
                  variant={isVip ? "vip" : "standard"}
                  tableLabel={tableLabel}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-5 py-3 gap-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {assigning
                  ? "Assigning…"
                  : freeCount === 0
                  ? "Table is full — pick another table."
                  : "Tap a green seat to confirm."}
              </span>
              <button
                onClick={onClose}
                disabled={assigning}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                style={{
                  background: "var(--surface-3)",
                  color: "white",
                  border: "1px solid var(--border)",
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
