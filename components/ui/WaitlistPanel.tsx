/**
 * Waitlist panel — shown on the event page only when someone is actually on
 * the waitlist, so it stays invisible for the common case.
 *
 * Promotion moves guests to `pending`; it does not seat them and does not email
 * them. The copy says so plainly, because "Promoted 5" reading as "5 people
 * were told" is exactly the kind of quiet overstatement that leads to guests
 * arriving unannounced.
 */

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/contexts/ToastContext";
import { getAuthHeaders } from "@/lib/auth";
import { waitlistOrder, committedSeats, capacityOf } from "@/lib/capacity";
import { getTotalSeatCount } from "@/lib/seating";
import type { Event, RSVP } from "@/types";

export default function WaitlistPanel({
  event,
  rsvps,
}: {
  event: Event;
  rsvps: RSVP[];
}) {
  const toast = useToast();
  const [promoting, setPromoting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const queue = useMemo(() => waitlistOrder(rsvps), [rsvps]);

  const capacity = useMemo(
    () => capacityOf(event, getTotalSeatCount(event.seatingConfig, event.totalSeats)),
    [event],
  );
  const used = useMemo(() => committedSeats(rsvps), [rsvps]);
  const freeSeats = capacity <= 0 ? Infinity : Math.max(0, capacity - used);

  const promote = useCallback(
    async (payload: { rsvpIds?: string[]; auto?: boolean }) => {
      if (!event.id) return;
      setPromoting(true);
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/waitlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ eventId: event.id, ...payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Nobody promoted", data.error ?? "The promotion failed.");
          return;
        }
        setSelected(new Set());
        toast.success(
          `Promoted ${data.promoted}`,
          data.skipped
            ? `${data.skipped} left waiting — not enough seats. Allocate seats to send their passes.`
            : "Now pending. Allocate seats to send their entry passes.",
        );
      } catch {
        toast.error("Network error", "Could not reach the server.");
      } finally {
        setPromoting(false);
      }
    },
    [event.id, toast],
  );

  if (queue.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const seatsLabel =
    freeSeats === Infinity ? "no capacity limit set" : `${freeSeats} seat${freeSeats === 1 ? "" : "s"} free`;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: expanded ? "1px solid var(--border)" : "none" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(168,85,247,0.14)", color: "#a855f7" }}
          >
            {queue.length}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
              Waitlist
            </h2>
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {queue.length} waiting · {seatsLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
            style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}
          >
            {expanded ? "Hide" : "View list"}
          </button>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={() => promote({ rsvpIds: [...selected] })}
              disabled={promoting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {promoting ? "Promoting…" : `Promote ${selected.size} selected`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => promote({ auto: true })}
              disabled={promoting || freeSeats === 0}
              title={freeSeats === 0 ? "No seats are free" : undefined}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {promoting ? "Promoting…" : "Promote who fits"}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {queue.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id!)}
                    onChange={() => toggle(r.id!)}
                    aria-label={`Select ${r.name} for promotion`}
                    className="h-4 w-4 cursor-pointer shrink-0"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-xs tabular-nums w-6 shrink-0" style={{ color: "var(--muted-2)" }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: "var(--foreground)" }}>
                      {r.name}
                      {r.plusOne && (
                        <span className="ml-1.5 text-[11px]" style={{ color: "var(--muted)" }}>+1</span>
                      )}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--muted)" }}>{r.email}</p>
                  </div>
                  <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--muted-2)" }}>
                    {(r.waitlistedAt ?? r.submittedAt ?? "").slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-4 py-2.5 text-[11px]" style={{ background: "var(--surface-2)", color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
              Promoting moves guests to Pending. They are not seated and not emailed until you
              allocate seats and send entry passes.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
