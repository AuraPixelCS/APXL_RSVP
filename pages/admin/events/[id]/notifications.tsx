import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import { getEvent, subscribeToRSVPs, updateEvent } from "@/lib/firestore";
import { buildSeatEmail, buildBlastEmail } from "@/lib/emailTemplates";
import { formatAssignment } from "@/lib/seatLabel";
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

// Placeholder QR (preview only — the real send uses the cid:qr_code PNG).
const PREVIEW_QR =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";

// ─── Notification Hero ───────────────────────────────────────────────────────

function NotificationHero({
  eventTitle, notifiedCount, unnotifiedCount, totalAllocated, notifiedPct,
  bulkNotifying, canBulk, onBulkNotify,
}: {
  eventTitle: string;
  notifiedCount: number;
  unnotifiedCount: number;
  totalAllocated: number;
  notifiedPct: number;
  bulkNotifying: boolean;
  canBulk: boolean;
  onBulkNotify: () => void;
}) {
  const RING_SIZE = 140;
  const STROKE = 12;
  const radius = (RING_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (notifiedPct / 100) * circumference;

  const allDone = totalAllocated > 0 && unnotifiedCount === 0;
  const accentColor = allDone ? "#22c55e" : "var(--accent)";
  const noGuests = totalAllocated === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-0">
        {/* Left: title + stats + CTA */}
        <div className="p-6 flex flex-col gap-4">
          <div>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase mb-3"
              style={{
                background: "rgba(61,155,245,0.08)",
                color: "var(--accent)",
                border: "1px solid rgba(61,155,245,0.25)",
                letterSpacing: "0.08em",
              }}
            >
              <BellIcon />
              Notifications
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">{eventTitle}</h1>
            <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
              {noGuests
                ? "Allocate seats before sending notifications."
                : allDone
                  ? `All ${totalAllocated} allocated guests have been notified.`
                  : `${unnotifiedCount} of ${totalAllocated} allocated guests still need to be notified.`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <HeroStat label="Notified" value={notifiedCount} color="#22c55e" />
            <HeroStat label="Unnotified" value={unnotifiedCount} color={unnotifiedCount > 0 ? "#f59e0b" : "var(--muted)"} />
            <HeroStat label="Allocated" value={totalAllocated} color="var(--accent)" />
          </div>

          <div className="flex flex-wrap gap-2 mt-1">
            <button
              onClick={onBulkNotify}
              disabled={!canBulk || bulkNotifying}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {bulkNotifying ? (
                <>
                  <span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.4)", borderTopColor: "transparent" }} />
                  Sending…
                </>
              ) : (
                <>
                  <BellIcon />
                  {unnotifiedCount > 0 ? `Notify ${unnotifiedCount} Unnotified` : "All Notified"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right: progress ring */}
        <div
          className="p-6 flex flex-col items-center justify-center gap-2"
          style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)", minWidth: 200 }}
        >
          <div style={{ position: "relative", width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: "rotate(-90deg)" }}>
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth={STROKE}
              />
              <motion.circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={radius}
                fill="none"
                stroke={accentColor}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: dashOffset }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: "none" }}>
              <p className="text-3xl font-bold text-white" style={{ fontFamily: "'Fira Code', monospace" }}>{notifiedPct}%</p>
              <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Notified</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HeroStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
        {label}
      </p>
      <p className="text-xl font-bold mt-1" style={{ color, fontFamily: "'Fira Code', monospace" }}>
        {value}
      </p>
    </div>
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
  const [activeTab, setActiveTab] = useState<"template" | "guests" | "blast">("guests");

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

  // Guest table filter + search
  const [guestFilter, setGuestFilter] = useState<"all" | "unnotified" | "notified">("unnotified");
  const [guestSearch, setGuestSearch] = useState("");

  // Email blast
  const [blastSubject, setBlastSubject]         = useState("");
  const [blastBody, setBlastBody]               = useState("");
  const [selectedBlastIds, setSelectedBlastIds] = useState<Set<string>>(new Set());
  const [blastSelInit, setBlastSelInit]         = useState(false);
  const [sendingBlast, setSendingBlast]         = useState(false);
  const [blastResult, setBlastResult]           = useState<{ sent: number; failed: number; total?: number; done?: boolean; firstError?: string } | null>(null);
  const [blastSearch, setBlastSearch]           = useState("");
  const [blastUnsentOnly, setBlastUnsentOnly]   = useState(false);

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
  const notifiedCount = allocatedRsvps.length - unnotifiedCount;
  const notifiedPct = allocatedRsvps.length > 0
    ? Math.round((notifiedCount / allocatedRsvps.length) * 100)
    : 0;

  // Filtered + searched guests for the table view
  const filteredGuests = (() => {
    const filtered = guestFilter === "all"
      ? allocatedRsvps
      : guestFilter === "notified"
        ? allocatedRsvps.filter((r) => !!r.notifiedAt)
        : allocatedRsvps.filter((r) => !r.notifiedAt);
    const q = guestSearch.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q)
    );
  })();
  const settingsDirty =
    bannerUrl !== savedBanner ||
    rsvpBannerUrl !== savedRsvpBanner ||
    showTitle !== savedShowTitle;

  // ── Email blast recipients ───────────────────────────────────────────────────
  // Everyone who RSVP'd and didn't decline — pending, allocated, or checked_in.
  const blastRecipients = rsvps.filter((r) => r.status !== "not_attending");
  const blastUnsentCount = blastRecipients.filter((r) => !r.blastSentAt).length;
  const filteredBlastRecipients = (() => {
    let list = blastUnsentOnly ? blastRecipients.filter((r) => !r.blastSentAt) : blastRecipients;
    const q = blastSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    }
    return list;
  })();

  // Default selection to "all recipients" once the RSVP list first loads.
  useEffect(() => {
    if (!blastSelInit && blastRecipients.length > 0) {
      setSelectedBlastIds(new Set(blastRecipients.map((r) => r.id!).filter(Boolean)));
      setBlastSelInit(true);
    }
  }, [blastRecipients, blastSelInit]);

  const allBlastSelected =
    filteredBlastRecipients.length > 0 &&
    filteredBlastRecipients.every((r) => selectedBlastIds.has(r.id!));

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

  const toggleBlastSelect = useCallback((rsvpId: string) => {
    setSelectedBlastIds((prev) => {
      const next = new Set(prev);
      if (next.has(rsvpId)) next.delete(rsvpId);
      else next.add(rsvpId);
      return next;
    });
  }, []);

  const toggleBlastSelectAll = useCallback(() => {
    setSelectedBlastIds((prev) => {
      const next = new Set(prev);
      const ids = filteredBlastRecipients.map((r) => r.id!).filter(Boolean);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, [filteredBlastRecipients]);

  const handleSendBlast = useCallback(async () => {
    if (!event?.id || sendingBlast) return;
    if (!blastSubject.trim() || !blastBody.trim() || selectedBlastIds.size === 0) return;
    setSendingBlast(true);

    // Send in small batches, one request each. A single request with ~200
    // recipients times the serverless function out (504); ~20 per request
    // finishes in a few seconds, well under any timeout, and lets us show
    // running progress + survive a single batch failing.
    const ids = [...selectedBlastIds];
    const CHUNK = 20;
    const total = ids.length;
    let sent = 0;
    let failed = 0;
    let firstError: string | undefined;
    setBlastResult({ sent: 0, failed: 0, total, done: false });

    try {
      const authHeaders = await getAuthHeaders();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/blast`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              eventId: event.id,
              subject: blastSubject,
              body: blastBody,
              rsvpIds: chunk,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            sent += data.sent ?? 0;
            failed += data.failed ?? 0;
            if (!firstError && data.firstError) firstError = data.firstError;
          } else {
            failed += chunk.length;
            if (!firstError) firstError = `Server error (${res.status})`;
          }
        } catch (e) {
          failed += chunk.length;
          if (!firstError) firstError = e instanceof Error ? e.message : "Request failed";
        }
        setBlastResult({ sent, failed, total, firstError, done: i + CHUNK >= ids.length });
      }
    } finally {
      setBlastResult((prev) => (prev ? { ...prev, done: true } : prev));
      setSendingBlast(false);
    }
  }, [event, sendingBlast, blastSubject, blastBody, selectedBlastIds]);

  // ── Email preview HTML ───────────────────────────────────────────────────────

  const isTableMode = event?.assignmentMode === "table";

  const previewHtml = event
    ? (() => {
        const isP = event.title.toLowerCase().includes("peoplelogy");
        return buildSeatEmail({
          name: "Preview Guest",
          eventTitle: event.title.replace(/\s+Event$/i, ""),
          eventDate: event.date,
          eventTime: event.time,
          venue: event.venue,
          seatNumber: 1,
          assignmentRows: formatAssignment(1, event)?.rows,
          qrDataUrl: PREVIEW_QR,
          dressCode: event.dressCode ?? (isP ? "Formal Elegance" : undefined),
          dietaryNote: isP
            ? "To help us better accommodate our guests, if you require a vegetarian meal, kindly reply to this email by Friday, 12 June 2026."
            : undefined,
          signOffName: isP ? "PEOPLElogy Berhad" : undefined,
          bannerUrl: bannerUrl || (isP ? "/EmailBanner.png" : undefined),
          showTitleOnBanner: showTitle,
        });
      })()
    : "";

  const blastPreviewHtml = event
    ? buildBlastEmail({
        name: "Preview Guest",
        eventTitle: event.title,
        body:
          blastBody.trim() ||
          "Your message will appear here. Use {{name}} for the guest's name and {{event}} for the event title.",
        eventDate: event.date,
        eventTime: event.time,
        venue: event.venue,
        address: event.address,
        bannerUrl:
          rsvpBannerUrl ||
          (event.title.toLowerCase().includes("peoplelogy") ? "/EmailBanner.png" : undefined),
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

      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
        style={{ color: "var(--muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
      >
        <ArrowLeftIcon />
        Back to event
      </button>

      {/* ── NotificationHero ───────────────────────────────────────────────── */}
      <NotificationHero
        eventTitle={event.title}
        notifiedCount={notifiedCount}
        unnotifiedCount={unnotifiedCount}
        totalAllocated={allocatedRsvps.length}
        notifiedPct={notifiedPct}
        bulkNotifying={bulkNotifying}
        canBulk={isAdmin && unnotifiedCount > 0}
        onBulkNotify={handleBulkNotify}
      />

      {/* ── Tab pills ─────────────────────────────────────────────────────── */}
      <div
        className="inline-flex rounded-xl p-1 gap-1"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {([
          { key: "guests",   label: `Allocated Guests${allocatedRsvps.length ? ` (${allocatedRsvps.length})` : ""}` },
          { key: "template", label: "Template" },
          { key: "blast",    label: "Email Blast" },
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
        {/* Filter + search toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="inline-flex items-center rounded-lg p-1 gap-1"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            role="tablist"
          >
            {([
              { key: "unnotified" as const, label: "Unnotified", count: unnotifiedCount, color: "#f59e0b" },
              { key: "all"        as const, label: "All",        count: allocatedRsvps.length, color: "var(--accent)" },
              { key: "notified"   as const, label: "Notified",   count: notifiedCount,    color: "#22c55e" },
            ]).map((f) => {
              const active = guestFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setGuestFilter(f.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150"
                  style={{
                    background: active ? f.color : "transparent",
                    color: active ? "#000" : "var(--muted)",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
                >
                  {f.label}
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
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative" style={{ minWidth: 220 }}>
            <span
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--muted)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-white"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>
        </div>

        {allocatedRsvps.length === 0 ? (
          <div className="px-6 py-12 text-center" style={{ background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No allocated guests yet. Allocate seats first before sending notifications.
            </p>
          </div>
        ) : filteredGuests.length === 0 ? (
          <div className="px-6 py-12 text-center" style={{ background: "var(--surface)" }}>
            <p className="text-sm text-white font-medium">
              {guestSearch
                ? `No guests match "${guestSearch}"`
                : guestFilter === "unnotified"
                  ? "Nothing to notify — all allocated guests have been reached."
                  : "No guests in this view."}
            </p>
            {guestSearch && (
              <button
                onClick={() => setGuestSearch("")}
                className="text-xs mt-2 cursor-pointer"
                style={{ color: "var(--accent)" }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ background: "var(--surface)" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["#", "Name", "Email", "Phone", isTableMode ? "Table" : "Seat", "Last Notified", "Action"].map((h) => (
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
                  {filteredGuests.map((rsvp, i) => (
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
                        {event
                          ? formatAssignment(rsvp.seatNumber, event)?.short ?? "—"
                          : "—"}
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

      {/* ── Section D: Email Blast tab ────────────────────────────────────── */}
      {activeTab === "blast" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Compose */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Email Blast
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Send a one-off announcement to your guests. No QR or seat info — just your message,
              with the RSVP-confirmation banner. Use <code>{"{{name}}"}</code> and <code>{"{{event}}"}</code> to personalize.
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              Subject
            </label>
            <input
              type="text"
              value={blastSubject}
              onChange={(e) => setBlastSubject(e.target.value)}
              placeholder={`An update about ${event.title}`}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
              Message
            </label>
            <textarea
              value={blastBody}
              onChange={(e) => setBlastBody(e.target.value)}
              rows={8}
              placeholder={`Hi {{name}},\n\nWe wanted to share an update about {{event}}...`}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
              style={{
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--border)",
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* Recipients */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
                Recipients
              </label>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {selectedBlastIds.size} of {blastRecipients.length} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={blastSearch}
                onChange={(e) => setBlastSearch(e.target.value)}
                placeholder="Search name or email…"
                className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={() => setBlastUnsentOnly((v) => !v)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
                title="Show only guests who haven't received a blast yet"
                style={{
                  background: blastUnsentOnly ? "rgba(61,155,245,0.12)" : "var(--surface-2)",
                  color: blastUnsentOnly ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${blastUnsentOnly ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
                }}
              >
                Unsent only ({blastUnsentCount})
              </button>
            </div>

            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              {/* Select all */}
              <button
                onClick={toggleBlastSelectAll}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium cursor-pointer transition-colors"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--foreground)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  className="flex items-center justify-center rounded"
                  style={{
                    width: 16,
                    height: 16,
                    border: `1px solid ${allBlastSelected ? "var(--accent)" : "var(--border)"}`,
                    background: allBlastSelected ? "var(--accent)" : "transparent",
                    color: "#000",
                    fontSize: 11,
                  }}
                >
                  {allBlastSelected ? "✓" : ""}
                </span>
                Select all{blastSearch.trim() ? " (filtered)" : ""} ({filteredBlastRecipients.length})
              </button>

              {/* Rows */}
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {filteredBlastRecipients.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--muted)" }}>
                    No matching guests.
                  </div>
                ) : (
                  filteredBlastRecipients.map((r) => {
                    const checked = selectedBlastIds.has(r.id!);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleBlastSelect(r.id!)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs cursor-pointer transition-colors text-left"
                        style={{ color: "var(--foreground)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span
                          className="flex items-center justify-center rounded shrink-0"
                          style={{
                            width: 16,
                            height: 16,
                            border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
                            background: checked ? "var(--accent)" : "transparent",
                            color: "#000",
                            fontSize: 11,
                          }}
                        >
                          {checked ? "✓" : ""}
                        </span>
                        <span className="truncate flex-1">
                          <span className="font-medium">{r.name}</span>
                          <span style={{ color: "var(--muted)" }}> · {r.email}</span>
                        </span>
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                          style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                        >
                          {r.status}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Result + send */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs min-w-0" style={{ color: "var(--muted)" }}>
              {blastResult && (
                <div className="flex flex-col gap-0.5">
                  <span style={{ color: blastResult.failed > 0 ? "#f59e0b" : "#22c55e" }}>
                    {blastResult.done ? "Sent" : "Sending…"} {blastResult.sent}
                    {blastResult.total ? ` of ${blastResult.total}` : ""}
                    {blastResult.failed > 0 ? ` · ${blastResult.failed} failed` : ""}
                  </span>
                  {blastResult.done && blastResult.failed > 0 && blastResult.firstError && (
                    <span className="truncate" style={{ color: "#ef4444", maxWidth: 260 }} title={blastResult.firstError}>
                      {blastResult.firstError}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleSendBlast}
              disabled={
                !isAdmin ||
                sendingBlast ||
                !blastSubject.trim() ||
                !blastBody.trim() ||
                selectedBlastIds.size === 0
              }
              className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              {sendingBlast
                ? `Sending… ${(blastResult?.sent ?? 0) + (blastResult?.failed ?? 0)}/${blastResult?.total ?? selectedBlastIds.size}`
                : `Send blast to ${selectedBlastIds.size} guest${selectedBlastIds.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div
          className="rounded-xl overflow-hidden self-start"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div
            className="px-4 py-2 text-xs font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--muted)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Live Preview &mdash; {"{{name}}"} shows as &ldquo;Preview Guest&rdquo;
          </div>
          <iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:24px;background:#f5f5f5;">${blastPreviewHtml}</body></html>`}
            style={{ width: "100%", height: 560, border: "none", display: "block", background: "#f5f5f5" }}
            title="Blast Preview"
          />
        </div>
      </div>
      )}

      {/* ── Floating sticky Bulk Notify ─────────────────────────────────────
           Appears on the Guests tab when there is still work to do and the
           current filter view actually exposes the workflow (i.e. not the
           Notified-only view). Reaches the same handler as the hero CTA. */}
      <AnimatePresence>
        {activeTab === "guests" && isAdmin && unnotifiedCount > 0 && guestFilter !== "notified" && (
          <motion.button
            key="sticky-bulk"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={handleBulkNotify}
            disabled={bulkNotifying}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "#000",
              boxShadow: "0 12px 32px rgba(61,155,245,0.35), 0 2px 6px rgba(0,0,0,0.4)",
            }}
            whileHover={{ y: -2 }}
          >
            {bulkNotifying ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.4)", borderTopColor: "transparent" }} />
                Sending…
              </>
            ) : (
              <>
                <BellIcon />
                Notify {unnotifiedCount} Unnotified
              </>
            )}
          </motion.button>
        )}
      </AnimatePresence>
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
