import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import { getEvent, subscribeToRSVPs, updateEvent } from "@/lib/firestore";
import { buildSeatEmail } from "@/lib/emailTemplates";
import type { Event, RSVP } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuthContext } from "@/contexts/AuthContext";
import { getAuthHeaders } from "@/lib/auth";

// ─── Icons ───────────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
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

// ─── Placeholder QR (for email preview only) ─────────────────────────────────

const PREVIEW_QR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";

// ─── Status chip ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    allocated:    { bg: "rgba(61,155,245,0.12)",  color: "#3d9bf5", label: "Allocated" },
    checked_in:   { bg: "rgba(34,197,94,0.12)",   color: "#22c55e", label: "Checked In" },
    pending:      { bg: "rgba(251,191,36,0.12)",   color: "#fbbf24", label: "Pending" },
    not_attending:{ bg: "rgba(239,68,68,0.12)",    color: "#ef4444", label: "Not Attending" },
  };
  const s = map[status] ?? { bg: "var(--surface-2)", color: "var(--muted)", label: status };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NotificationsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { role } = useAuthContext();
  const isAdmin = role === "admin";
  const { id } = router.query as { id: string };

  const [event, setEvent]           = useState<Event | null>(null);
  const [rsvps, setRsvps]           = useState<RSVP[]>([]);
  const [loading, setLoading]       = useState(true);

  // Tab
  const [activeTab, setActiveTab] = useState<"template" | "guests">("guests");

  // Banners
  const [bannerUrl, setBannerUrl]                       = useState("");
  const [savedBanner, setSavedBanner]                   = useState("");
  const [rsvpBannerUrl, setRsvpBannerUrl]               = useState("");
  const [savedRsvpBanner, setSavedRsvpBanner]           = useState("");
  const [showTitle, setShowTitle]                       = useState(false);
  const [savedShowTitle, setSavedShowTitle]             = useState(false);
  const [entryBannerUploading, setEntryBannerUploading] = useState(false);
  const [rsvpBannerUploading, setRsvpBannerUploading]   = useState(false);
  const [savingSettings, setSavingSettings]             = useState(false);
  const [showPreview, setShowPreview]                   = useState(false);
  const entryBannerInputRef = useRef<HTMLInputElement>(null);
  const rsvpBannerInputRef  = useRef<HTMLInputElement>(null);

  // Notify state
  const [notifyingId, setNotifyingId]     = useState<string | null>(null);
  const [bulkNotifying, setBulkNotifying] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    getEvent(id).then((ev) => {
      setEvent(ev);
      const banner     = ev?.customEmailBanner       ?? "";
      const rsvpBanner = ev?.customRsvpConfirmBanner ?? "";
      const showT      = !!ev?.showEventTitleOnBanner;
      setBannerUrl(banner);         setSavedBanner(banner);
      setRsvpBannerUrl(rsvpBanner); setSavedRsvpBanner(rsvpBanner);
      setShowTitle(showT);          setSavedShowTitle(showT);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRSVPs(id, setRsvps);
    return () => unsub();
  }, [id]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const allocatedRsvps = rsvps.filter(
    (r) => r.status === "allocated" || r.status === "checked_in"
  );
  const unnotifiedCount = allocatedRsvps.filter((r) => !r.notifiedAt).length;
  const settingsDirty =
    bannerUrl !== savedBanner ||
    rsvpBannerUrl !== savedRsvpBanner ||
    showTitle !== savedShowTitle;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const uploadBanner = useCallback(
    async (file: File, kind: "entry" | "rsvp") => {
      if (!event?.id) return;
      const setUploading = kind === "entry" ? setEntryBannerUploading : setRsvpBannerUploading;
      const setUrl       = kind === "entry" ? setBannerUrl            : setRsvpBannerUrl;
      const filename     = kind === "entry" ? "email-banner"          : "rsvp-confirm-banner";
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const fileRef = storageRef(storage, `events/${event.id}/${filename}.${ext}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        setUrl(url);
      } catch (e) {
        console.error("Banner upload failed:", e);
        alert("Banner upload failed: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        setUploading(false);
      }
    },
    [event],
  );

  const handleSaveSettings = useCallback(async () => {
    if (!event?.id || !settingsDirty || savingSettings) return;
    setSavingSettings(true);
    try {
      await updateEvent(event.id, {
        customEmailBanner:       bannerUrl,
        customRsvpConfirmBanner: rsvpBannerUrl,
        showEventTitleOnBanner:  showTitle,
      });
      setSavedBanner(bannerUrl);
      setSavedRsvpBanner(rsvpBannerUrl);
      setSavedShowTitle(showTitle);
    } finally {
      setSavingSettings(false);
    }
  }, [event, bannerUrl, rsvpBannerUrl, showTitle, settingsDirty, savingSettings]);

  const handleNotifyOne = useCallback(async (rsvpId: string) => {
    if (!event?.id) return;
    setNotifyingId(rsvpId);
    try {
      const authHeaders = await getAuthHeaders();
      await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, rsvpId }),
      });
    } finally {
      setNotifyingId(null);
    }
  }, [event]);

  const handleBulkNotify = useCallback(async () => {
    if (!event?.id || bulkNotifying) return;
    setBulkNotifying(true);
    try {
      const authHeaders = await getAuthHeaders();
      await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, bulk: true }),
      });
    } finally {
      setBulkNotifying(false);
    }
  }, [event, bulkNotifying]);

  // ── Email preview HTML ───────────────────────────────────────────────────────

  const isTableMode = event?.assignmentMode === "table";
  const seatsPerTable = event?.seatingConfig?.seatsPerTable ?? 10;

  const previewHtml = event
    ? buildSeatEmail({
        name: "Preview Guest",
        eventTitle: event.title,
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        address: event.address,
        seatNumber: 1,
        tableNumber: isTableMode ? 1 : undefined,
        qrDataUrl: PREVIEW_QR,
        bannerUrl: bannerUrl || (event.title.toLowerCase().includes("peoplelogy") ? "/EmailBanner.png" : undefined),
        showTitleOnBanner: showTitle,
      })
    : "";

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: "var(--accent)" }}
        />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center" style={{ color: "var(--muted)" }}>
        Event not found.
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Section A: Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs mb-3 cursor-pointer transition-colors"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeftIcon />
            Back to event
          </button>
          <h1 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
            Notifications
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {event.title}
            {allocatedRsvps.length > 0 && (
              <span className="ml-2">
                &mdash; {unnotifiedCount > 0
                  ? `${unnotifiedCount} of ${allocatedRsvps.length} not yet notified`
                  : `all ${allocatedRsvps.length} notified`}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={handleBulkNotify}
          disabled={!isAdmin || bulkNotifying || unnotifiedCount === 0}
          title={!isAdmin ? "Admin only" : undefined}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "var(--accent)",
            color: "#000",
          }}
        >
          <BellIcon />
          {bulkNotifying ? "Sending…" : `Bulk Notify${unnotifiedCount > 0 ? ` (${unnotifiedCount})` : ""}`}
        </button>
      </div>

      {/* ── Tab pills ─────────────────────────────────────────────────────── */}
      <div
        className="inline-flex rounded-xl p-1 gap-1"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {([
          { key: "guests",   label: `Allocated Guests${allocatedRsvps.length ? ` (${allocatedRsvps.length})` : ""}` },
          { key: "template", label: "Template" },
        ] as const).map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#000" : "var(--muted)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Section B: Template tab ───────────────────────────────────────── */}
      {activeTab === "template" && (
      <div
        className="rounded-xl p-5 space-y-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Editor header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Email Banners
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Upload a header banner for each event email. The body and footer copy are shared across all events.
            </p>
          </div>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
            style={{
              background: showPreview ? "rgba(61,155,245,0.12)" : "var(--surface-2)",
              color: showPreview ? "var(--accent)" : "var(--muted)",
              border: `1px solid ${showPreview ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
            }}
          >
            <EyeIcon />
            {showPreview ? "Hide Preview" : "Preview Entry Pass"}
          </button>
        </div>

        {/* ── Entry Pass Banner ── */}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              Entry Pass Email Banner
            </label>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Recommended: <strong>600 × 200 px</strong>, PNG or JPG. Replaces the dark header on the seat/table confirmation email.
            </p>
          </div>

          {bannerUrl ? (
            <div className="flex items-start gap-3">
              <img
                src={bannerUrl}
                alt="Entry Pass banner preview"
                className="rounded-lg object-cover"
                style={{ width: 180, height: 60, border: "1px solid var(--border)" }}
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => entryBannerInputRef.current?.click()}
                  disabled={entryBannerUploading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                >
                  {entryBannerUploading ? "Uploading…" : "Change"}
                </button>
                <button
                  onClick={() => setBannerUrl("")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => entryBannerInputRef.current?.click()}
              disabled={entryBannerUploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
              style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px dashed var(--border)" }}
            >
              {entryBannerUploading ? "Uploading…" : "↑  Upload Banner"}
            </button>
          )}

          <input
            ref={entryBannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBanner(file, "entry");
              e.target.value = "";
            }}
          />
        </div>

        {/* ── RSVP Confirmation Banner ── */}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              RSVP Confirmation Email Banner
            </label>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Recommended: <strong>600 × 200 px</strong>. Shown at the top of the email guests receive immediately after submitting their RSVP.
            </p>
          </div>

          {rsvpBannerUrl ? (
            <div className="flex items-start gap-3">
              <img
                src={rsvpBannerUrl}
                alt="RSVP Confirmation banner preview"
                className="rounded-lg object-cover"
                style={{ width: 180, height: 60, border: "1px solid var(--border)" }}
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => rsvpBannerInputRef.current?.click()}
                  disabled={rsvpBannerUploading}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                >
                  {rsvpBannerUploading ? "Uploading…" : "Change"}
                </button>
                <button
                  onClick={() => setRsvpBannerUrl("")}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => rsvpBannerInputRef.current?.click()}
              disabled={rsvpBannerUploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40"
              style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px dashed var(--border)" }}
            >
              {rsvpBannerUploading ? "Uploading…" : "↑  Upload Banner"}
            </button>
          )}

          <input
            ref={rsvpBannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBanner(file, "rsvp");
              e.target.value = "";
            }}
          />
        </div>

        {/* ── Show Title On Banner Toggle ── */}
        <div
          className="flex items-center justify-between rounded-lg p-3"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <div className="pr-4">
            <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              Show event title under banner
            </label>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              When on, the event title appears in a thin dark strip beneath the banner image. Turn off for a clean banner-only look. Applies to both emails.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showTitle}
            onClick={() => setShowTitle((v) => !v)}
            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer"
            style={{ background: showTitle ? "var(--accent)" : "var(--border)" }}
          >
            <span
              className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: showTitle ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        {/* Save row */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {settingsDirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            onClick={handleSaveSettings}
            disabled={!settingsDirty || savingSettings}
            className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: settingsDirty ? "var(--accent)" : "var(--surface-2)",
              color: settingsDirty ? "#000" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {savingSettings ? "Saving…" : "Save Email Settings"}
          </button>
        </div>

        {/* Preview pane */}
        <AnimatePresence>
          {showPreview && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <div
                className="rounded-lg overflow-hidden mt-2"
                style={{ border: "1px solid var(--border)" }}
              >
                <div
                  className="px-4 py-2 text-xs font-medium"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  Email Preview &mdash; QR code is a placeholder
                </div>
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:24px;background:#f5f5f5;">${previewHtml}</body></html>`}
                  style={{ width: "100%", height: 600, border: "none", display: "block", background: "#f5f5f5" }}
                  title="Email Preview"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      )}

      {/* ── Section C: Allocated Guests tab ──────────────────────────────── */}
      {activeTab === "guests" && (
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        {/* Table header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Allocated Guests
            <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
              {allocatedRsvps.length} guests
            </span>
          </h2>
        </div>

        {allocatedRsvps.length === 0 ? (
          <div className="px-6 py-12 text-center" style={{ background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No allocated guests yet. Allocate seats first before sending notifications.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "var(--surface)" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["#", "Name", "Email", "Phone", isTableMode ? "Table" : "Seat", "Status", "Last Notified", "Action"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium whitespace-nowrap"
                      style={{ color: "var(--muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {allocatedRsvps.map((rsvp, i) => (
                    <motion.tr
                      key={rsvp.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ borderBottom: "1px solid var(--border)" }}
                      className="transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)", fontFamily: "monospace" }}>
                        {i + 1}
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "var(--foreground)" }}>
                        {rsvp.name}
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: "var(--muted)" }}>
                        {rsvp.email}
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--muted)", fontFamily: "monospace" }}>
                        {rsvp.phone}
                      </td>
                      {/* Seat / Table */}
                      <td className="px-4 py-3 text-xs font-bold whitespace-nowrap" style={{ color: "var(--accent)" }}>
                        {rsvp.seatNumber != null
                          ? isTableMode
                            ? `T${Math.ceil(rsvp.seatNumber / seatsPerTable)}`
                            : `#${rsvp.seatNumber}`
                          : "—"}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusChip status={rsvp.status} />
                      </td>
                      {/* Last Notified */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {rsvp.notifiedAt ? (
                          <span style={{ color: "rgba(34,197,94,0.9)" }}>
                            {formatNotifiedAt(rsvp.notifiedAt)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3">
                        {rsvp.notifiedAt ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{
                                background: "var(--surface-2)",
                                color: "var(--muted)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              Notified
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => handleNotifyOne(rsvp.id!)}
                                disabled={notifyingId === rsvp.id}
                                title="Send again"
                                className="flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-all duration-150 disabled:opacity-40"
                                style={{
                                  background: "var(--surface-2)",
                                  color: "var(--muted)",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                <RefreshIcon />
                              </button>
                            )}
                          </div>
                        ) : isAdmin ? (
                          <button
                            onClick={() => handleNotifyOne(rsvp.id!)}
                            disabled={notifyingId === rsvp.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-50"
                            style={{
                              background: "rgba(61,155,245,0.1)",
                              color: "var(--accent)",
                              border: "1px solid rgba(61,155,245,0.25)",
                            }}
                          >
                            {notifyingId === rsvp.id ? (
                              <>
                                <span
                                  className="w-3 h-3 rounded-full border border-transparent animate-spin"
                                  style={{ borderTopColor: "var(--accent)" }}
                                />
                                Notifying…
                              </>
                            ) : (
                              <>
                                <BellIcon />
                                Notify
                              </>
                            )}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNotifiedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
           ", " +
           d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso;
  }
}

// ─── Layout ───────────────────────────────────────────────────────────────────

NotificationsPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Notifications — AuraPixel RSVP">{page}</AdminLayout>
);

export default NotificationsPage;
