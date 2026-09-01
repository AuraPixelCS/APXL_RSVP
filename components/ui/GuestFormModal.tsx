import { useState } from "react";
import { motion } from "framer-motion";
import { createRSVP, updateRSVP } from "@/lib/firestore";
import { useToast } from "@/contexts/ToastContext";
import type { Event, RSVP } from "@/types";

// Add a guest by hand, or edit an existing one — replaces the add-missing-guests
// / update-guest-email CLI scripts. In edit mode, seat/QR/status are left alone
// (those belong to the allocation flow); only profile fields change.
//
// Field order mirrors the partner's November registration forms (name, email,
// phone, company, job title, industry) — the anniversary-era extras (group,
// plus-one, dietary) live in a collapsed section so they stay reachable for
// legacy events without leading the layout.
export default function GuestFormModal({
  event,
  guest,
  existingEmails,
  onClose,
  onSaved,
}: {
  event: Event;
  guest?: RSVP;
  /** Lowercased emails already on this event, for the duplicate guard. */
  existingEmails: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!guest;
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // Open the extras when any of them already carries a value.
  const [showMore, setShowMore] = useState(
    !!(guest?.partOf || guest?.dietaryRestrictions || guest?.message || guest?.plusOne || guest?.attending === false),
  );
  const [form, setForm] = useState({
    name: guest?.name ?? "",
    email: guest?.email ?? "",
    phone: guest?.phone ?? "",
    company: guest?.company ?? "",
    jobTitle: guest?.jobTitle ?? "",
    industry: guest?.industry ?? "",
    partOf: guest?.partOf ?? "",
    attending: guest?.attending ?? true,
    plusOne: guest?.plusOne ?? false,
    plusOneName: guest?.plusOneName ?? "",
    dietaryRestrictions: guest?.dietaryRestrictions ?? "",
    message: guest?.message ?? "",
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    // Phone is optional — the partner's delegate form doesn't always have one,
    // so an admin correcting such a guest must not be forced to invent it.
    if (!name || !email) {
      toast.warning("Missing required fields", "Name and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.warning("Invalid email", "Enter a valid email address.");
      return;
    }
    // Duplicate guard — ignore the guest's own current email when editing.
    const emailChanged = !isEdit || email !== (guest?.email ?? "").toLowerCase();
    if (emailChanged && existingEmails.has(email)) {
      toast.warning("Duplicate email", "Another guest on this event already uses that email.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && guest?.id && event.id) {
        // Only profile fields — seat/QR/status stay with the allocation flow.
        await updateRSVP(event.id, guest.id, {
          name,
          email,
          phone,
          company: form.company.trim(),
          jobTitle: form.jobTitle.trim(),
          industry: form.industry.trim(),
          partOf: form.partOf.trim(),
          attending: form.attending,
          plusOne: form.plusOne,
          plusOneName: form.plusOne ? form.plusOneName.trim() : "",
          dietaryRestrictions: form.dietaryRestrictions.trim(),
          message: form.message.trim(),
        });
        toast.success("Guest updated", name);
      } else if (event.id) {
        // Build without undefined fields — createRSVP writes the object as-is.
        await createRSVP(event.id, {
          name,
          email,
          phone,
          attending: form.attending,
          plusOne: form.plusOne,
          status: form.attending ? "pending" : "not_attending",
          seatNumber: null,
          qrToken: null,
          qrIssuedAt: null,
          whatsappConfirmSent: false,
          whatsappQRSent: false,
          notifiedAt: null,
          ...(form.plusOne && form.plusOneName.trim() ? { plusOneName: form.plusOneName.trim() } : {}),
          ...(form.company.trim() ? { company: form.company.trim() } : {}),
          ...(form.jobTitle.trim() ? { jobTitle: form.jobTitle.trim() } : {}),
          ...(form.industry.trim() ? { industry: form.industry.trim() } : {}),
          ...(form.partOf.trim() ? { partOf: form.partOf.trim() } : {}),
          ...(form.dietaryRestrictions.trim() ? { dietaryRestrictions: form.dietaryRestrictions.trim() } : {}),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
        });
        toast.success("Guest added", `${name} · status Pending`);
      }
      onSaved();
    } catch (e) {
      toast.error(isEdit ? "Update failed" : "Add failed", e instanceof Error ? e.message : String(e));
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
        className="w-full rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: 520, background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{isEdit ? "Edit Guest" : "Add Guest"}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {isEdit ? "Fix details for this guest. Seat and QR are unaffected." : `Manually add a guest to ${event.title}.`}
            </p>
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

        <Field label="Full Name *" value={form.name} onChange={(v) => set("name", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email *" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+60…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company / Organisation" value={form.company} onChange={(v) => set("company", v)} />
          <Field label="Job Title" value={form.jobTitle} onChange={(v) => set("jobTitle", v)} />
        </div>
        <Field label="Industry" value={form.industry} onChange={(v) => set("industry", v)} />

        {isEdit && (guest?.ticketType || guest?.externalRef || (guest?.days && guest.days.length)) && (
          <div className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Registration</p>
            <p className="text-xs text-white">
              {[
                guest?.ticketType ? `Ticket ${guest.ticketType}` : null,
                guest?.externalRef ? `Ref ${guest.externalRef}` : null,
                guest?.days?.length ? `Days ${guest.days.map((d) => d.slice(8)).join(", ")} Nov` : null,
                guest?.consent === true ? "Consent given" : guest?.consent === false ? "No consent" : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full text-left text-xs cursor-pointer py-1 transition-colors"
          style={{ color: "var(--muted)", background: "none", border: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
        >
          {showMore ? "▾ Hide extra fields" : "▸ More fields (group, plus one, dietary, notes)"}
        </button>

        {showMore && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Part Of / Group" value={form.partOf} onChange={(v) => set("partOf", v)} />
              <Toggle label="Attending" checked={form.attending} onChange={(v) => set("attending", v)} />
            </div>
            <Toggle label="Plus One" checked={form.plusOne} onChange={(v) => set("plusOne", v)} />
            {form.plusOne && (
              <Field label="Plus One Name" value={form.plusOneName} onChange={(v) => set("plusOneName", v)} />
            )}
            <Field label="Dietary Restrictions" value={form.dietaryRestrictions} onChange={(v) => set("dietaryRestrictions", v)} textarea />
            <Field label="Notes / Message" value={form.message} onChange={(v) => set("message", v)} textarea />
          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
            style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#000" }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Guest"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", textarea = false, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; textarea?: boolean; placeholder?: string;
}) {
  const s = { background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" } as const;
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder={placeholder}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150 resize-none" style={s}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150" style={s}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")} />
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
      <span className="text-xs font-medium text-white">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}>
        <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}
