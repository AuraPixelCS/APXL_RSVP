import { motion, AnimatePresence } from "framer-motion";
import type { AllocationStep } from "@/lib/seating";

interface Props {
  open: boolean;
  plan: AllocationStep[];
  rsvpCount: number;
  groupLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  assigning?: boolean;
}

/**
 * Confirm dialog shown when a group drop's plan spans 2+ steps (overflow into
 * extra tables / non-contiguous seats). Renders the full plan up-front so the
 * admin sees exactly which tables fill with how many before committing.
 */
export default function GroupAllocConfirmModal({
  open,
  plan,
  rsvpCount,
  groupLabel,
  onConfirm,
  onCancel,
  assigning = false,
}: Props) {
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
            if (e.target === e.currentTarget && !assigning) onCancel();
          }}
        >
          <motion.div
            className="rounded-2xl flex flex-col"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-sm font-semibold text-white">
                Allocate {rsvpCount} guest{rsvpCount === 1 ? "" : "s"}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                {groupLabel ? (
                  <>
                    Group <strong style={{ color: "var(--accent)" }}>{groupLabel}</strong> spans{" "}
                    {plan.length} destination{plan.length === 1 ? "" : "s"}.
                  </>
                ) : (
                  <>
                    Plan spans {plan.length} destination{plan.length === 1 ? "" : "s"}.
                  </>
                )}{" "}
                Review and confirm.
              </p>
            </div>

            {/* Plan steps */}
            <div className="px-5 py-3 flex flex-col gap-2 max-h-[50dvh] overflow-auto">
              {plan.map((step, i) => {
                const isVip = step.variant === "vip";
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${isVip ? "rgba(212,175,55,0.35)" : "var(--border)"}`,
                    }}
                  >
                    <div
                      className="flex items-center justify-center rounded-md"
                      style={{
                        width: 28,
                        height: 28,
                        background: isVip ? "rgba(212,175,55,0.12)" : "rgba(61,155,245,0.12)",
                        color: isVip ? "#d4af37" : "var(--accent)",
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "'Fira Code', monospace",
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate" title={step.label}>
                        {step.label}
                      </p>
                      <p
                        className="text-[10px] mt-0.5 truncate"
                        style={{ color: "var(--muted)", fontFamily: "'Fira Code', monospace" }}
                        title={step.seatNumbers.join(", ")}
                      >
                        Seats {formatSeatRange(step.seatNumbers)}
                      </p>
                    </div>
                    <span
                      className="rounded-full text-[10px] font-bold"
                      style={{
                        padding: "2px 8px",
                        background: isVip ? "rgba(212,175,55,0.18)" : "rgba(61,155,245,0.18)",
                        color: isVip ? "#d4af37" : "var(--accent)",
                        fontFamily: "'Fira Code', monospace",
                        flexShrink: 0,
                      }}
                    >
                      {step.seatNumbers.length}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {assigning
                  ? "Allocating — please wait…"
                  : "Cancel keeps everyone in Pending."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCancel}
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
                <button
                  onClick={onConfirm}
                  disabled={assigning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                  style={{ background: "var(--accent)", color: "#000" }}
                >
                  {assigning && (
                    <span
                      className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: "#000", borderTopColor: "transparent" }}
                      aria-hidden
                    />
                  )}
                  {assigning ? "Allocating…" : "Allocate all"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Compact range string: [1,2,3,5,6] → "1-3, 5-6"; [12] → "12". */
function formatSeatRange(nums: number[]): string {
  if (nums.length === 0) return "";
  const sorted = [...nums].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges.join(", ");
}
