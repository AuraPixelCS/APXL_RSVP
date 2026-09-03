import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { committedSeats, capacityOf } from "@/lib/capacity";
import { useRouter } from "next/router";
import Link from "next/link";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EventStatsBar from "@/components/ui/EventStatsBar";
import WaitlistPanel from "@/components/ui/WaitlistPanel";
import RSVPTable from "@/components/ui/RSVPTable";
import EmptyState from "@/components/ui/EmptyState";
import { getEvent, subscribeToRSVPs, updateRSVP } from "@/lib/firestore";
import { exportRSVPsToCSV } from "@/lib/csvExport";
import GoogleFormsModal, { DEFAULT_MAPPINGS, DEFAULT_API_URL } from "@/components/ui/GoogleFormsModal";
import ImportCsvModal from "@/components/ui/ImportCsvModal";
import SeatMapModal from "@/components/ui/SeatMapModal";
import EventFormModal from "@/components/ui/EventFormModal";
import GuestFormModal from "@/components/ui/GuestFormModal";
import GuestFieldsModal from "@/components/ui/GuestFieldsModal";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { getAuthHeaders } from "@/lib/auth";
import { getTotalSeatCount } from "@/lib/seating";
import { formatEventDayRange } from "@/lib/eventDays";
import type { Event, RSVP, EventStats, FieldMapping, SeatingConfig } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { parseISO, differenceInCalendarDays, isToday, formatDistanceToNow } from "date-fns";

function computeStats(rsvps: RSVP[]): EventStats {
  // A waitlisted guest has attending === true but holds no place, so counting
  // them as "attending" would overstate the room by exactly the number of
  // people who couldn't get in.
  const holding = rsvps.filter((r) => r.attending && r.status !== "waitlisted" && r.status !== "not_attending" && r.status !== "cancelled" && r.status !== "unpaid");
  return {
    total: rsvps.length,
    attending: holding.length,
    waitlisted: rsvps.filter((r) => r.status === "waitlisted").length,
    seatsCommitted: committedSeats(rsvps),
    allocated: rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length,
    pending: rsvps.filter((r) => r.status === "pending" && r.attending).length,
    notAttending: rsvps.filter((r) => !r.attending || r.status === "not_attending").length,
    checkedIn: rsvps.filter((r) => r.status === "checked_in").length,
  };
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function BulkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function FormsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  );
}

function SheetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="9" x2="15" y2="21" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function CheckInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function FormFieldsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="12" width="18" height="4" rx="1" />
      <line x1="7" y1="20" x2="11" y2="20" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ArrowRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function LiveDot({ color = "#22c55e" }: { color?: string }) {
  return (
    <span className="relative flex w-2 h-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex rounded-full w-2 h-2" style={{ background: color }} />
    </span>
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
  } catch { return null; }
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

// ─── More menu (dropdown) ─────────────────────────────────────────────────────

interface MoreMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
}

function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  // The hero card clips its children (overflow-hidden for the rounded corners),
  // which used to cut the dropdown off after two items. Rendering the panel in
  // a body portal at a fixed position puts it above every container.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    setOpen((v) => {
      if (!v && rootRef.current) {
        const r = rootRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
      }
      return !v;
    });
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const handleScroll = () => setOpen(false);
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  const visibleItems = items.filter((i) => !i.hidden);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={toggle}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
        style={{
          background: open ? "var(--surface-3)" : "var(--surface-2)",
          color: "var(--muted)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = "var(--muted)"; }}
      >
        <MoreIcon />
      </button>

      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="rounded-lg overflow-hidden"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 60,
              minWidth: 200,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="py-1">
              {visibleItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => { item.onClick(); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "transparent", color: "#fff" }}
                  onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "var(--surface-3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: "var(--muted)", display: "inline-flex" }}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}
    </div>
  );
}

// ─── Standard event hero ──────────────────────────────────────────────────────

interface HeroActions {
  /** Opens the existing SeatMapModal in read-only mode for quick viewing. */
  onPreviewSeatMap: () => void;
  /** Navigates to the dedicated full-page allocator at /admin/events/[id]/seat-map. */
  onOpenSeatMapPage: () => void;
  onOpenNotifications: () => void;
  onAllocatePending: () => void;
  bulkAllocating: boolean;
  unnotifiedCount: number;
  pendingCount: number;
  moreItems: MoreMenuItem[];
}

function EventHero({ event, rsvps, actions }: { event: Event; rsvps: RSVP[]; actions: HeroActions }) {
  const freeSeating = event.assignmentMode === "free";
  const physicalSeats = getTotalSeatCount(event.seatingConfig, event.totalSeats);
  // Show the organiser's cap when one is set — the room may hold more than we sell.
  const totalSeats = capacityOf(event, physicalSeats);
  const vipSeats = physicalSeats - event.totalSeats;
  const allocated = rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
  const fillPct = totalSeats > 0 ? Math.round((allocated / totalSeats) * 100) : 0;
  const dateLabel = formatEventDayRange(event);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-0">
        {/* Left: title, meta, fill */}
        <div className="p-6 flex flex-col gap-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <CountdownChip date={event.date} />
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
              style={{
                background: event.isActive ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.14)",
                color: event.isActive ? "#22c55e" : "#6b7280",
                letterSpacing: "0.06em",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: event.isActive ? "#22c55e" : "#6b7280" }}
              />
              {event.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">{event.title}</h1>
            {event.description && (
              <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>{event.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1.5">
              <CalendarIcon />
              {dateLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <ClockIcon />
              {event.time || "—"}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1.5">
                <MapPinIcon />
                {event.venue}
              </span>
            )}
          </div>

          <div className="mt-1">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                {event.assignmentMode === "free" ? "Passes Issued" : "Seats Allocated"}
              </span>
              <span className="text-sm font-mono font-semibold" style={{ color: "var(--foreground)" }}>
                {allocated} <span style={{ color: "var(--muted)" }}>/ {totalSeats}</span>
                {vipSeats > 0 && (
                  <span className="text-[10px] ml-1" style={{ color: "#d4af37" }}>
                    (incl. {vipSeats} VIP)
                  </span>
                )}
                <span className="ml-2" style={{ color: "var(--muted)" }}>· {fillPct}%</span>
              </span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: "var(--surface-3)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${fillPct}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                style={{ height: "100%", background: "var(--accent)" }}
              />
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div
          className="p-6 flex flex-col gap-2 justify-center"
          style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            {/* Free seating has no map — the buttons stay put but do nothing. */}
            <button
              onClick={actions.onOpenSeatMapPage}
              disabled={freeSeating}
              title={freeSeating ? "Free seating — no seat map for this event" : undefined}
              className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              <GridIcon />
              Seat Map
            </button>
            <button
              onClick={actions.onPreviewSeatMap}
              disabled={freeSeating}
              title={freeSeating ? "Free seating — no seat map for this event" : "Preview the seat map (read-only)"}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "var(--surface-3)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => { if (!freeSeating) { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "white"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "var(--muted)"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </button>
            <MoreMenu items={actions.moreItems} />
          </div>

          <button
            onClick={actions.onOpenNotifications}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors relative"
            style={{ background: "var(--surface-3)", color: "#fff", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
          >
            <BellIcon />
            Notifications
            {actions.unnotifiedCount > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full text-[10px] font-bold ml-0.5"
                style={{ background: "var(--accent)", color: "#000", minWidth: 18, height: 18, padding: "0 5px" }}
              >
                {actions.unnotifiedCount}
              </span>
            )}
          </button>

          {actions.pendingCount > 0 && event.assignmentMode !== "free" && (
            <button
              onClick={actions.onAllocatePending}
              disabled={actions.bulkAllocating}
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "rgba(245,158,11,0.10)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.35)" }}
              onMouseEnter={(e) => { if (!actions.bulkAllocating) e.currentTarget.style.background = "rgba(245,158,11,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.10)"; }}
            >
              {actions.bulkAllocating ? (
                <>
                  <span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#f59e0b", borderTopColor: "transparent" }} />
                  Allocating…
                </>
              ) : (
                <>
                  <BulkIcon />
                  Allocate {actions.pendingCount} Pending
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Event Day hero ───────────────────────────────────────────────────────────

function EventDayHero({ event, rsvps, actions }: { event: Event; rsvps: RSVP[]; actions: HeroActions }) {
  const totalSeats = capacityOf(event, getTotalSeatCount(event.seatingConfig, event.totalSeats));
  const checkedIn = rsvps.filter((r) => r.status === "checked_in").length;
  const allocated = rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
  const checkInPct = allocated > 0 ? Math.round((checkedIn / allocated) * 100) : 0;

  const lastCheckIn = useMemo(() => {
    const stamps = rsvps
      .map((r) => r.checkInTime ?? r.checkedInAt)
      .filter((s): s is string => !!s)
      .sort((a, b) => b.localeCompare(a));
    return stamps[0] ?? null;
  }, [rsvps]);

  const RING_SIZE = 160;
  const STROKE = 12;
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (checkInPct / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(20,20,20,0.95) 60%)",
        border: "1px solid rgba(34,197,94,0.3)",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-0">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase"
              style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.35)", letterSpacing: "0.08em" }}
            >
              <LiveDot />
              Event Day · Live
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">{event.title}</h1>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              {event.time}{event.venue ? ` · ${event.venue}` : ""}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-1">
            <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Checked In</p>
              <p className="text-xl font-bold mt-1" style={{ color: "#22c55e", fontFamily: "'Fira Code', monospace" }}>{checkedIn}</p>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Allocated</p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--accent)", fontFamily: "'Fira Code', monospace" }}>{allocated}</p>
            </div>
            <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Capacity</p>
              <p className="text-xl font-bold mt-1 text-white" style={{ fontFamily: "'Fira Code', monospace" }}>{totalSeats}</p>
            </div>
          </div>

          <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            <ClockIcon size={11} />
            {lastCheckIn
              ? <>Last check-in <strong style={{ color: "#fff" }}>{(() => { try { return formatDistanceToNow(parseISO(lastCheckIn), { addSuffix: true }); } catch { return ""; } })()}</strong></>
              : <>No check-ins yet</>}
          </p>

          <div className="flex flex-wrap gap-2 mt-1">
            <button
              onClick={actions.onOpenSeatMapPage}
              disabled={event.assignmentMode === "free"}
              title={event.assignmentMode === "free" ? "Free seating — no seat map for this event" : undefined}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#22c55e", color: "#000" }}
            >
              <GridIcon />
              Seat Map
              <ArrowRightIcon />
            </button>
            <button
              onClick={actions.onPreviewSeatMap}
              disabled={event.assignmentMode === "free"}
              title={event.assignmentMode === "free" ? "Free seating — no seat map for this event" : "Preview the seat map (read-only)"}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--surface-3)", color: "#fff", border: "1px solid var(--border)" }}
              onMouseEnter={(e) => { if (event.assignmentMode !== "free") e.currentTarget.style.background = "var(--surface)"; }}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Preview
            </button>
            <button
              onClick={actions.onOpenNotifications}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 relative"
              style={{ background: "var(--surface-3)", color: "#fff", border: "1px solid var(--border)" }}
            >
              <BellIcon />
              Notifications
              {actions.unnotifiedCount > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] font-bold ml-0.5"
                  style={{ background: "var(--accent)", color: "#000", minWidth: 18, height: 18, padding: "0 5px" }}
                >
                  {actions.unnotifiedCount}
                </span>
              )}
            </button>
            <MoreMenu items={actions.moreItems} />
          </div>
        </div>

        {/* Right: check-in dial */}
        <div className="p-6 flex flex-col items-center justify-center gap-2" style={{ borderLeft: "1px solid var(--border)", minWidth: 220 }}>
          <div style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: "rotate(-90deg)" }}>
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth={STROKE}
              />
              <motion.circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                stroke="#22c55e"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: "none" }}>
              <p className="text-3xl font-bold text-white" style={{ fontFamily: "'Fira Code', monospace" }}>{checkInPct}%</p>
              <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Checked In</p>
            </div>
          </div>
          <p className="text-[10px] text-center" style={{ color: "var(--muted)" }}>
            {checkedIn} of {allocated} allocated
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const EventDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { id } = router.query;
  const { role } = useAuthContext();
  const toast = useToast();
  const isAdmin = role === "admin";

  const [event, setEvent] = useState<Event | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [bulkAllocating, setBulkAllocating] = useState(false);
  const [deallocatingId, setDeallocatingId] = useState<string | null>(null);
  const [deletingRsvpId, setDeletingRsvpId] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [showSeatMap, setShowSeatMap] = useState(false);
  const [showImportCsvModal, setShowImportCsvModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [editGuest, setEditGuest] = useState<RSVP | null>(null);
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  // Seat-picker selection state
  const [seatSelectingRsvp, setSeatSelectingRsvp] = useState<{ rsvpId: string; name: string } | null>(null);
  const [seatAssigning, setSeatAssigning] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  // Preview mode = open the seat map modal in read-only state (no allocate /
  // reassign / cancel actions). Cleared on close so the next time the admin
  // hits Allocate from a row, the modal opens in interactive mode again.
  const [previewMode, setPreviewMode] = useState(false);
  const [showGFormsModal, setShowGFormsModal] = useState(false);
  // Google Forms lifted state
  const [googleFormMode, setGoogleFormMode] = useState(false);
  const [formMappings, setFormMappings] = useState<FieldMapping[]>(DEFAULT_MAPPINGS);
  const [formApiUrl, setFormApiUrl] = useState(DEFAULT_API_URL);
  const [starredFieldId, setStarredFieldId] = useState<string | null>(null);

  // Fetch event
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    getEvent(id).then((ev) => {
      setEvent(ev);
      setLoading(false);
    });
  }, [id]);

  // Subscribe to RSVPs realtime
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const unsub = subscribeToRSVPs(id, setRsvps);
    return unsub;
  }, [id]);

  const stats = computeStats(rsvps);

  // Single allocate — opens seat-picker modal
  const handleAllocate = useCallback(
    (rsvpId: string) => {
      const rsvp = rsvps.find((r) => r.id === rsvpId);
      if (!rsvp) return;
      setPreviewMode(false);
      setSeatSelectingRsvp({ rsvpId, name: rsvp.name });
      setShowSeatMap(true);
    },
    [rsvps]
  );

  // Called when admin picks a seat in the seat-map modal
  const handleSeatSelect = useCallback(
    async (seatNumber: number) => {
      if (!event?.id || !seatSelectingRsvp) return;
      setSeatAssigning(true);
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/allocate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ eventId: event.id, rsvpId: seatSelectingRsvp.rsvpId, seatNumber, force: isReassigning }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error("Allocation failed", data.error || undefined);
        } else {
          // Success. First-time allocation → close so admin returns to the list.
          // Reassignment → keep open so admin can visually verify the move,
          // continue managing seats, and close when ready.
          const wasReassigning = isReassigning;
          setIsReassigning(false);
          setSeatSelectingRsvp(null);
          if (!wasReassigning) {
            setShowSeatMap(false);
          }
          toast.success(wasReassigning ? "Seat reassigned" : "Seat allocated");
        }
      } catch {
        toast.error("Network error", "Could not reach the server.");
      } finally {
        setSeatAssigning(false);
      }
    },
    [event, seatSelectingRsvp, isReassigning, toast]
  );

  // Bulk allocate
  const handleBulkAllocate = useCallback(async () => {
    if (!event?.id) return;
    const pending = rsvps.filter((r) => r.status === "pending" && r.attending);
    if (pending.length === 0) {
      toast.info("Nothing to allocate", "There are no pending RSVPs.");
      return;
    }
    const ok = await toast.confirm({
      title: `Allocate ${pending.length} pending guest${pending.length === 1 ? "" : "s"}?`,
      message: "Seats will be assigned automatically to everyone who is pending and attending.",
      confirmLabel: "Allocate",
    });
    if (!ok) return;

    setBulkAllocating(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, bulk: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Bulk allocation failed", data.error || undefined);
      } else {
        // Report the SERVER's count, not the client's expectation — they differ
        // whenever the room fills partway through, and claiming a number that
        // didn't happen is how the original allocation bug stayed invisible.
        const n = typeof data.allocated === "number" ? data.allocated : pending.length;
        if (data.seatsExhausted) {
          toast.warning(
            `Allocated ${n} of ${pending.length}`,
            "The room filled up — the remaining guests still need seats.",
          );
        } else {
          toast.success(`Allocated ${n} guest${n === 1 ? "" : "s"}`);
        }
      }
    } catch {
      toast.error("Network error", "Could not reach the server.");
    } finally {
      setBulkAllocating(false);
    }
  }, [event, rsvps, toast]);

  // Deallocate (cancel seat reservation) — row-level Cancel button keeps its
  // native confirm dialog so the list-view UX is unchanged.
  const handleDeallocate = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      const ok = await toast.confirm({
        title: "Cancel this seat reservation?",
        message: "The guest will be moved back to pending.",
        confirmLabel: "Cancel reservation",
        cancelLabel: "Keep seat",
        tone: "danger",
      });
      if (!ok) return;
      setDeallocatingId(rsvpId);
      try {
        await updateRSVP(event.id, rsvpId, {
          status: "pending",
          seatNumber: null,
        });
        toast.success("Reservation cancelled");
      } catch {
        toast.error("Failed to cancel reservation");
      } finally {
        setDeallocatingId(null);
      }
    },
    [event, toast]
  );

  // Inline cancel used by the seat map's SeatDetailPanel — no native confirm
  // (panel does its own two-step inline confirm) and throws so the panel can
  // reset its local state on failure.
  const handleInlineCancel = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      try {
        await updateRSVP(event.id, rsvpId, {
          status: "pending",
          seatNumber: null,
        });
      } catch (err) {
        toast.error("Failed to cancel reservation");
        throw err;
      }
    },
    [event, toast]
  );

  const handleLayoutChange = useCallback(
    async (seatingConfig: SeatingConfig, assignmentMode: "seat" | "table" | "free") => {
      if (!event?.id) return;
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/change-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, seatingConfig, assignmentMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Failed to update layout", data.error || undefined);
        throw new Error(data.error);
      }
      // Update local event state so seat map reflects new layout immediately
      setEvent((prev) => prev ? { ...prev, seatingConfig, assignmentMode } : prev);
      toast.success("Layout updated");
    },
    [event, toast]
  );

  const handleReassign = useCallback(
    (rsvpId: string, guestName: string) => {
      setIsReassigning(true);
      setSeatSelectingRsvp({ rsvpId, name: guestName });
      // modal stays open, selectingFor updates → transitions to selection mode
    },
    []
  );

  const handleDeleteRsvp = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      const rsvp = rsvps.find((r) => r.id === rsvpId);
      const ok = await toast.confirm({
        title: `Delete ${rsvp?.name ?? "this guest"}?`,
        message: "This permanently removes the RSVP and cannot be undone.",
        confirmLabel: "Delete",
        tone: "danger",
      });
      if (!ok) return;
      setDeletingRsvpId(rsvpId);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/delete-rsvp`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ eventId: event.id, rsvpId }),
        });
        if (!res.ok) {
          const data = await res.json();
          toast.error("Failed to delete RSVP", data.error || undefined);
        } else {
          toast.success("Guest deleted");
        }
      } catch {
        toast.error("Network error", "Could not reach the server.");
      } finally {
        setDeletingRsvpId(null);
      }
    },
    [event, rsvps, toast]
  );

  const handleExport = () => {
    if (event && rsvps.length > 0) {
      exportRSVPsToCSV(rsvps, event.title);
    }
  };

  // Corporate billing / HRD claim: payment verified by hand → activate the
  // ticket. The server confirms EVERY event on the ticket in one call (a P2
  // has records on E1 + E2 + E3), so warn accordingly before firing.
  const handleConfirmPayment = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      const rsvp = rsvps.find((r) => r.id === rsvpId);
      const ok = await toast.confirm({
        title: `Confirm payment for ${rsvp?.name ?? "this guest"}?`,
        message:
          "This activates their registration on every event of their ticket and emails the QR pass(es) immediately. Only confirm once the invoice or HRD claim is actually settled.",
        confirmLabel: "Confirm Payment",
      });
      if (!ok) return;
      setConfirmingPaymentId(rsvpId);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/confirm-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ eventId: event.id, rsvpId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Could not confirm payment", data.error || undefined);
        } else {
          toast.success("Payment confirmed", data.message || "Passes are on their way.");
        }
      } catch {
        toast.error("Network error", "Could not reach the server.");
      } finally {
        setConfirmingPaymentId(null);
      }
    },
    [event, rsvps, toast]
  );

  // "Open Google Sheet": push a fresh sync first so what opens is current.
  // The window must open synchronously (popup blockers), so open it blank and
  // point it at the sheet once the sync answers.
  const sheetId = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID;
  const handleOpenSheet = useCallback(async () => {
    if (!sheetId) return;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}`;
    const win = window.open("", "_blank");
    try {
      const headers = await getAuthHeaders();
      await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/sheets-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      });
    } catch {
      // Sheet still opens — it just shows the last synced state.
    }
    if (win) win.location.href = url;
    else window.open(url, "_blank");
  }, [sheetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!event) {
    return (
      <EmptyState
        icon={<CalendarIcon />}
        title="Event not found"
        description="This event may have been deleted."
        action={
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            Back to Events
          </button>
        }
      />
    );
  }

  const unnotifiedCount = rsvps.filter(
    (r) => (r.status === "allocated" || r.status === "checked_in") && !r.notifiedAt
  ).length;
  const isEventDay = (() => { try { return isToday(parseISO(event.date)); } catch { return false; } })();

  const moreItems: MoreMenuItem[] = [
    {
      label: "Live Check-in",
      icon: <CheckInIcon />,
      onClick: () => router.push(`/admin/events/${event.id}/check-in`),
    },
    {
      label: "Add Guest",
      icon: <UserPlusIcon />,
      onClick: () => setShowAddGuest(true),
      hidden: !isAdmin,
    },
    {
      label: "Edit Event",
      icon: <EditIcon />,
      onClick: () => setShowEditModal(true),
      hidden: !isAdmin,
    },
    {
      label: "Registration Form",
      icon: <FormFieldsIcon />,
      onClick: () => setShowFieldsModal(true),
      hidden: !isAdmin,
    },
    {
      label: "Import CSV",
      icon: <UploadIcon />,
      onClick: () => setShowImportCsvModal(true),
      hidden: !isAdmin,
    },
    {
      label: "Export CSV",
      icon: <DownloadIcon />,
      onClick: handleExport,
    },
    {
      label: "Google Forms",
      icon: <FormsIcon />,
      onClick: () => setShowGFormsModal(true),
    },
    {
      label: "Open Google Sheet",
      icon: <SheetIcon />,
      onClick: handleOpenSheet,
      hidden: !sheetId,
    },
  ];

  const heroActions: HeroActions = {
    onPreviewSeatMap: () => {
      setPreviewMode(true);
      setSeatSelectingRsvp(null);
      setShowSeatMap(true);
    },
    onOpenSeatMapPage: () => router.push(`/admin/events/${event.id}/seat-map`),
    onOpenNotifications: () => router.push(`/admin/events/${event.id}/notifications`),
    onAllocatePending: handleBulkAllocate,
    bulkAllocating,
    unnotifiedCount,
    pendingCount: stats.pending,
    moreItems,
  };

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer transition-colors"
        style={{ color: "var(--muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
        All Events
      </Link>

      {/* Hero — Event Day variant on event day, standard otherwise */}
      {isEventDay
        ? <EventDayHero event={event} rsvps={rsvps} actions={heroActions} />
        : <EventHero event={event} rsvps={rsvps} actions={heroActions} />}

      {/* Stats */}
      <EventStatsBar stats={stats} />

      {/* Waitlist — renders nothing when nobody is waiting */}
      <WaitlistPanel event={event} rsvps={rsvps} />

      {/* RSVP Table */}
      <RSVPTable
        rsvps={rsvps}
        onAllocate={handleAllocate}
        onDeallocate={handleDeallocate}
        deallocatingId={deallocatingId}
        onDeleteRsvp={isAdmin ? handleDeleteRsvp : undefined}
        deletingRsvpId={deletingRsvpId}
        onEditRsvp={isAdmin ? setEditGuest : undefined}
        onConfirmPayment={isAdmin ? handleConfirmPayment : undefined}
        confirmingPaymentId={confirmingPaymentId}
        assignmentMode={event?.assignmentMode}
        seatingConfig={event?.seatingConfig}
        totalSeats={event?.totalSeats}
        googleFormMode={googleFormMode}
        formMappings={formMappings}
        starredFieldId={starredFieldId}
      />

      {/* Google Forms modal */}
      {event && (
        <GoogleFormsModal
          open={showGFormsModal}
          onClose={() => setShowGFormsModal(false)}
          eventId={event.id!}
          eventTitle={event.title}
          googleFormMode={googleFormMode}
          onGoogleFormModeChange={setGoogleFormMode}
          mappings={formMappings}
          onMappingsChange={setFormMappings}
          apiUrl={formApiUrl}
          onApiUrlChange={setFormApiUrl}
          starredFieldId={starredFieldId}
          onStarredFieldIdChange={setStarredFieldId}
        />
      )}

      {/* Seat Map Modal — view mode OR seat-picker mode */}
      {event && (
        <SeatMapModal
          open={showSeatMap}
          onClose={() => {
            if (!seatAssigning) {
              setShowSeatMap(false);
              setSeatSelectingRsvp(null);
              setPreviewMode(false);
            }
          }}
          event={event}
          rsvps={rsvps}
          selectingFor={previewMode ? null : seatSelectingRsvp}
          onSeatSelect={previewMode ? undefined : handleSeatSelect}
          assigning={seatAssigning}
          onReassign={previewMode ? undefined : handleReassign}
          onCancel={previewMode ? undefined : handleInlineCancel}
          onLayoutChange={!previewMode && isAdmin ? handleLayoutChange : undefined}
        />
      )}

      {/* Import CSV Modal */}
      {event && (
        <ImportCsvModal
          open={showImportCsvModal}
          onClose={() => setShowImportCsvModal(false)}
          eventId={event.id!}
          onImportComplete={() => {
            // Wait a bit to ensure animations finish gracefully
            setTimeout(() => {
              setShowImportCsvModal(false);
            }, 3000);
          }}
        />
      )}

      {/* Edit Event Modal */}
      {event && showEditModal && (
        <EventFormModal
          event={event}
          allocatedCount={stats.allocated}
          onClose={() => setShowEditModal(false)}
          onSaved={(savedId) => {
            setShowEditModal(false);
            getEvent(savedId).then((ev) => { if (ev) setEvent(ev); });
          }}
        />
      )}

      {/* Add / Edit Guest Modal (live rsvps subscription refreshes the table) */}
      {event && (showAddGuest || editGuest) && (
        <GuestFormModal
          event={event}
          guest={editGuest ?? undefined}
          existingEmails={new Set(rsvps.map((r) => r.email.toLowerCase()))}
          onClose={() => { setShowAddGuest(false); setEditGuest(null); }}
          onSaved={() => { setShowAddGuest(false); setEditGuest(null); }}
        />
      )}

      {/* Registration Form (public form option lists) */}
      {event && showFieldsModal && (
        <GuestFieldsModal
          event={event}
          onClose={() => setShowFieldsModal(false)}
          onSaved={(patch) => {
            setShowFieldsModal(false);
            setEvent((prev) => (prev ? { ...prev, ...patch } : prev));
          }}
        />
      )}
    </div>
  );
};

EventDetailPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Event Detail — AuraPixel RSVP">{page}</AdminLayout>
);

export default EventDetailPage;
