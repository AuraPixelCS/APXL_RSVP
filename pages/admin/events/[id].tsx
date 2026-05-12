import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EventStatsBar from "@/components/ui/EventStatsBar";
import RSVPTable from "@/components/ui/RSVPTable";
import EmptyState from "@/components/ui/EmptyState";
import { getEvent, subscribeToRSVPs, updateRSVP } from "@/lib/firestore";
import { exportRSVPsToCSV } from "@/lib/csvExport";
import GoogleFormsModal, { DEFAULT_MAPPINGS, DEFAULT_API_URL } from "@/components/ui/GoogleFormsModal";
import ImportCsvModal from "@/components/ui/ImportCsvModal";
import SeatMapModal from "@/components/ui/SeatMapModal";
import { useAuthContext } from "@/contexts/AuthContext";
import { getAuthHeaders } from "@/lib/auth";
import type { Event, RSVP, EventStats, FieldMapping, SeatingConfig } from "@/types";
import { format } from "date-fns";

function computeStats(rsvps: RSVP[]): EventStats {
  return {
    total: rsvps.length,
    attending: rsvps.filter((r) => r.attending).length,
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
  const isAdmin = role === "admin";

  const [event, setEvent] = useState<Event | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [bulkAllocating, setBulkAllocating] = useState(false);
  const [deallocatingId, setDeallocatingId] = useState<string | null>(null);
  const [deletingRsvpId, setDeletingRsvpId] = useState<string | null>(null);
  const [showSeatMap, setShowSeatMap] = useState(false);
  const [showImportCsvModal, setShowImportCsvModal] = useState(false);
  // Seat-picker selection state
  const [seatSelectingRsvp, setSeatSelectingRsvp] = useState<{ rsvpId: string; name: string } | null>(null);
  const [seatAssigning, setSeatAssigning] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
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
          alert(data.error || "Allocation failed");
        } else {
          // Success — close modal, clear selection
          setIsReassigning(false);
          setShowSeatMap(false);
          setSeatSelectingRsvp(null);
        }
      } catch {
        alert("Network error");
      } finally {
        setSeatAssigning(false);
      }
    },
    [event, seatSelectingRsvp]
  );

  // Bulk allocate
  const handleBulkAllocate = useCallback(async () => {
    if (!event?.id) return;
    const pending = rsvps.filter((r) => r.status === "pending" && r.attending);
    if (pending.length === 0) {
      alert("No pending RSVPs to allocate.");
      return;
    }
    if (!confirm(`Allocate seats to ${pending.length} pending RSVPs?`)) return;

    setBulkAllocating(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, bulk: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Bulk allocation failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setBulkAllocating(false);
    }
  }, [event, rsvps]);

  // Deallocate (cancel seat reservation)
  const handleDeallocate = useCallback(
    async (rsvpId: string) => {
      if (!event?.id) return;
      if (!confirm("Cancel this seat reservation? The guest will be moved back to pending.")) return;
      setDeallocatingId(rsvpId);
      try {
        await updateRSVP(event.id, rsvpId, {
          status: "pending",
          seatNumber: null,
        });
      } catch {
        alert("Failed to cancel reservation");
      } finally {
        setDeallocatingId(null);
      }
    },
    [event]
  );

  const handleLayoutChange = useCallback(
    async (seatingConfig: SeatingConfig, assignmentMode: "seat" | "table") => {
      if (!event?.id) return;
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/change-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, seatingConfig, assignmentMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update layout");
        throw new Error(data.error);
      }
      // Update local event state so seat map reflects new layout immediately
      setEvent((prev) => prev ? { ...prev, seatingConfig, assignmentMode } : prev);
    },
    [event]
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
      if (!confirm(`Delete "${rsvp?.name ?? "this guest"}"? This cannot be undone.`)) return;
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
          alert(data.error || "Failed to delete RSVP");
        }
      } catch {
        alert("Network error");
      } finally {
        setDeletingRsvpId(null);
      }
    },
    [event, rsvps]
  );

  const handleExport = () => {
    if (event && rsvps.length > 0) {
      exportRSVPsToCSV(rsvps, event.title);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-white truncate">{event.title}</h1>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0"
              style={{
                background: event.isActive ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.14)",
                color: event.isActive ? "#22c55e" : "#6b7280",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full mr-1"
                style={{ background: event.isActive ? "#22c55e" : "#6b7280" }}
              />
              {event.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              <CalendarIcon />
              {event.date ? format(new Date(event.date), "dd MMM yyyy") : "—"} · {event.time || "—"}
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              <MapPinIcon />
              {event.venue}
            </span>
          </div>

          {event.description && (
            <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--muted)" }}>
              {event.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBulkAllocate}
            disabled={bulkAllocating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-50"
            style={{
              background: "var(--surface-2)",
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            <BulkIcon />
            {bulkAllocating ? "Allocating…" : "Bulk Allocate"}
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowImportCsvModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
              style={{
                background: "var(--surface-2)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}
            >
              <UploadIcon />
              Import CSV
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
            style={{
              background: "var(--surface-2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            <DownloadIcon />
            Export CSV
          </button>
          <button
            onClick={() => setShowGFormsModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
            style={{
              background: "var(--surface-2)",
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            <FormsIcon />
            Google Forms
          </button>
          <button
            onClick={() => setShowSeatMap(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
            style={{
              background: "var(--surface-2)",
              color: "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            <GridIcon />
            Seat Map
          </button>
          <button
            onClick={() => router.push(`/admin/events/${event.id}/notifications`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 relative"
            style={{
              background: "var(--surface-2)",
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            <BellIcon />
            Notifications
            {rsvps.filter((r) => (r.status === "allocated" || r.status === "checked_in") && !r.notifiedAt).length > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {rsvps.filter((r) => (r.status === "allocated" || r.status === "checked_in") && !r.notifiedAt).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      <EventStatsBar stats={stats} />

      {/* RSVP Table */}
      <RSVPTable
        rsvps={rsvps}
        onAllocate={handleAllocate}
        onDeallocate={handleDeallocate}
        deallocatingId={deallocatingId}
        onDeleteRsvp={isAdmin ? handleDeleteRsvp : undefined}
        deletingRsvpId={deletingRsvpId}
        assignmentMode={event?.assignmentMode}
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
            }
          }}
          event={event}
          rsvps={rsvps}
          selectingFor={seatSelectingRsvp}
          onSeatSelect={handleSeatSelect}
          assigning={seatAssigning}
          onReassign={handleReassign}
          onLayoutChange={isAdmin ? handleLayoutChange : undefined}
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
    </div>
  );
};

EventDetailPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Event Detail — AuraPixel RSVP">{page}</AdminLayout>
);

export default EventDetailPage;
