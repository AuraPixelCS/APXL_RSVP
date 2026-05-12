import Link from "next/link";
import { motion } from "framer-motion";
import { format } from "date-fns";
import type { Event } from "@/types";

interface EventCardProps {
  event: Event;
  index?: number;
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

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export default function EventCard({ event, index = 0 }: EventCardProps) {
  const eventDate = event.date ? format(new Date(event.date), "dd MMM yyyy") : "—";
  const isPast = event.date ? new Date(event.date) < new Date() : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay: index * 0.06 }}
    >
      <Link
        href={`/admin/events/${event.id}`}
        className="block rounded-xl p-5 transition-all duration-200 group"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.background = "var(--surface-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.background = "var(--surface)";
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate">{event.title}</h3>
            {event.description && (
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                {event.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: event.isActive
                  ? "rgba(34,197,94,0.12)"
                  : "rgba(107,114,128,0.14)",
                color: event.isActive ? "#22c55e" : "#6b7280",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full mr-1"
                style={{ background: event.isActive ? "#22c55e" : "#6b7280" }}
              />
              {event.isActive ? "Active" : isPast ? "Past" : "Draft"}
            </span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mb-4">
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <CalendarIcon />
            {eventDate} · {event.time || "—"}
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <MapPinIcon />
            {event.venue || "TBD"}
          </span>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <UsersIcon />
            {event.totalSeats} seats
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end">
          <span
            className="flex items-center gap-1 text-xs font-medium transition-colors duration-150"
            style={{ color: "var(--accent)" }}
          >
            View Details
            <ArrowIcon />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
