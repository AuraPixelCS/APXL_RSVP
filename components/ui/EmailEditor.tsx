import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateEvent } from "@/lib/firestore";
import {
  buildSeatEmail,
  buildRsvpConfirmEmail,
  buildThankYouEmail,
} from "@/lib/emailTemplates";
import { formatAssignment } from "@/lib/seatLabel";
import { useToast } from "@/contexts/ToastContext";
import type { Event, EmailCta } from "@/types";

// Placeholder QR (preview only — the real send embeds the cid:qr_code PNG).
const PREVIEW_QR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";

type TemplateKey = "pass" | "confirm" | "thankyou";

const TEMPLATES: { key: TemplateKey; label: string; blurb: string }[] = [
  { key: "pass", label: "Entry Pass (QR)", blurb: "Sent before the event — the guest's QR pass, seat, and details." },
  { key: "confirm", label: "RSVP Confirmation", blurb: "Sent automatically the moment a guest submits their RSVP." },
  { key: "thankyou", label: "Thank-You", blurb: "Sent after the event — gratitude and follow-up links. No QR or seat." },
];

// The shape the editor edits — a subset of Event.
interface EmailForm {
  entryPassSubject: string;
  customEmailTitle: string;
  customEmailBody: string;
  dressCode: string;
  signOffName: string;
  agendaImageUrl: string;
  customEmailBanner: string;
  rsvpConfirmSubject: string;
  customRsvpConfirmBanner: string;
  thankYouSubject: string;
  thankYouOrgName: string;
  thankYouCtas: EmailCta[];
  showEventTitleOnBanner: boolean;
}

function toForm(ev: Event): EmailForm {
  return {
    entryPassSubject: ev.entryPassSubject ?? "",
    customEmailTitle: ev.customEmailTitle ?? "",
    customEmailBody: ev.customEmailBody ?? "",
    dressCode: ev.dressCode ?? "",
    signOffName: ev.signOffName ?? "",
    agendaImageUrl: ev.agendaImageUrl ?? "",
    customEmailBanner: ev.customEmailBanner ?? "",
    rsvpConfirmSubject: ev.rsvpConfirmSubject ?? "",
    customRsvpConfirmBanner: ev.customRsvpConfirmBanner ?? "",
    thankYouSubject: ev.thankYouSubject ?? "",
    thankYouOrgName: ev.thankYouOrgName ?? "",
    thankYouCtas: Array.isArray(ev.thankYouCtas) ? ev.thankYouCtas.map((c) => ({ ...c })) : [],
    showEventTitleOnBanner: !!ev.showEventTitleOnBanner,
  };
}

export default function EmailEditor({
  event,
  onSaved,
}: {
  event: Event;
  onSaved?: (patch: Partial<Event>) => void;
}) {
  const toast = useToast();
  const [active, setActive] = useState<TemplateKey>("pass");
  const [form, setForm] = useState<EmailForm>(() => toForm(event));
  const [saved, setSaved] = useState<EmailForm>(() => toForm(event));
  const [saving, setSaving] = useState(false);
  const [entryUploading, setEntryUploading] = useState(false);
  const [rsvpUploading, setRsvpUploading] = useState(false);
  const entryInputRef = useRef<HTMLInputElement>(null);
  const rsvpInputRef = useRef<HTMLInputElement>(null);

  const displayTitle = event.title.replace(/\s+Event$/i, "");
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  const set = useCallback(<K extends keyof EmailForm>(key: K, value: EmailForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Banner upload (Firebase Storage) ────────────────────────────────────────
  const uploadBanner = useCallback(
    async (file: File, kind: "entry" | "rsvp") => {
      if (!event.id) return;
      const setUploading = kind === "entry" ? setEntryUploading : setRsvpUploading;
      const key: keyof EmailForm = kind === "entry" ? "customEmailBanner" : "customRsvpConfirmBanner";
      const filename = kind === "entry" ? "email-banner" : "rsvp-confirm-banner";
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const fileRef = storageRef(storage, `events/${event.id}/${filename}.${ext}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        set(key, url);
      } catch (e) {
        toast.error("Banner upload failed", e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [event.id, set, toast],
  );

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!event.id || !dirty || saving) return;
    setSaving(true);
    // Persist trimmed strings (incl. "") so clearing a field actually clears its
    // effect — undefined would be stripped and leave the old value in place.
    const patch: Partial<Event> = {
      entryPassSubject: form.entryPassSubject.trim(),
      customEmailTitle: form.customEmailTitle.trim(),
      customEmailBody: form.customEmailBody.trim(),
      dressCode: form.dressCode.trim(),
      signOffName: form.signOffName.trim(),
      agendaImageUrl: form.agendaImageUrl.trim(),
      customEmailBanner: form.customEmailBanner.trim(),
      rsvpConfirmSubject: form.rsvpConfirmSubject.trim(),
      customRsvpConfirmBanner: form.customRsvpConfirmBanner.trim(),
      thankYouSubject: form.thankYouSubject.trim(),
      thankYouOrgName: form.thankYouOrgName.trim(),
      thankYouCtas: form.thankYouCtas
        .map((c) => ({ label: c.label.trim(), url: c.url.trim(), blurb: (c.blurb ?? "").trim() }))
        .filter((c) => c.label && c.url),
      showEventTitleOnBanner: form.showEventTitleOnBanner,
    };
    try {
      await updateEvent(event.id, patch);
      setSaved(form);
      onSaved?.(patch);
      toast.success("Email settings saved", "New sends will use the updated copy.");
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [event.id, dirty, saving, form, onSaved, toast]);

  // ── Live preview HTML for the active template ────────────────────────────────
  const previewHtml = useMemo(() => {
    if (active === "confirm") {
      return buildRsvpConfirmEmail({
        name: "Preview Guest",
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        address: event.address,
        bannerUrl: form.customRsvpConfirmBanner || undefined,
        showTitleOnBanner: form.showEventTitleOnBanner,
      });
    }
    if (active === "thankyou") {
      return buildThankYouEmail({
        name: "Preview Guest",
        eventTitle: displayTitle,
        bannerUrl: form.customEmailBanner || undefined,
        orgName: form.thankYouOrgName || displayTitle,
        ctas: form.thankYouCtas.filter((c) => c.label.trim() && c.url.trim()),
      });
    }
    return buildSeatEmail({
      name: "Preview Guest",
      eventTitle: displayTitle,
      eventDate: event.date,
      eventTime: event.time,
      venue: event.venue,
      address: event.address,
      seatNumber: 1,
      assignmentRows: formatAssignment(1, event)?.rows,
      qrDataUrl: PREVIEW_QR,
      dressCode: form.dressCode || undefined,
      agendaImageUrl: form.agendaImageUrl || undefined,
      signOffName: form.signOffName || undefined,
      bannerUrl: form.customEmailBanner || undefined,
      headerTitle: form.customEmailTitle || undefined,
      showTitleOnBanner: form.showEventTitleOnBanner,
      customBody: form.customEmailBody || undefined,
      passUrl: "#",
    });
  }, [active, event, displayTitle, form]);

  // Effective subject shown above the preview (form value or computed default).
  const previewSubject = useMemo(() => {
    if (active === "confirm") return form.rsvpConfirmSubject.trim() || `RSVP Confirmation – ${event.title}`;
    if (active === "thankyou") return form.thankYouSubject.trim() || `Thank You for Joining ${displayTitle}`;
    return form.entryPassSubject.trim() || `Your Entry Pass — Seat #1 | ${displayTitle}`;
  }, [active, form, event.title, displayTitle]);

  const activeMeta = TEMPLATES.find((t) => t.key === active)!;

  return (
    <div className="space-y-4">
      {/* Header + template segmented control */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Email Editor
          </h2>
          <p className="text-xs mt-0.5 max-w-md" style={{ color: "var(--muted)" }}>
            Everything here is saved on this event — a new event starts with sensible defaults and
            needs no code change. Use <code>{"{{name}}"}</code> and <code>{"{{event}}"}</code> in body copy.
          </p>
        </div>
        <div className="inline-flex rounded-lg p-1 gap-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          {TEMPLATES.map((t) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150"
                style={{ background: on ? "var(--accent)" : "transparent", color: on ? "#000" : "var(--muted)" }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>{activeMeta.blurb}</p>

      {/* Two-pane: compose (left) + live preview (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Compose */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl p-4 space-y-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {active === "pass" && (
            <>
              <TextField label="Subject line" hint={`Default: “Your Entry Pass — Seat #1 | ${displayTitle}”`}
                value={form.entryPassSubject} placeholder={`Your Entry Pass — Seat #1 | ${displayTitle}`}
                onChange={(v) => set("entryPassSubject", v)} />
              <TextField label="Header title" hint="Bold title in the dark strip. Defaults to the event title."
                value={form.customEmailTitle} placeholder={displayTitle}
                onChange={(v) => set("customEmailTitle", v)} />
              <TextAreaField label="Body message" hint="The opening paragraph above the QR. Supports {{name}} and {{event}}."
                value={form.customEmailBody} rows={4}
                placeholder={"The wait is almost over! We look forward to welcoming you to {{event}}."}
                onChange={(v) => set("customEmailBody", v)} />
              <TextField label="Attire / dress code" hint="Adds an “Attire” row to the details box. Leave blank to hide."
                value={form.dressCode} placeholder="e.g. Formal Elegance"
                onChange={(v) => set("dressCode", v)} />
              <TextField label="Programme agenda image URL" hint="Hosted image shown after the details. Leave blank to hide."
                value={form.agendaImageUrl} placeholder="https://…/agenda.png"
                onChange={(v) => set("agendaImageUrl", v)} />
              <TextField label="Sign-off name" hint="Bold name above the footer. Leave blank for the default closing line."
                value={form.signOffName} placeholder="e.g. The AuraPixel Team"
                onChange={(v) => set("signOffName", v)} />
              <BannerField label="Header banner" hint="Recommended 600 × 200 px. Also used on the thank-you email."
                url={form.customEmailBanner} uploading={entryUploading}
                onPick={() => entryInputRef.current?.click()} onClear={() => set("customEmailBanner", "")} inputRef={entryInputRef}
                onFile={(f) => uploadBanner(f, "entry")} />
              <ToggleField label="Show event title under banner" hint="Adds a dark strip with the event title beneath the banner image. Applies to all emails."
                checked={form.showEventTitleOnBanner} onChange={(v) => set("showEventTitleOnBanner", v)} />
            </>
          )}

          {active === "confirm" && (
            <>
              <TextField label="Subject line" hint={`Default: “RSVP Confirmation – ${event.title}”`}
                value={form.rsvpConfirmSubject} placeholder={`RSVP Confirmation – ${event.title}`}
                onChange={(v) => set("rsvpConfirmSubject", v)} />
              <BannerField label="Header banner" hint="Recommended 600 × 200 px. Shown at the top of the confirmation email."
                url={form.customRsvpConfirmBanner} uploading={rsvpUploading}
                onPick={() => rsvpInputRef.current?.click()} onClear={() => set("customRsvpConfirmBanner", "")} inputRef={rsvpInputRef}
                onFile={(f) => uploadBanner(f, "rsvp")} />
              <ToggleField label="Show event title under banner" hint="Applies to all emails."
                checked={form.showEventTitleOnBanner} onChange={(v) => set("showEventTitleOnBanner", v)} />
              <p className="text-xs rounded-lg p-3" style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                The confirmation body (thank-you note, event details, calendar button) is generated from
                the event's own date, time, and venue — no copy to maintain here.
              </p>
            </>
          )}

          {active === "thankyou" && (
            <>
              <TextField label="Subject line" hint={`Default: “Thank You for Joining ${displayTitle}”`}
                value={form.thankYouSubject} placeholder={`Thank You for Joining ${displayTitle}`}
                onChange={(v) => set("thankYouSubject", v)} />
              <TextField label="Organiser name" hint="Used in the greeting and sign-off. Defaults to the event title."
                value={form.thankYouOrgName} placeholder={displayTitle}
                onChange={(v) => set("thankYouOrgName", v)} />
              <CtaEditor ctas={form.thankYouCtas} onChange={(next) => set("thankYouCtas", next)} />
              <p className="text-xs rounded-lg p-3" style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                The thank-you reuses the entry-pass header banner. The gratitude paragraph is standard —
                add your own follow-up links as buttons above.
              </p>
            </>
          )}
        </motion.div>

        {/* Live preview */}
        <div className="rounded-xl overflow-hidden lg:sticky lg:top-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Subject</p>
            <p className="text-xs font-medium truncate" style={{ color: "var(--foreground)" }} title={previewSubject}>{previewSubject}</p>
          </div>
          <iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="margin:0;padding:20px;background:#f1f1f1;">${previewHtml}</body></html>`}
            style={{ width: "100%", height: 560, border: "none", display: "block", background: "#f1f1f1" }}
            title="Email preview"
          />
          <div className="px-4 py-2 text-[11px]" style={{ background: "var(--surface)", color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
            Live preview · QR is a placeholder · rendered as “Preview Guest”
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={entryInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBanner(f, "entry"); e.target.value = ""; }} />
      <input ref={rsvpInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBanner(f, "rsvp"); e.target.value = ""; }} />

      {/* Save bar */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <span className="text-xs" style={{ color: dirty ? "#f59e0b" : "var(--muted)" }}>
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button onClick={() => setForm(saved)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
              style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}>
              Discard
            </button>
          )}
          <button onClick={handleSave} disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: dirty ? "var(--accent)" : "var(--surface)", color: dirty ? "#000" : "var(--muted)", border: "1px solid var(--border)" }}>
            {saving ? "Saving…" : "Save email settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field primitives ─────────────────────────────────────────────────────────

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium block" style={{ color: "var(--foreground)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px]" style={{ color: "var(--muted)" }}>{hint}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  outline: "none",
};

function TextField({ label, hint, value, placeholder, onChange }: {
  label: string; hint?: string; value: string; placeholder?: string; onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
    </FieldShell>
  );
}

function TextAreaField({ label, hint, value, rows, placeholder, onChange }: {
  label: string; hint?: string; value: string; rows: number; placeholder?: string; onChange: (v: string) => void;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm resize-y" style={{ ...inputStyle, lineHeight: 1.6 }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")} />
    </FieldShell>
  );
}

function ToggleField({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg p-3 gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div>
        <label className="text-xs font-medium block" style={{ color: "var(--foreground)" }}>{label}</label>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}>
        <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

function BannerField({ label, hint, url, uploading, onPick, onClear }: {
  label: string; hint?: string; url: string; uploading: boolean;
  onPick: () => void; onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File) => void;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      {url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Banner preview" className="rounded-lg object-cover"
            style={{ width: 180, height: 60, border: "1px solid var(--border)" }} />
          <div className="flex flex-col gap-1.5">
            <button onClick={onPick} disabled={uploading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
              style={{ background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)" }}>
              {uploading ? "Uploading…" : "Change"}
            </button>
            <button onClick={onClear}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
              style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button onClick={onPick} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
          style={{ background: "var(--surface)", color: "var(--muted)", border: "1px dashed var(--border)" }}>
          {uploading ? "Uploading…" : "↑  Upload banner"}
        </button>
      )}
    </FieldShell>
  );
}

// ─── Thank-you CTA list editor ────────────────────────────────────────────────

function CtaEditor({ ctas, onChange }: { ctas: EmailCta[]; onChange: (next: EmailCta[]) => void }) {
  const update = (i: number, patch: Partial<EmailCta>) =>
    onChange(ctas.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(ctas.filter((_, idx) => idx !== i));
  const add = () => onChange([...ctas, { label: "", url: "", blurb: "" }]);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium block" style={{ color: "var(--foreground)" }}>Call-to-action buttons</label>
      {ctas.length === 0 && (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>No buttons yet. Add a photo gallery link, a survey, or a follow-up offer.</p>
      )}
      {ctas.map((cta, i) => (
        <div key={i} className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Button {i + 1}</span>
            <button onClick={() => remove(i)} aria-label={`Remove button ${i + 1}`}
              className="text-xs cursor-pointer" style={{ color: "#ef4444" }}>Remove</button>
          </div>
          <input type="text" value={cta.label} placeholder="Button label (e.g. View Event Photos)"
            onChange={(e) => update(i, { label: e.target.value })}
            className="w-full rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
          <input type="text" value={cta.url} placeholder="https://…"
            onChange={(e) => update(i, { url: e.target.value })}
            className="w-full rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
          <textarea value={cta.blurb ?? ""} rows={2} placeholder="Short description above the button (optional)"
            onChange={(e) => update(i, { blurb: e.target.value })}
            className="w-full rounded-md px-2.5 py-1.5 text-xs resize-y" style={{ ...inputStyle, lineHeight: 1.5 }} />
        </div>
      ))}
      <button onClick={add}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
        style={{ background: "rgba(61,155,245,0.1)", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.25)" }}>
        + Add button
      </button>
    </div>
  );
}
