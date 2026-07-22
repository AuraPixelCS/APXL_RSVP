import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createEvent, updateEvent } from "@/lib/firestore";
import SeatingConfigurator from "@/components/ui/SeatingConfigurator";
import { useToast } from "@/contexts/ToastContext";
import { COMMON_TIMEZONES, DEFAULT_EVENT_TIMEZONE, timezoneShortLabel } from "@/lib/eventTime";
import type { Event, SeatingConfig } from "@/types";

// Create OR edit an event. When `event` is provided the form runs in edit mode:
// fields are prefilled and Save writes back via updateEvent. `allocatedCount`
// drives a warning when the seating layout is changed after seats are allocated.
export default function EventFormModal({
  event,
  allocatedCount = 0,
  onClose,
  onSaved,
}: {
  event?: Event;
  allocatedCount?: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const isEdit = !!event;
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: event?.title ?? "",
    date: event?.date ?? "",
    time: event?.time ?? "",
    venue: event?.venue ?? "",
    address: event?.address ?? "",
    description: event?.description ?? "",
    totalSeats: event?.totalSeats ?? 100,
    maxGuests: event?.maxGuests ?? 0,
    rsvpDeadline: event?.rsvpDeadline ?? "",
    // Existing events have no timezone; they were always meant to be Malaysian,
    // so the default preserves their behaviour rather than changing it.
    timezone: event?.timezone ?? DEFAULT_EVENT_TIMEZONE,
    isActive: event?.isActive ?? true,
  });
  const [seatingConfig, setSeatingConfig] = useState<SeatingConfig>(
    event?.seatingConfig ?? { style: "theater", seatsPerRow: 10 },
  );
  const [assignmentMode, setAssignmentMode] = useState<"seat" | "table">(event?.assignmentMode ?? "seat");

  const update = (field: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleNext = () => {
    if (!form.title.trim() || !form.date || !form.time || !form.venue.trim() || !form.totalSeats) {
      toast.warning("Missing required fields", "Fill in Title, Date, Time, Venue, and Total Seats.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (isEdit && event?.id) {
        // Send trimmed strings (incl. "") so cleared fields actually clear.
        await updateEvent(event.id, {
          title: form.title.trim(),
          date: form.date,
          time: form.time,
          venue: form.venue.trim(),
          address: form.address.trim(),
          description: form.description.trim(),
          totalSeats: form.totalSeats,
          maxGuests: form.maxGuests || 0,
          rsvpDeadline: form.rsvpDeadline,
          timezone: form.timezone,
          isActive: form.isActive,
          seatingConfig,
          assignmentMode,
        });
        toast.success("Event updated", "Changes are live.");
        onSaved(event.id);
      } else {
        const id = await createEvent({
          title: form.title,
          date: form.date,
          time: form.time,
          venue: form.venue,
          ...(form.address && { address: form.address }),
          ...(form.description && { description: form.description }),
          totalSeats: form.totalSeats,
          ...(form.maxGuests && { maxGuests: form.maxGuests }),
          ...(form.rsvpDeadline && { rsvpDeadline: form.rsvpDeadline }),
          timezone: form.timezone,
          isActive: form.isActive,
          coverImageUrl: null,
          seatingConfig,
          assignmentMode,
        });
        onSaved(id);
      }
    } catch (err) {
      toast.error(isEdit ? "Update failed" : "Create failed", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const seatingChanged =
    isEdit &&
    (form.totalSeats !== event?.totalSeats ||
      assignmentMode !== (event?.assignmentMode ?? "seat") ||
      JSON.stringify(seatingConfig) !== JSON.stringify(event?.seatingConfig ?? { style: "theater", seatsPerRow: 10 }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto transition-all duration-200"
        style={{ maxWidth: step === 2 ? 640 : 512, background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {step === 1 ? (isEdit ? "Edit Event" : "Create Event") : "Seating Layout"}
            </h2>
            <div className="flex items-center gap-3 mt-2">
              {([
                { s: 1, label: "Event Details" },
                { s: 2, label: "Seating" },
              ] as { s: 1 | 2; label: string }[]).map(({ s, label }, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <div className="w-5 h-px transition-colors duration-300"
                      style={{ background: step >= s ? "var(--accent)" : "var(--border)" }} />
                  )}
                  <div className="flex items-center gap-1">
                    <div className="rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        width: 16, height: 16, fontSize: 9, fontWeight: 700,
                        background: step >= s ? "var(--accent)" : "var(--surface-3)",
                        border: `1px solid ${step >= s ? "var(--accent)" : "var(--border)"}`,
                        color: step >= s ? "#000" : "var(--muted)",
                      }}>
                      {step > s ? (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : String(s)}
                    </div>
                    <span className="text-[10px] font-medium transition-colors duration-200"
                      style={{ color: step >= s ? "var(--foreground)" : "var(--muted)" }}>
                      {label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close modal"
            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "white"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step content */}
        <div className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {step === 1 ? (
              <motion.div key="step1"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
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

                <div>
                  <label htmlFor="event-timezone" className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
                    Event Timezone
                  </label>
                  <select
                    id="event-timezone"
                    value={form.timezone}
                    onChange={(e) => update("timezone", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                      outline: "none",
                    }}
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
                    The zone the time above is read in. Also decides when the RSVP deadline
                    actually closes — {form.rsvpDeadline
                      ? `end of ${form.rsvpDeadline} in ${timezoneShortLabel(form.timezone)}`
                      : `23:59 ${timezoneShortLabel(form.timezone)}`}.
                  </p>
                </div>

                {isEdit && (
                  <div className="flex items-center justify-between rounded-lg p-3 gap-4" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
                    <div>
                      <label className="text-xs font-medium block text-white">Accepting RSVPs</label>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                        Turn off to close the public RSVP form for this event.
                      </p>
                    </div>
                    <button type="button" role="switch" aria-checked={form.isActive} aria-label="Accepting RSVPs"
                      onClick={() => update("isActive", !form.isActive)}
                      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer"
                      style={{ background: form.isActive ? "var(--accent)" : "var(--border)" }}>
                      <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
                        style={{ transform: form.isActive ? "translateX(22px)" : "translateX(2px)" }} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleNext}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150"
                    style={{ background: "var(--accent)", color: "#000" }}>
                    Next →
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="step2"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="space-y-4">
                <SeatingConfigurator totalSeats={form.totalSeats} config={seatingConfig} onChange={setSeatingConfig} />

                <div style={{ marginTop: 4 }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
                    Assignment Type
                  </p>
                  <div className="flex gap-2">
                    {(["seat", "table"] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setAssignmentMode(mode)}
                        className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150"
                        style={{
                          background: assignmentMode === mode ? "var(--accent)" : "var(--surface-3)",
                          color: assignmentMode === mode ? "#000" : "var(--muted)",
                          border: `1.5px solid ${assignmentMode === mode ? "var(--accent)" : "var(--border)"}`,
                        }}>
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

                {isEdit && seatingChanged && allocatedCount > 0 && (
                  <div className="rounded-lg p-3 text-xs leading-relaxed"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                    <strong>Heads up:</strong> {allocatedCount} guest{allocatedCount === 1 ? " has" : "s have"} already been
                    allocated a {assignmentMode === "table" ? "table" : "seat"}. Changing the layout or seat count can leave
                    existing assignments pointing at seats that no longer exist — review the seat map after saving.
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                    ← Back
                  </button>
                  <button type="button" onClick={handleSubmit} disabled={saving}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50"
                    style={{ background: "var(--accent)", color: "#000" }}>
                    {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save Changes" : "Create Event"}
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
  label, value, onChange, type = "text", required = false, textarea = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; textarea?: boolean;
}) {
  const inputStyles = { background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" };
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} required={required} rows={3}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150 resize-none"
          style={inputStyles}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
          style={inputStyles}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
      )}
    </div>
  );
}
