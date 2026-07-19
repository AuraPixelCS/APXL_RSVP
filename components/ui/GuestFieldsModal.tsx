import { useState } from "react";
import { updateEvent } from "@/lib/firestore";
import { useToast } from "@/contexts/ToastContext";
import { DEFAULT_GUEST_CATEGORIES, DEFAULT_INDUSTRIES } from "@/lib/guestFields";
import type { Event } from "@/types";

// Edit the per-event option lists that drive the public RSVP form's category +
// industry dropdowns. Prefilled with the event's own lists, or the built-in
// defaults when none are set yet.
export default function GuestFieldsModal({
  event,
  onClose,
  onSaved,
}: {
  event: Event;
  onClose: () => void;
  onSaved: (patch: Partial<Event>) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>(
    event.guestCategories && event.guestCategories.length ? event.guestCategories : DEFAULT_GUEST_CATEGORIES,
  );
  const [industries, setIndustries] = useState<string[]>(
    event.industries && event.industries.length ? event.industries : DEFAULT_INDUSTRIES,
  );

  const handleSave = async () => {
    if (!event.id) return;
    setSaving(true);
    const patch: Partial<Event> = { guestCategories: categories, industries };
    try {
      await updateEvent(event.id, patch);
      toast.success("Registration form updated", "The public form now uses these options.");
      onSaved(patch);
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : String(e));
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
        className="w-full rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: 560, background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Registration Form</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Options shown to guests on the public RSVP form for this event.
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

        <ListEditor
          title="Guest categories"
          hint="“I am part of this event as a…” dropdown."
          items={categories}
          onChange={setCategories}
          onReset={() => setCategories(DEFAULT_GUEST_CATEGORIES)}
          placeholder="e.g. Sponsor, VIP, Media…"
        />

        <ListEditor
          title="Industries"
          hint="“Industry” dropdown."
          items={industries}
          onChange={setIndustries}
          onReset={() => setIndustries(DEFAULT_INDUSTRIES)}
          placeholder="e.g. Manufacturing, Non-profit…"
        />

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
            style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#000" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListEditor({
  title, hint, items, onChange, onReset, placeholder,
}: {
  title: string; hint: string; items: string[];
  onChange: (next: string[]) => void; onReset: () => void; placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) { setDraft(""); return; }
    onChange([...items, v]);
    setDraft("");
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-white">{title}</h3>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>{hint}</p>
        </div>
        <button onClick={onReset} className="text-[11px] cursor-pointer" style={{ color: "var(--accent)" }}>
          Reset to defaults
        </button>
      </div>

      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>No options — guests will see an empty dropdown; add at least one.</p>
        )}
        {items.map((item, i) => (
          <div key={`${item}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
            <span className="flex-1 text-xs text-white truncate">{item}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
              className="text-xs cursor-pointer disabled:opacity-30" style={{ color: "var(--muted)" }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"
              className="text-xs cursor-pointer disabled:opacity-30" style={{ color: "var(--muted)" }}>↓</button>
            <button onClick={() => remove(i)} aria-label={`Remove ${item}`}
              className="flex items-center justify-center cursor-pointer" style={{ color: "#ef4444", width: 18, height: 18 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="text" value={draft} placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1 rounded-lg px-3 py-2 text-xs text-white"
          style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        />
        <button onClick={add}
          className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
          style={{ background: "rgba(61,155,245,0.1)", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.25)" }}>
          + Add
        </button>
      </div>
    </div>
  );
}
