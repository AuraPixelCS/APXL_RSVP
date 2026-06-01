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
import {
  getTotalSeatCount,
  getVipSeatRanges,
  planGroupAllocation,
  type AllocationStep,
} from "@/lib/seating";
import type { Event, RSVP, SeatingConfig } from "@/types";

import SeatMapBoard from "@/components/ui/SeatMapBoard";
import GuestListColumn, { buildGroupMap, type GroupField } from "@/components/ui/GuestListColumn";
import TableSeatPickerModal from "@/components/ui/TableSeatPickerModal";
import GroupAllocConfirmModal from "@/components/ui/GroupAllocConfirmModal";
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
  // Active drag carries the full group's ids — single-guest drags are an
  // array of length 1. primaryName is the dragged card's name (so the overlay
  // can read "Ak Tesr +4 more from {label}"). groupLabel is set only when the
  // drag covers a real >1 group.
  const [activeDragGuest, setActiveDragGuest] = useState<
    | { rsvpIds: string[]; primaryName: string; groupLabel?: string }
    | null
  >(null);
  const [assigning, setAssigning] = useState(false);

  // Group-by state — ephemeral, page-level. Clearing returns to single-drag.
  const [groupBy, setGroupBy] = useState<GroupField[]>([]);
  // Pending overflow confirm (plan spans 2+ steps).
  const [pendingGroupPlan, setPendingGroupPlan] = useState<
    | { plan: AllocationStep[]; rsvpIds: string[]; groupLabel?: string }
    | null
  >(null);

  // Edit Layout modal state lives at the page level so the modal can be
  // mounted at the page root (avoiding the header's backdrop-filter containing
  // block, which broke `position: fixed` centering).
  const [editLayoutOpen, setEditLayoutOpen] = useState(false);
  const [editLayoutPendingConfig, setEditLayoutPendingConfig] = useState<SeatingConfig | null>(null);
  const [editLayoutSaving, setEditLayoutSaving] = useState(false);

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

  // ── Edit Layout handlers ───────────────────────────────────────────────────
  const handleEditLayoutOpen = useCallback(() => {
    if (!event) return;
    setEditLayoutPendingConfig(event.seatingConfig ?? { style: "theater", seatsPerRow: 10 });
    setEditLayoutOpen(true);
  }, [event]);

  const handleEditLayoutSave = useCallback(async () => {
    if (!event?.id || !editLayoutPendingConfig) return;
    setEditLayoutSaving(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/change-layout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            eventId: event.id,
            seatingConfig: editLayoutPendingConfig,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to update layout");
        return;
      }
      setEvent({ ...event, seatingConfig: editLayoutPendingConfig });
      // Layout regenerates seat ids — drop any active group state.
      setGroupBy([]);
      setEditLayoutOpen(false);
    } finally {
      setEditLayoutSaving(false);
    }
  }, [event, editLayoutPendingConfig]);

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

  // ── Group-by computation ───────────────────────────────────────────────────
  // groupMap maps every rsvp.id → full ordered list of ids in the same group
  // (length 1 for solo / ungrouped). Shared between the list column (for the
  // visual accent bar + sibling-ghost-on-drag) and the drag-start handler
  // (which uses it to populate the dragged set).
  const groupMap = useMemo(() => buildGroupMap(rsvps, groupBy), [rsvps, groupBy]);

  // Group label for the drag overlay + confirm modal. Looks up the first id
  // in the group, derives the label from the active fields.
  const groupLabelFor = useCallback(
    (rsvp: RSVP | undefined): string | undefined => {
      if (!rsvp || groupBy.length === 0) return undefined;
      const parts = groupBy.map((f) => (rsvp[f] ?? "").trim()).filter(Boolean);
      if (parts.length === 0) return undefined;
      return parts.join(" · ");
    },
    [groupBy]
  );

  // Executes a multi-step allocation plan sequentially (Firestore subscription
  // reconciles after each call). Stops on first failure and surfaces an alert.
  const executePlan = useCallback(
    async (plan: AllocationStep[], rsvpIds: string[]) => {
      if (!event?.id) return;
      // Flatten plan into ordered (rsvpId, seatNumber) pairs.
      const seatNumbers = plan.flatMap((s) => s.seatNumbers);
      if (seatNumbers.length !== rsvpIds.length) {
        alert("Allocation plan does not match group size — aborted.");
        return;
      }
      setAssigning(true);
      try {
        const authHeaders = await getAuthHeaders();
        for (let i = 0; i < rsvpIds.length; i++) {
          const rsvpId = rsvpIds[i];
          const seatNumber = seatNumbers[i];
          const wasAllocated = rsvps.find((r) => r.id === rsvpId)?.seatNumber != null;
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/allocate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify({
                eventId: event.id,
                rsvpId,
                seatNumber,
                force: wasAllocated,
              }),
            }
          );
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(`Stopped at guest ${i + 1}/${rsvpIds.length}: ${data.error ?? "allocation failed"}`);
            break;
          }
        }
      } catch {
        alert("Network error during group allocation");
      } finally {
        setAssigning(false);
        setSelectedGuestId(null);
      }
    },
    [event, rsvps]
  );

  // Common dispatch for a group drop (resolved seat or table start). Handles
  // the plan → either silent allocate (1 step) or open confirm modal (>1 step).
  const dispatchGroupDrop = useCallback(
    (
      rsvpIds: string[],
      groupLabel: string | undefined,
      start: Parameters<typeof planGroupAllocation>[0]["start"]
    ) => {
      if (!event) return;
      const totalSeats = getTotalSeatCount(event.seatingConfig, event.totalSeats);
      const allSeats = buildSeatMap(totalSeats, rsvps);
      const result = planGroupAllocation({
        allSeats,
        seatingConfig: event.seatingConfig,
        totalStandardSeats: event.totalSeats,
        groupSize: rsvpIds.length,
        start,
      });
      if (!result.ok) {
        alert(
          `Only ${result.available} free seat${result.available === 1 ? "" : "s"} available — need ${rsvpIds.length}. Allocation cancelled.`
        );
        return;
      }
      if (result.steps.length === 1) {
        void executePlan(result.steps, rsvpIds);
      } else {
        setPendingGroupPlan({ plan: result.steps, rsvpIds, groupLabel });
      }
    },
    [event, rsvps, executePlan]
  );

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { name?: string; rsvpId?: string } | undefined;
    if (!data?.rsvpId || !data?.name) return;
    const ids = groupMap.get(data.rsvpId) ?? [data.rsvpId];
    const primary = rsvps.find((r) => r.id === data.rsvpId);
    setActiveDragGuest({
      rsvpIds: ids,
      primaryName: data.name,
      groupLabel: ids.length > 1 ? groupLabelFor(primary) : undefined,
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const dragged = activeDragGuest;
    setActiveDragGuest(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    const data = active.data.current as { rsvpId?: string; name?: string; currentSeat?: number | null } | undefined;
    if (!data?.rsvpId) return;

    // Resolve the full set of guests this drag carries — falls back to the
    // single dragged id if the group computation hasn't refreshed yet.
    const rsvpIds = dragged?.rsvpIds ?? groupMap.get(data.rsvpId) ?? [data.rsvpId];
    const isGroup = rsvpIds.length > 1;
    const groupLabel = dragged?.groupLabel;

    if (overId.startsWith("seat-")) {
      const seatNumber = parseInt(overId.slice("seat-".length), 10);
      if (Number.isNaN(seatNumber)) return;
      if (isGroup) {
        dispatchGroupDrop(rsvpIds, groupLabel, { kind: "seat", seatNumber });
      } else {
        const isReassignment = data.currentSeat != null;
        void allocateSeat(data.rsvpId, seatNumber, isReassignment);
      }
    } else if (overId.startsWith("vip-table-")) {
      const tableIndex = parseInt(overId.slice("vip-table-".length), 10);
      if (Number.isNaN(tableIndex)) return;
      if (isGroup) {
        dispatchGroupDrop(rsvpIds, groupLabel, { kind: "table", tableIndex, variant: "vip" });
      } else {
        openVipTablePicker(tableIndex, data.rsvpId, data.name ?? "guest");
      }
    } else if (overId.startsWith("std-table-")) {
      const tableIndex = parseInt(overId.slice("std-table-".length), 10);
      if (Number.isNaN(tableIndex)) return;
      if (isGroup) {
        dispatchGroupDrop(rsvpIds, groupLabel, { kind: "table", tableIndex, variant: "standard" });
      } else {
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
              <EditLayoutButton onOpen={handleEditLayoutOpen} />
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
              groupBy={groupBy}
              setGroupBy={setGroupBy}
              groupMap={groupMap}
              draggingRsvpIds={
                activeDragGuest && activeDragGuest.rsvpIds.length > 1
                  ? new Set(activeDragGuest.rsvpIds)
                  : null
              }
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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                maxWidth: 420,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 180,
                }}
              >
                {activeDragGuest.primaryName}
              </span>
              {activeDragGuest.rsvpIds.length > 1 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "rgba(61,155,245,0.2)",
                    color: "var(--accent)",
                    fontFamily: "'Fira Code', monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 220,
                    flexShrink: 0,
                  }}
                  title={activeDragGuest.groupLabel}
                >
                  +{activeDragGuest.rsvpIds.length - 1} more
                  {activeDragGuest.groupLabel ? ` · ${activeDragGuest.groupLabel}` : ""}
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <GroupAllocConfirmModal
        open={!!pendingGroupPlan}
        plan={pendingGroupPlan?.plan ?? []}
        rsvpCount={pendingGroupPlan?.rsvpIds.length ?? 0}
        groupLabel={pendingGroupPlan?.groupLabel}
        assigning={assigning}
        onCancel={() => setPendingGroupPlan(null)}
        onConfirm={async () => {
          const pending = pendingGroupPlan;
          if (!pending) return;
          setPendingGroupPlan(null);
          await executePlan(pending.plan, pending.rsvpIds);
        }}
      />

      <AnimatePresence>
        {editLayoutOpen && editLayoutPendingConfig && event && (
          <EditLayoutModal
            event={event}
            pendingConfig={editLayoutPendingConfig}
            setPendingConfig={setEditLayoutPendingConfig}
            saving={editLayoutSaving}
            onClose={() => setEditLayoutOpen(false)}
            onSave={handleEditLayoutSave}
          />
        )}
      </AnimatePresence>

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

// Button only — the modal is mounted at the page root so its `position: fixed`
// anchors to the viewport, not the header (which creates a containing block
// via `backdrop-filter` per the CSS spec).
function EditLayoutButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
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
