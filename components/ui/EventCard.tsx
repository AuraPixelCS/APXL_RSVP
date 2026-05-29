import Link from "next/link";
import { motion } from "framer-motion";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import type { Event, RSVP } from "@/types";
import { getTotalSeatCount } from "@/lib/seating";

interface EventCardProps {
  event: Event;
  rsvps?: RSVP[];
  index?: number;
  /** Show the pin toggle button (hidden on past events). */
  pinnable?: boolean;
  onTogglePin?: (eventId: string, nextPinned: boolean) => void;
}

function CalendarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MapPinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MailIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function ArrowIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/**
 * Pin icon. `filled=true` renders the active/pinned state (accent fill).
 */
function PinIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

function CountdownChip({ date }: { date: string }) {
  let label = "";
  let bg = "rgba(107,114,128,0.12)";
  let color = "var(--muted)";
  let border = "rgba(107,114,128,0.3)";
  try {
    const days = differenceInCalendarDays(parseISO(date), new Date());
    if (days > 1)        { label = `In ${days} days`; bg = "rgba(61,155,245,0.10)";  color = "var(--accent)"; border = "rgba(61,155,245,0.3)"; }
    else if (days === 1) { label = "Tomorrow";         bg = "rgba(245,158,11,0.10)";  color = "#f59e0b";       border = "rgba(245,158,11,0.35)"; }
    else if (days === 0) { label = "Today";            bg = "rgba(245,158,11,0.12)";  color = "#f59e0b";       border = "rgba(245,158,11,0.4)"; }
    else                 { label = `${Math.abs(days)}d ago`; bg = "rgba(107,114,128,0.12)"; color = "var(--muted)"; border = "rgba(107,114,128,0.3)"; }
  } catch {
    return null;
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
      style={{ background: bg, color, border: `1px solid ${border}`, letterSpacing: "0.06em" }}
    >
      <ClockIcon size={10} />
      {label}
    </span>
  );
}

function StatusBadge({ event, isPast }: { event: Event; isPast: boolean }) {
  const bg = event.isActive
    ? "rgba(34,197,94,0.12)"
    : isPast
      ? "rgba(107,114,128,0.14)"
      : "rgba(245,158,11,0.12)";
  const color = event.isActive ? "#22c55e" : isPast ? "#9ca3af" : "#f59e0b";
  const label = event.isActive ? "Active" : isPast ? "Past" : "Draft";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
      style={{ background: bg, color, letterSpacing: "0.06em" }}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1" style={{ background: color }} />
      {label}
    </span>
  );
}

export default function EventCard({
  event, rsvps = [], index = 0,
  pinnable = false, onTogglePin,
}: EventCardProps) {
  const isPast = (() => {
    try { return differenceInCalendarDays(parseISO(event.date), new Date()) < 0; } catch { return false; }
  })();
  const dateLabel = (() => { try { return format(parseISO(event.date), "EEE, dd MMM yyyy"); } catch { return event.date; } })();

  const totalSeats = getTotalSeatCount(event.seatingConfig, event.totalSeats);
  const allocated = rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
  const fillPct = totalSeats > 0 ? Math.round((allocated / totalSeats) * 100) : 0;
  const pending = rsvps.filter((r) => r.status === "pending" && r.attending).length;
  const unnotified = rsvps.filter((r) => r.status === "allocated" && !r.notifiedAt).length;
  const total = rsvps.length;

  const isPinned = !!event.pinned;

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (event.id) onTogglePin?.(event.id, !isPinned);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1], delay: index * 0.04 }}
      className="rounded-xl overflow-hidden flex flex-col group"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isPinned && pinnable ? "rgba(61,155,245,0.45)" : "var(--border)"}`,
        boxShadow: isPinned && pinnable ? "inset 3px 0 0 0 var(--accent)" : "none",
        transition: "border-color 150ms, transform 150ms",
      }}
      whileHover={{ y: -2 }}
    >
      {/* Body */}
      <Link
        href={`/admin/events/${event.id}`}
        className="block px-4 pt-4 pb-3 cursor-pointer"
        style={{ flex: 1 }}
      >
        {/* Chip row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CountdownChip date={event.date} />
            <StatusBadge event={event} isPast={isPast} />
          </div>
          {pinnable && (
            <button
              type="button"
              onClick={handlePinClick}
              aria-pressed={isPinned}
              aria-label={isPinned ? "Unpin event" : "Pin event"}
              title={isPinned ? "Unpin event" : "Pin event"}
              className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors shrink-0"
              style={{
                color: isPinned ? "var(--accent)" : "var(--muted)",
                background: isPinned ? "rgba(61,155,245,0.10)" : "transparent",
                border: `1px solid ${isPinned ? "rgba(61,155,245,0.35)" : "transparent"}`,
              }}
              onMouseEnter={(e) => {
                if (!isPinned) {
                  e.currentTarget.style.background = "var(--surface-3)";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!isPinned) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--muted)";
                }
              }}
            >
              <PinIcon filled={isPinned} />
            </button>
          )}
        </div>

        {/* Title — fixed one-line height */}
        <h3
          className="text-sm font-semibold text-white leading-tight tracking-tight line-clamp-1"
          style={{ minHeight: 18 }}
        >
          {event.title}
        </h3>
        {/* Description — slot always reserved so rows line up across cards */}
        <p
          className="text-[11px] mt-1 line-clamp-1"
          style={{ color: "var(--muted)", minHeight: 16 }}
        >
          {event.description ?? ""}
        </p>

        {/* Meta — fixed height (single line, truncated overflow) so the fill bar aligns */}
        <div
          className="flex items-center gap-x-3 mt-2.5 text-[11px] overflow-hidden whitespace-nowrap"
          style={{ color: "var(--muted)", height: 18 }}
        >
          <span className="flex items-center gap-1 shrink-0">
            <CalendarIcon />
            {dateLabel}
          </span>
          <span className="flex items-center gap-1 shrink-0" style={{ opacity: event.time ? 1 : 0.4 }}>
            <ClockIcon />
            {event.time || "—"}
          </span>
          <span className="flex items-center gap-1 min-w-0" style={{ opacity: event.venue ? 1 : 0.4 }}>
            <MapPinIcon />
            <span className="truncate">{event.venue || "—"}</span>
          </span>
        </div>

        {/* Fill bar */}
        <div className="mt-3.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
              Seats Allocated
            </span>
            <span className="text-[11px] font-mono font-semibold text-white">
              {allocated} <span style={{ color: "var(--muted)" }}>/ {totalSeats}</span>
              <span className="ml-1" style={{ color: "var(--muted)" }}>· {fillPct}%</span>
            </span>
          </div>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--surface-3)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${fillPct}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ height: "100%", background: "var(--accent)" }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Stat label="RSVPs" value={total} color="#fff" />
          <Stat label="Pending" value={pending} color={pending > 0 ? "#f59e0b" : "var(--muted)"} />
          <Stat label="Unnotified" value={unnotified} color={unnotified > 0 ? "#3d9bf5" : "var(--muted)"} />
        </div>
      </Link>

      {/* Footer actions */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--accent)", background: "var(--accent)" }}>
        <Link
          href={`/admin/events/${event.id}/notifications`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
          style={{ background: "rgba(0,0,0,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.32)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.18)")}
        >
          <MailIcon />
          Notifications
          {unnotified > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-[9px] font-bold ml-0.5"
              style={{ background: "#fff", color: "var(--accent)", minWidth: 16, height: 16, padding: "0 4px" }}
            >
              {unnotified}
            </span>
          )}
        </Link>
        <Link
          href={`/admin/events/${event.id}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 ml-auto"
          style={{ background: "#fff", color: "var(--accent)" }}
        >
          Open
          <ArrowIcon />
        </Link>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <p className="text-[9px] uppercase tracking-wider font-semibold leading-none" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
        {label}
      </p>
      <p className="text-sm font-bold mt-1 leading-none" style={{ color, fontFamily: "'Fira Code', monospace" }}>
        {value}
      </p>
    </div>
  );
}
