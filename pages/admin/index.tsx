import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EventCard from "@/components/ui/EventCard";
import EmptyState from "@/components/ui/EmptyState";
import { getEvents } from "@/lib/firestore";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Event } from "@/types";

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

const AdminHome: NextPageWithLayout = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const { role } = useAuthContext();
  const isAdmin = role === "admin";

  useEffect(() => {
    getEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (newId: string) => {
    setShowForm(false);
    router.push(`/admin/events/${newId}`);
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
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
          onCreated={handleCreated}
        />
      )}

      {/* Events grid */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map((event, i) => (
            <EventCard key={event.id} event={event} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

AdminHome.getLayout = (page: ReactElement) => (
  <AdminLayout title="Events — AuraPixel RSVP">{page}</AdminLayout>
);

export default AdminHome;

// ─── Inline Event Form Modal ────────────────────────────────────────────────

import { createEvent } from "@/lib/firestore";
import SeatingConfigurator from "@/components/ui/SeatingConfigurator";
import type { SeatingConfig } from "@/types";

function EventFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "",
    venue: "",
    address: "",
    description: "",
    totalSeats: 100,
    maxGuests: 0,
    rsvpDeadline: "",
    isActive: true,
  });
  const [seatingConfig, setSeatingConfig] = useState<SeatingConfig>({
    style: "theater",
    seatsPerRow: 10,
  });
  const [assignmentMode, setAssignmentMode] = useState<"seat" | "table">("seat");

  const update = (field: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleNext = () => {
    // Basic client-side validation before advancing
    if (!form.title.trim() || !form.date || !form.time || !form.venue.trim() || !form.totalSeats) {
      alert("Please fill in all required fields (Title, Date, Time, Venue, Total Seats).");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const id = await createEvent({
        title: form.title,
        date: form.date,
        time: form.time,
        venue: form.venue,
        ...(form.address     && { address: form.address }),
        ...(form.description && { description: form.description }),
        totalSeats: form.totalSeats,
        ...(form.maxGuests   && { maxGuests: form.maxGuests }),
        ...(form.rsvpDeadline && { rsvpDeadline: form.rsvpDeadline }),
        isActive: form.isActive,
        coverImageUrl: null,
        seatingConfig,
        assignmentMode,
      });
      onCreated(id);
    } catch (err: any) {
      console.error(err);
      alert("Error: " + (err.message || "Failed to create event"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto transition-all duration-200"
        style={{
          maxWidth: step === 2 ? 640 : 512,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {step === 1 ? "Create Event" : "Seating Layout"}
            </h2>
            {/* Step indicator with labels */}
            <div className="flex items-center gap-3 mt-2">
              {([
                { s: 1, label: "Event Details" },
                { s: 2, label: "Seating" },
              ] as { s: 1 | 2; label: string }[]).map(({ s, label }, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <div
                      className="w-5 h-px transition-colors duration-300"
                      style={{ background: step >= s ? "var(--accent)" : "var(--border)" }}
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <div
                      className="rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        width: 16,
                        height: 16,
                        fontSize: 9,
                        fontWeight: 700,
                        background: step >= s ? "var(--accent)" : "var(--surface-3)",
                        border: `1px solid ${step >= s ? "var(--accent)" : "var(--border)"}`,
                        color: step >= s ? "#000" : "var(--muted)",
                      }}
                    >
                      {step > s ? (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : String(s)}
                    </div>
                    <span
                      className="text-[10px] font-medium transition-colors duration-200"
                      style={{ color: step >= s ? "var(--foreground)" : "var(--muted)" }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step content — animated slide */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <FormField label="Event Title *" value={form.title} onChange={(v) => update("title", v)} required />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date *" type="date" value={form.date} onChange={(v) => update("date", v)} required />
              <FormField label="Time *" type="time" value={form.time} onChange={(v) => update("time", v)} required />
            </div>
            <FormField label="Venue *" value={form.venue} onChange={(v) => update("venue", v)} required />
            <FormField label="Address" value={form.address} onChange={(v) => update("address", v)} />
            <FormField label="Description" value={form.description} onChange={(v) => update("description", v)} textarea />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Total Seats *" type="number" value={String(form.totalSeats)} onChange={(v) => update("totalSeats", parseInt(v) || 0)} required />
              <FormField label="RSVP Deadline" type="date" value={form.rsvpDeadline} onChange={(v) => update("rsvpDeadline", v)} />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                Next →
              </button>
            </div>
          </motion.div>
            ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <SeatingConfigurator
              totalSeats={form.totalSeats}
              config={seatingConfig}
              onChange={setSeatingConfig}
            />

            {/* Assignment type toggle */}
            <div style={{ marginTop: 4 }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                Assignment Type
              </p>
              <div className="flex gap-2">
                {(["seat", "table"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAssignmentMode(mode)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150"
                    style={{
                      background: assignmentMode === mode ? "var(--accent)" : "var(--surface-3)",
                      color: assignmentMode === mode ? "#000" : "var(--muted)",
                      border: `1.5px solid ${assignmentMode === mode ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {mode === "seat" ? "Seat Numbers" : "Table Numbers"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: "var(--muted)" }}>
                {assignmentMode === "seat"
                  ? "Guests receive individual seat numbers in their confirmation."
                  : "Guests receive table numbers — best used with Banquet layout."}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {saving ? "Creating…" : "Create Event"}
              </button>
            </div>
          </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const inputStyles = {
    background: "var(--surface-3)",
    border: "1px solid var(--border)",
    outline: "none",
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150 resize-none"
          style={inputStyles}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
          style={inputStyles}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      )}
    </div>
  );
}
