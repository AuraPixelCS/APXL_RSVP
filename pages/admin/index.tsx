import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EventCard from "@/components/ui/EventCard";
import EmptyState from "@/components/ui/EmptyState";
import EventFormModal from "@/components/ui/EventFormModal";
import { subscribeToEvents, subscribeToRSVPs, updateEvent } from "@/lib/firestore";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Event, RSVP } from "@/types";
import type { Unsubscribe } from "firebase/firestore";
import { parseISO, differenceInCalendarDays } from "date-fns";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

type TabKey = "upcoming" | "past";

const AdminHome: NextPageWithLayout = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [allRsvps, setAllRsvps] = useState<Map<string, RSVP[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<TabKey>("upcoming");
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { role } = useAuthContext();
  const isAdmin = role === "admin";

  // Per-event RSVP subscription lifecycle (same pattern as dashboard)
  const rsvpSubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  useEffect(() => {
    const unsubEvents = subscribeToEvents((evts) => {
      setEvents(evts);
      setLoading(false);
    });
    return () => {
      unsubEvents();
      rsvpSubsRef.current.forEach((u) => u());
      rsvpSubsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const subs = rsvpSubsRef.current;
    const wanted = new Set(events.map((e) => e.id).filter((id): id is string => !!id));
    for (const [id, unsub] of subs.entries()) {
      if (!wanted.has(id)) {
        unsub();
        subs.delete(id);
        setAllRsvps((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }
    for (const id of wanted) {
      if (!subs.has(id)) {
        const unsub = subscribeToRSVPs(id, (rsvps) => {
          setAllRsvps((prev) => {
            const next = new Map(prev);
            next.set(id, rsvps);
            return next;
          });
        });
        subs.set(id, unsub);
      }
    }
  }, [events]);

  const handleCreated = (newId: string) => {
    setShowForm(false);
    router.push(`/admin/events/${newId}`);
  };

  // Split into upcoming (pinned first, then by date asc) and past (date desc)
  const { upcoming, past } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const up: Event[] = [];
    const pa: Event[] = [];
    for (const e of events) {
      try {
        const days = differenceInCalendarDays(parseISO(e.date), today);
        if (days >= 0) up.push(e); else pa.push(e);
      } catch {
        up.push(e); // unparseable dates → treat as upcoming
      }
    }
    up.sort((a, b) => {
      // Pinned events float to the top
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.date.localeCompare(b.date);
    });
    pa.sort((a, b) => b.date.localeCompare(a.date));
    return { upcoming: up, past: pa };
  }, [events]);

  const handleTogglePin = async (eventId: string, nextPinned: boolean) => {
    // Optimistic: live subscription will reconcile state from Firestore
    try {
      await updateEvent(eventId, { pinned: nextPinned });
    } catch (err) {
      console.error("Failed to toggle pin", err);
    }
  };

  const visibleList = tab === "upcoming" ? upcoming : past;
  const showSearch = tab === "past" && past.length >= 6;
  const filteredList = useMemo(() => {
    if (!showSearch || !search.trim()) return visibleList;
    const q = search.toLowerCase();
    return visibleList.filter((e) => e.title.toLowerCase().includes(q) || (e.venue ?? "").toLowerCase().includes(q));
  }, [visibleList, showSearch, search]);

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

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Events</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Manage your events and RSVPs
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            <PlusIcon />
            New Event
          </button>
        )}
      </div>

      {/* Event Form Modal */}
      {showForm && (
        <EventFormModal
          onClose={() => setShowForm(false)}
          onSaved={handleCreated}
        />
      )}

      {/* Empty state — only when no events at all */}
      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon />}
          title="No events yet"
          description="Create your first event to start collecting RSVPs."
          action={
            isAdmin ? (
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                Create Event
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Tabs + search */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div
              className="inline-flex items-center rounded-lg p-1"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              role="tablist"
            >
              <TabButton
                active={tab === "upcoming"}
                count={upcoming.length}
                onClick={() => { setTab("upcoming"); setSearch(""); }}
              >
                Upcoming
              </TabButton>
              <TabButton
                active={tab === "past"}
                count={past.length}
                onClick={() => setTab("past")}
              >
                Past
              </TabButton>
            </div>

            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 240 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relative"
                  style={{ overflow: "hidden" }}
                >
                  <span
                    className="absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--muted)" }}
                  >
                    <SearchIcon />
                  </span>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search past events…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Event grid (or empty per-tab state) */}
          {filteredList.length === 0 ? (
            <div
              className="rounded-xl py-12 px-4 text-center"
              style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}
            >
              <p className="text-sm text-white font-medium">
                {tab === "upcoming"
                  ? "No upcoming events"
                  : search
                    ? `No past events match "${search}"`
                    : "No past events"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {tab === "upcoming" && isAdmin
                  ? "Create one to start collecting RSVPs."
                  : tab === "past"
                    ? "Events will appear here once they've passed."
                    : ""}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredList.map((event, i) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    rsvps={allRsvps.get(event.id!) ?? []}
                    index={i}
                    pinnable={tab === "upcoming" && isAdmin}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function TabButton({
  active, count, onClick, children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#000" : "var(--muted)",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
    >
      {children}
      <span
        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: active ? "rgba(0,0,0,0.15)" : "var(--surface-3)",
          color: active ? "#000" : "var(--muted)",
          minWidth: 18,
          height: 16,
          padding: "0 5px",
        }}
      >
        {count}
      </span>
    </button>
  );
}

AdminHome.getLayout = (page: ReactElement) => (
  <AdminLayout title="Events — AuraPixel RSVP">{page}</AdminLayout>
);

export default AdminHome;
