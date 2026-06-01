import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { useAuthContext } from "@/contexts/AuthContext";
import { subscribeToRSVPs, getEvent, updateRSVP } from "@/lib/firestore";
import { getAuthHeaders } from "@/lib/auth";
import { getSeatLabel } from "@/lib/seatLabel";
import { getTotalSeatCount, getVipSeatRanges } from "@/lib/seating";
import type { Event, RSVP, SeatingConfig } from "@/types";

import SeatMapBoard from "@/components/ui/SeatMapBoard";
import GuestListColumn from "@/components/ui/GuestListColumn";
import TableSeatPickerModal from "@/components/ui/TableSeatPickerModal";
import SeatingConfigurator from "@/components/ui/SeatingConfigurator";
import { buildSeatMap, buildVipTableGroups } from "@/components/ui/SeatMapModal";

const SIDEBAR_W = 64;
const SIDEBAR_BG = "var(--surface)";

// ─── Page ─────────────────────────────────────────────────────────────────────

function SeatMapPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuthContext();
  const reduceMotion = useReducedMotion();

  const [event, setEvent] = useState<Event | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [eventLoading, setEventLoading] = useState(true);

  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [activeDragGuest, setActiveDragGuest] = useState<{ name: string; rsvpId: string } | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Sidebar slide-out: collapsed=true means hidden off-screen.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    // Tiny delay so admins perceive the slide as a deliberate animation.
    const t = setTimeout(() => setSidebarCollapsed(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Auth guard — same pattern as AdminLayout.
  useEffect(() => {
    if (!authLoading && !user) router.replace("/admin/login");
  }, [authLoading, user, router]);

  // Load event + subscribe RSVPs.
  useEffect(() => {
    if (typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      try {
        const e = await getEvent(id);
        if (!cancelled) setEvent(e);
      } finally {
        if (!cancelled) setEventLoading(false);
      }
    })();
    const unsub = subscribeToRSVPs(id, setRsvps);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [id]);

  // ── Drop-target adapters ───────────────────────────────────────────────────
  const isTableLayout =
    event?.seatingConfig?.style === "banquet" ||
    event?.seatingConfig?.style === "banquet-runway";

  const totalSeats = event ? getTotalSeatCount(event.seatingConfig, event.totalSeats) : 0;
  const allSeats = useMemo(
    () => (event ? buildSeatMap(totalSeats, rsvps) : []),
    [totalSeats, rsvps, event]
  );

  const getSeatDropId = useCallback(
    (seatNumber: number): string | undefined => {
      // For seat-mode layouts (theater/auditorium/classroom/runway), every seat
      // is droppable. For table layouts, drops happen at the TABLE level only —
      // a guest dropped on a single seat circle would be ambiguous in table mode.
      if (isTableLayout) return undefined;
      const seat = allSeats[seatNumber - 1];
      if (!seat || seat.status !== "available") return undefined;
      return `seat-${seatNumber}`;
    },
    [isTableLayout, allSeats]
  );

  const getTableDropId = useCallback(
    (tableIndex: number, variant: "vip" | "standard"): string | undefined => {
      if (!isTableLayout) return undefined;
      // VIP and standard tables both use 0-based indices, so namespace the
      // droppable id to keep them distinct (`vip-table-0` vs `std-table-0`).
      return variant === "vip" ? `vip-table-${tableIndex}` : `std-table-${tableIndex}`;
    },
    [isTableLayout]
  );

  // ── Allocate API ───────────────────────────────────────────────────────────
  const allocateSeat = useCallback(
    async (rsvpId: string, seatNumber: number, isReassignment: boolean) => {
      if (!event?.id) return;
      setAssigning(true);
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/allocate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              eventId: event.id,
              rsvpId,
              seatNumber,
              force: isReassignment,
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || "Allocation failed");
        }
      } catch {
        alert("Network error");
      } finally {
        setAssigning(false);
        setSelectedGuestId(null);
      }
    },
    [event]
  );

  // ── Drop handlers ──────────────────────────────────────────────────────────
  const seatsPerTable = event?.seatingConfig?.seatsPerTable ?? 10;

  // Table-drop pending state — when admin drops a guest on a table, this opens
  // the mini seat-picker so they choose the exact seat at that table.
  const [pendingTableDrop, setPendingTableDrop] = useState<{
    rsvpId: string;
    guestName: string;
    tableIndex: number;
    tableSeats: ReturnType<typeof buildSeatMap>;
    tableLabel?: string;
    isVip: boolean;
  } | null>(null);

  const vipTableGroups = useMemo(
    () => (event ? buildVipTableGroups(allSeats, event.seatingConfig, event.totalSeats) : []),
    [allSeats, event]
  );

  const openVipTablePicker = useCallback(
    (tableIndex: number, rsvpId: string, guestName: string) => {
      const vipGroup = vipTableGroups.find((g) => g.tableIndex === tableIndex);
      if (!vipGroup) return;
      setPendingTableDrop({
        rsvpId,
        guestName,
        tableIndex,
        tableSeats: vipGroup.seats,
        tableLabel: vipGroup.table.label,
        isVip: true,
      });
    },
    [vipTableGroups]
  );

  const openStandardTablePicker = useCallback(
    (tableIndex: number, rsvpId: string, guestName: string) => {
      if (!event) return;
      const standard = allSeats.slice(0, event.totalSeats);
      const start = tableIndex * seatsPerTable;
      const tableSeats = standard.slice(start, start + seatsPerTable);
      setPendingTableDrop({
        rsvpId,
        guestName,
        tableIndex,
        tableSeats,
        isVip: false,
      });
    },
    [event, allSeats, seatsPerTable]
  );

  // ── SeatDetailPanel actions ────────────────────────────────────────────────
  // Change [Seat/Table/VIP] — flips into selection mode for that guest. From
  // there: seat layouts → click any free seat; banquet → click any table to
  // open the picker.
  const handleReassign = useCallback(
    (rsvpId: string, _guestName: string) => {
      setSelectedGuestId(rsvpId);
    },
    []
  );

  // Cancel [Seat/Table/VIP] — deallocate the guest entirely. SeatDetailPanel
  // does its own two-step inline confirm before calling this.
  const handleCancel = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      try {
        await updateRSVP(event.id, rsvpId, { status: "pending", seatNumber: null });
      } catch (err) {
        alert("Failed to cancel reservation");
        throw err;
      }
    },
    [event]
  );

  // Click-on-table in selection mode (banquet layouts) — opens the picker
  // for the chosen table so admin picks the exact seat. Same flow as drag-drop.
  const handleTableSelect = useCallback(
    (tableIndex: number, variant: "vip" | "standard") => {
      if (!selectedGuestId) return;
      const rsvp = rsvps.find((r) => r.id === selectedGuestId);
      if (!rsvp) return;
      if (variant === "vip") {
        openVipTablePicker(tableIndex, selectedGuestId, rsvp.name);
      } else {
        openStandardTablePicker(tableIndex, selectedGuestId, rsvp.name);
      }
    },
    [selectedGuestId, rsvps, openVipTablePicker, openStandardTablePicker]
  );

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { name?: string; rsvpId?: string } | undefined;
    if (data?.name && data?.rsvpId) {
      setActiveDragGuest({ name: data.name, rsvpId: data.rsvpId });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragGuest(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const data = active.data.current as { rsvpId?: string; name?: string; currentSeat?: number | null } | undefined;
    if (!data?.rsvpId) return;
    const isReassignment = data.currentSeat != null;

    if (overId.startsWith("seat-")) {
      const seatNumber = parseInt(overId.slice("seat-".length), 10);
      if (!Number.isNaN(seatNumber)) {
        void allocateSeat(data.rsvpId, seatNumber, isReassignment);
      }
    } else if (overId.startsWith("vip-table-")) {
      const tableIndex = parseInt(overId.slice("vip-table-".length), 10);
      if (!Number.isNaN(tableIndex)) {
        openVipTablePicker(tableIndex, data.rsvpId, data.name ?? "guest");
      }
    } else if (overId.startsWith("std-table-")) {
      const tableIndex = parseInt(overId.slice("std-table-".length), 10);
      if (!Number.isNaN(tableIndex)) {
        openStandardTablePicker(tableIndex, data.rsvpId, data.name ?? "guest");
      }
    }
  };

  // Click-to-place fallback — when a guest is click-selected, clicking any seat
  // in the board calls onSeatSelect with the seat number.
  const handleSeatSelect = useCallback(
    (seatNumber: number) => {
      if (!selectedGuestId) return;
      const rsvp = rsvps.find((r) => r.id === selectedGuestId);
      if (!rsvp) return;
      void allocateSeat(selectedGuestId, seatNumber, rsvp.seatNumber != null);
    },
    [selectedGuestId, rsvps, allocateSeat]
  );

  const selectingFor = useMemo(() => {
    if (!selectedGuestId) return null;
    const rsvp = rsvps.find((r) => r.id === selectedGuestId);
    if (!rsvp) return null;
    return { rsvpId: rsvp.id!, name: rsvp.name };
  }, [selectedGuestId, rsvps]);

  // ── Back navigation with sidebar slide-in first ────────────────────────────
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBack = () => {
    if (navTimerRef.current) return; // already navigating
    if (reduceMotion) {
      router.push(`/admin/events/${id}`);
      return;
    }
    setSidebarCollapsed(false);
    navTimerRef.current = setTimeout(() => {
      router.push(`/admin/events/${id}`);
    }, 220);
  };
  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  // ── Seat-label derivation for guest cards ──────────────────────────────────
  const renderSeatLabel = useCallback(
    (rsvp: RSVP): string | null => {
      if (rsvp.seatNumber == null || !event) return null;
      // VIP?
      const vipRange = getVipSeatRanges(event.seatingConfig, event.totalSeats).find(
        (r) => rsvp.seatNumber! >= r.start && rsvp.seatNumber! <= r.end
      );
      if (vipRange) {
        const seatInTable = rsvp.seatNumber! - vipRange.start + 1;
        const label = vipRange.table.label ?? `T${vipRange.tableIndex + 1}`;
        return `VIP ${label} · #${seatInTable}`;
      }
      if (event.assignmentMode === "table") {
        const t = Math.ceil(rsvp.seatNumber! / seatsPerTable);
        return `Table ${t}`;
      }
      const cfg = event.seatingConfig ?? { style: "theater" as const, seatsPerRow: 10 };
      const lbl = getSeatLabel(rsvp.seatNumber!, cfg);
      return lbl ? `${lbl.row}${lbl.pos}` : `#${rsvp.seatNumber}`;
    },
    [event, seatsPerTable]
  );

  // ── DnD sensors ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // ── Render guards ──────────────────────────────────────────────────────────
  if (authLoading || !user) return <FullPageSpinner />;
  if (eventLoading) return <FullPageSpinner />;
  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Event not found</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Seat Map — {event.title} · AuraPixel RSVP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex flex-col bg-background overflow-hidden"
          style={{ height: "100dvh" }}
        >
          {/* Slide-out sidebar placeholder. We render a thin rail that
              matches the real Sidebar's footprint (so navigating FROM the
              event details page feels continuous), then animate it off-screen
              on mount. */}
          <motion.div
            initial={false}
            animate={{
              x: sidebarCollapsed ? -SIDEBAR_W : 0,
              opacity: sidebarCollapsed ? 0 : 1,
            }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              height: "100vh",
              width: SIDEBAR_W,
              background: SIDEBAR_BG,
              borderRight: "1px solid var(--border)",
              zIndex: 40,
              pointerEvents: "none",
            }}
            aria-hidden
          />

          {/* Top bar */}
          <header
            className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0"
            style={{
              height: "var(--header-height)",
              background: "rgba(13, 13, 13, 0.92)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={handleBack}
                aria-label="Back to event details"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--muted)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "white"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--muted)"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span className="hidden sm:inline">Back</span>
              </button>

              <div className="min-w-0">
                <h1 className="text-sm font-bold text-white truncate leading-tight">{event.title}</h1>
                <p className="text-[11px] hidden sm:block" style={{ color: "var(--muted)" }}>
                  Seat allocator · drag a guest onto a seat or table
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <EditLayoutLauncher event={event} onSaved={(e) => setEvent(e)} />
              <StatusChip rsvps={rsvps} totalSeats={totalSeats} />
            </div>
          </header>

          {/* Body: guest list + seat map */}
          <div className="flex flex-1 min-h-0">
            <GuestListColumn
              rsvps={rsvps}
              selectedGuestId={selectedGuestId}
              onSelectGuest={setSelectedGuestId}
              renderSeatLabel={renderSeatLabel}
            />

            <div className="flex flex-col flex-1 min-w-0 min-h-0">
              {/* In-flight banner mirrors the modal's pattern. */}
              <AnimatePresence>
                {(selectingFor || assigning) && (
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
                            Allocating seat…
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
                            <span className="hidden sm:inline"> — or press Esc to cancel</span>
                          </p>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SeatMapBoard
                event={event}
                rsvps={rsvps}
                selectingFor={selectingFor}
                onSeatSelect={handleSeatSelect}
                assigning={assigning}
                onReassign={handleReassign}
                onCancel={handleCancel}
                onTableSelect={handleTableSelect}
                getSeatDropId={getSeatDropId}
                getTableDropId={getTableDropId}
              />
            </div>
          </div>
        </div>

        {/* Floating drag preview */}
        <DragOverlay dropAnimation={null}>
          {activeDragGuest && (
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid rgba(61,155,245,0.45)",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                cursor: "grabbing",
              }}
            >
              {activeDragGuest.name}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TableSeatPickerModal
        open={!!pendingTableDrop}
        onClose={() => setPendingTableDrop(null)}
        tableSeats={pendingTableDrop?.tableSeats ?? []}
        tableIndex={pendingTableDrop?.tableIndex ?? 0}
        tableLabel={pendingTableDrop?.tableLabel}
        isVip={pendingTableDrop?.isVip ?? false}
        guestName={pendingTableDrop?.guestName ?? ""}
        assigning={assigning}
        onSeatPick={(seatNumber) => {
          const pending = pendingTableDrop;
          if (!pending) return;
          setPendingTableDrop(null);
          const rsvp = rsvps.find((r) => r.id === pending.rsvpId);
          void allocateSeat(pending.rsvpId, seatNumber, rsvp?.seatNumber != null);
        }}
      />

      {/* Esc clears click-selection. */}
      <KeyboardEscape onEsc={() => setSelectedGuestId(null)} />
    </>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

function StatusChip({ rsvps, totalSeats }: { rsvps: RSVP[]; totalSeats: number }) {
  const allocated = rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
  const pct = totalSeats > 0 ? Math.round((allocated / totalSeats) * 100) : 0;
  return (
    <div
      className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        fontSize: 11,
      }}
    >
      <span style={{ color: "var(--muted)" }}>Allocated</span>
      <span style={{ color: "#fff", fontFamily: "'Fira Code', monospace", fontWeight: 600 }}>
        {allocated} / {totalSeats}
      </span>
      <span style={{ color: "var(--accent)", fontFamily: "'Fira Code', monospace", fontWeight: 600 }}>
        {pct}%
      </span>
    </div>
  );
}

function EditLayoutLauncher({
  event,
  onSaved,
}: {
  event: Event;
  onSaved: (next: Event) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<SeatingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <button
        onClick={() => {
          setPendingConfig(event.seatingConfig ?? { style: "theater", seatsPerRow: 10 });
          setOpen(true);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0"
        style={{
          background: "var(--surface-3)",
          color: "var(--muted)",
          border: "1px solid var(--border)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span className="hidden sm:inline">Edit Layout</span>
      </button>

      <AnimatePresence>
        {open && pendingConfig && (
          <EditLayoutModal
            event={event}
            pendingConfig={pendingConfig}
            setPendingConfig={setPendingConfig}
            saving={saving}
            onClose={() => setOpen(false)}
            onSave={async () => {
              if (!event.id || !pendingConfig) return;
              setSaving(true);
              try {
                const authHeaders = await getAuthHeaders();
                const res = await fetch(
                  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/change-layout`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...authHeaders },
                    body: JSON.stringify({
                      eventId: event.id,
                      seatingConfig: pendingConfig,
                    }),
                  }
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  alert(data.error || "Failed to update layout");
                  return;
                }
                onSaved({ ...event, seatingConfig: pendingConfig });
                setOpen(false);
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function EditLayoutModal({
  event,
  pendingConfig,
  setPendingConfig,
  saving,
  onClose,
  onSave,
}: {
  event: Event;
  pendingConfig: SeatingConfig;
  setPendingConfig: (c: SeatingConfig) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <motion.div
        className="rounded-2xl flex flex-col"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          maxWidth: 720,
          width: "100%",
          maxHeight: "85dvh",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold text-white">Edit Layout</h3>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Close edit layout"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
            style={{ color: "var(--muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <SeatingConfigurator
            config={pendingConfig}
            onChange={setPendingConfig}
            totalSeats={event.totalSeats}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--surface-3)", color: "white", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            {saving ? "Saving…" : "Save Layout"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function KeyboardEscape({ onEsc }: { onEsc: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEsc();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEsc]);
  return null;
}

// Page-level layout opts out of AdminLayout — this page renders its own shell.
SeatMapPage.getLayout = (page: ReactElement) => page;

export default SeatMapPage;
