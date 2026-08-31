import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EmailEditor from "@/components/ui/EmailEditor";
import { getEvent, subscribeToRSVPs } from "@/lib/firestore";
import { buildBlastEmail } from "@/lib/emailTemplates";
import { formatAssignment } from "@/lib/seatLabel";
import { DELIVERY_LABEL, isDeliveryFailure } from "@/lib/emailDelivery";
import { formatEventDayRange } from "@/lib/eventDays";
import type { Event, RSVP } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
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

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MailCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="m16 19 2 2 4-4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────────

/** Segmented control shared by the template picker and the guest filter. */
function Segmented<T extends string>({
  value, onChange, options, ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string; count?: number; color?: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-lg p-1 gap-0.5"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {options.map((o) => {
        const active = value === o.key;
        const tint = o.color ?? "var(--accent)";
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1"
            style={{
              background: active ? tint : "transparent",
              color: active ? "#000" : "var(--muted)",
              outlineColor: "var(--accent)",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span
                className="inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5"
                style={{
                  background: active ? "rgba(0,0,0,0.18)" : "var(--surface-3)",
                  color: active ? "#000" : "var(--muted)",
                  minWidth: 18, height: 16, fontFamily: "'Fira Code', monospace",
                }}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Kpi({
  label, value, hint, color, icon,
}: {
  label: string; value: number; hint: string; color: string; icon: ReactElement;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl px-4 py-3.5 min-w-0"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.12em" }}>{label}</p>
        <p className="text-2xl font-bold mt-1 leading-none" style={{ color, fontFamily: "'Fira Code', monospace" }}>{value}</p>
        <p className="text-[11px] mt-1.5 truncate" style={{ color: "var(--muted-2)" }}>{hint}</p>
      </div>
      <span
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: "var(--surface-2)", color, border: "1px solid var(--border)" }}
      >
        {icon}
      </span>
    </div>
  );
}

function ProgressBar({ pct, notified, total, allDone }: { pct: number; notified: number; total: number; allDone: boolean }) {
  const tint = allDone ? "var(--success)" : "var(--accent)";
  return (
    <div
      className="flex items-center gap-4 rounded-xl px-4 py-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Guests notified"
    >
      <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "var(--muted)", letterSpacing: "0.12em" }}>Progress</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: tint }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
        <span className="font-bold" style={{ color: "var(--foreground)", fontFamily: "'Fira Code', monospace" }}>{pct}%</span>
        {" "}· {notified} of {total} notified
      </span>
    </div>
  );
}

function DeliveryChip({ status }: { status: RSVP["emailStatus"] }) {
  if (!status) return <span className="text-xs" style={{ color: "var(--muted-2)" }}>—</span>;
  const failed = isDeliveryFailure(status);
  const good = status === "delivered" || status === "opened" || status === "clicked";
  const color = failed ? "var(--danger)" : good ? "var(--success)" : "var(--muted)";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{ color, background: "var(--surface-2)", border: "1px solid var(--border)" }}
      title={failed ? "This guest did not receive the email" : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {DELIVERY_LABEL[status]}
    </span>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactElement }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-3" style={{ background: "var(--surface)" }}>
      <span className="flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}>
        <InboxIcon />
      </span>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs max-w-md leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
      {action}
    </div>
  );
}

const BTN_PRIMARY = "inline-flex items-center gap-2 h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2";
const BTN_GHOST = "inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2";


// ─── Page ─────────────────────────────────────────────────────────────────────

const NotificationsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { role } = useAuthContext();
  const toast = useToast();
  const isAdmin = role === "admin";
  const { id } = router.query as { id: string };

  const [event, setEvent]           = useState<Event | null>(null);
  const [rsvps, setRsvps]           = useState<RSVP[]>([]);
  const [loading, setLoading]       = useState(true);

  // Tab
  const [activeTab, setActiveTab] = useState<"template" | "guests" | "blast">("guests");

  // Notify state
  const [notifyingId, setNotifyingId]     = useState<string | null>(null);
  const [bulkNotifying, setBulkNotifying] = useState(false);
  // Which email the Notify actions send: the QR entry pass (default) or the thank-you.
  const [notifyTemplate, setNotifyTemplate] = useState<"pass" | "thankyou">("pass");

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

  const handleNotifyOne = useCallback(async (rsvpId: string) => {
    if (!event?.id) return;
    setNotifyingId(rsvpId);
    const label = notifyTemplate === "pass" ? "Entry pass" : "Thank-you email";
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, rsvpId, template: notifyTemplate }),
      });
      if (res.ok) toast.success(`${label} sent`);
      else toast.error(`${label} failed`, `Server responded ${res.status}.`);
    } catch (e) {
      toast.error(`${label} failed`, e instanceof Error ? e.message : "Request failed");
    } finally {
      setNotifyingId(null);
    }
  }, [event, notifyTemplate, toast]);

  const handleBulkNotify = useCallback(async (all = false) => {
    if (!event?.id || bulkNotifying) return;
    const emailLabel = notifyTemplate === "pass" ? "entry-pass (QR) email" : "thank-you email";
    // Re-sending to everyone (incl. already-notified) is a big, irreversible
    // blast — confirm first.
    if (all) {
      const count = allocatedRsvps.length;
      const ok = await toast.confirm({
        title: `Re-send to all ${count} guests?`,
        message: `The ${emailLabel} will be sent to every allocated guest — including the ${notifiedCount} already notified. This emails everyone again with the latest template.`,
        confirmLabel: `Send to ${count}`,
        tone: "danger",
      });
      if (!ok) return;
    }
    setBulkNotifying(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ eventId: event.id, bulk: true, all, template: notifyTemplate }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const sent = data?.notified ?? 0;
        const failed = data?.failed ?? 0;
        if (failed > 0) toast.warning(`Sent ${sent}, ${failed} failed`, "Some emails didn't go through — try again.");
        else if (sent > 0) toast.success(`Notified ${sent} guest${sent === 1 ? "" : "s"}`);
        else toast.info("Nothing to send", "Everyone in this view is already notified.");
      } else {
        toast.error("Bulk notify failed", `Server responded ${res.status}.`);
      }
    } catch (e) {
      toast.error("Bulk notify failed", e instanceof Error ? e.message : "Request failed");
    } finally {
      setBulkNotifying(false);
    }
  }, [event, bulkNotifying, allocatedRsvps.length, notifiedCount, notifyTemplate, toast]);

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
  const isFree = event?.assignmentMode === "free";
  const deliveryIssues = allocatedRsvps.filter((r) => isDeliveryFailure(r.emailStatus)).length;
  const dateLabel = event ? formatEventDayRange(event) : "";

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
        bannerUrl: event.customRsvpConfirmBanner || undefined,
        showTitleOnBanner: !!event.showEventTitleOnBanner,
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

  const guestNoun = isFree ? "pass holder" : "allocated guest";
  const guestNounPlural = isFree ? "pass holders" : "allocated guests";
  const noGuests = allocatedRsvps.length === 0;
  const allDone = !noGuests && unnotifiedCount === 0;
  const statusLine = noGuests
    ? (isFree
        ? "Free seating — every registration gets its QR pass the moment it lands. Registrations will appear here."
        : "Allocate seats first — the QR pass is minted at allocation.")
    : allDone
      ? `All ${allocatedRsvps.length} ${guestNounPlural} have been notified.`
      : `${unnotifiedCount} of ${allocatedRsvps.length} ${guestNounPlural} still need the ${notifyTemplate === "pass" ? "entry pass" : "thank-you email"}.`;

  return (
    <div className="flex flex-col gap-5" style={{ minHeight: "calc(100vh - var(--header-height) - 48px)" }}>

      {/* ── Header: identity left, actions right ─────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => router.push(`/admin/events/${event.id}`)}
            className="inline-flex items-center gap-1.5 text-xs cursor-pointer transition-colors duration-150"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            <ArrowLeftIcon />
            Back to event
          </button>
          <div className="flex flex-wrap items-center gap-2.5 mt-2">
            <h1 className="text-2xl font-bold text-white tracking-tight leading-none">{event.title}</h1>
            <span
              className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[10px] font-semibold uppercase"
              style={{ background: "rgba(61,155,245,0.08)", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.25)", letterSpacing: "0.08em" }}
            >
              <BellIcon />
              Notifications
            </span>
            <span
              className="inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-semibold uppercase"
              style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)", letterSpacing: "0.08em" }}
            >
              {isFree ? "Free seating" : isTableMode ? "Table seating" : "Seated"}
            </span>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {dateLabel}{event.venue ? ` · ${event.venue}` : ""} · {statusLine}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="Email to send"
            value={notifyTemplate}
            onChange={setNotifyTemplate}
            options={[
              { key: "pass", label: "Entry Pass (QR)" },
              { key: "thankyou", label: "Thank-You" },
            ]}
          />
          <button
            onClick={() => handleBulkNotify(false)}
            disabled={!isAdmin || unnotifiedCount === 0 || bulkNotifying}
            className={BTN_PRIMARY}
            style={{ background: "var(--accent)", color: "#000", outlineColor: "var(--accent)" }}
          >
            {bulkNotifying ? (
              <>
                <span className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,0.35)", borderTopColor: "transparent" }} />
                Sending…
              </>
            ) : (
              <>
                <SendIcon />
                {unnotifiedCount > 0 ? `Notify ${unnotifiedCount} unnotified` : "Nothing to notify"}
              </>
            )}
          </button>
          <button
            onClick={() => handleBulkNotify(true)}
            disabled={!isAdmin || noGuests || bulkNotifying}
            title={`Re-send the selected email to all ${allocatedRsvps.length} ${guestNounPlural}, including those already notified`}
            className={BTN_GHOST}
            style={{ background: "transparent", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.4)", outlineColor: "var(--accent)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(61,155,245,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <RefreshIcon />
            Re-send to all {allocatedRsvps.length}
          </button>
        </div>
      </div>

      {/* ── KPI strip + progress ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi
          label={isFree ? "Pass holders" : "Allocated"}
          value={allocatedRsvps.length}
          hint={isFree ? "QR issued at registration" : "Seated guests holding a QR pass"}
          color="var(--accent)"
          icon={<UsersIcon />}
        />
        <Kpi label="Notified" value={notifiedCount} hint="Handed to the mail provider" color="var(--success)" icon={<MailCheckIcon />} />
        <Kpi
          label="Unnotified"
          value={unnotifiedCount}
          hint={unnotifiedCount > 0 ? "Waiting for their email" : "Everyone has been reached"}
          color={unnotifiedCount > 0 ? "var(--warning)" : "var(--muted)"}
          icon={<ClockIcon />}
        />
        <Kpi
          label="Delivery issues"
          value={deliveryIssues}
          hint={deliveryIssues > 0 ? "Bounced or marked as spam — fix the address" : "No bounces or spam reports"}
          color={deliveryIssues > 0 ? "var(--danger)" : "var(--muted)"}
          icon={<AlertIcon />}
        />
      </div>
      <ProgressBar pct={notifiedPct} notified={notifiedCount} total={allocatedRsvps.length} allDone={allDone} />

      {/* ── Workspace tabs ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1" role="tablist" aria-label="Notification workspace" style={{ borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "guests",   label: isFree ? "Pass Holders" : "Allocated Guests", count: allocatedRsvps.length },
          { key: "blast",    label: "Email Blast", count: undefined },
          { key: "template", label: "Template", count: undefined },
        ] as const).map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.key)}
              className="relative flex items-center gap-2 h-10 px-4 text-xs font-semibold cursor-pointer transition-colors duration-150 -mb-px"
              style={{
                color: active ? "var(--foreground)" : "var(--muted)",
                borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5"
                  style={{ background: active ? "var(--accent-subtle)" : "var(--surface-2)", color: active ? "var(--accent)" : "var(--muted)", minWidth: 18, height: 16, fontFamily: "'Fira Code', monospace" }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Template tab ─────────────────────────────────────────────────── */}
      {activeTab === "template" && (
        <div className="flex-1">
          <EmailEditor
            event={event}
            onSaved={(patch) => setEvent((prev) => (prev ? { ...prev, ...patch } : prev))}
          />
        </div>
      )}

      {/* ── Guests tab ───────────────────────────────────────────────────── */}
      {activeTab === "guests" && (
        <div className="flex-1 flex flex-col rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                ariaLabel="Filter guests"
                value={guestFilter}
                onChange={setGuestFilter}
                options={[
                  { key: "unnotified", label: "Unnotified", count: unnotifiedCount, color: "var(--warning)" },
                  { key: "all",        label: "All",        count: allocatedRsvps.length },
                  { key: "notified",   label: "Notified",   count: notifiedCount, color: "var(--success)" },
                ]}
              />
              <span className="text-xs" style={{ color: "var(--muted-2)" }}>
                {filteredGuests.length} shown
              </span>
            </div>

            <label className="relative block" style={{ width: 300, maxWidth: "100%" }}>
              <span className="sr-only">Search guests</span>
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>
                <SearchIcon />
              </span>
              <input
                type="search"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search name, email, phone…"
                className="w-full h-8 pl-8 pr-3 rounded-lg text-xs text-white"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </label>
          </div>

          {noGuests ? (
            <EmptyState
              title={isFree ? "No registrations yet" : "No allocated guests yet"}
              body={isFree
                ? "Each registration gets its QR pass automatically. Use this page to re-send a pass or send the thank-you email once people have registered."
                : "Allocate seats on the event page first — the QR pass is minted at allocation, and guests show up here once they hold one."}
              action={!isFree ? (
                <button
                  onClick={() => router.push(`/admin/events/${event.id}`)}
                  className={BTN_GHOST}
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", outlineColor: "var(--accent)" }}
                >
                  <ArrowLeftIcon /> Go to seat allocation
                </button>
              ) : undefined}
            />
          ) : filteredGuests.length === 0 ? (
            <EmptyState
              title={guestSearch ? `No guests match “${guestSearch}”` : guestFilter === "unnotified" ? "Nothing to notify" : "No guests in this view"}
              body={guestSearch ? "Try a different name, email or phone number." : guestFilter === "unnotified" ? `Every ${guestNoun} has been reached. Switch to “All” to re-send individually.` : "Change the filter to see more guests."}
              action={guestSearch ? (
                <button onClick={() => setGuestSearch("")} className="text-xs cursor-pointer font-medium" style={{ color: "var(--accent)" }}>Clear search</button>
              ) : undefined}
            />
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                    {[
                      { h: "#", cls: "w-12" },
                      { h: "Guest", cls: "" },
                      { h: "Email", cls: "" },
                      { h: "Phone", cls: "" },
                      { h: isFree ? "Ticket" : isTableMode ? "Table" : "Seat", cls: "" },
                      { h: "Delivery", cls: "" },
                      { h: "Last notified", cls: "" },
                      { h: "", cls: "text-right" },
                    ].map((c, i) => (
                      <th
                        key={i}
                        className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase whitespace-nowrap ${c.cls}`}
                        style={{ color: "var(--muted)", letterSpacing: "0.1em" }}
                      >
                        {c.h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filteredGuests.map((rsvp, i) => (
                      <motion.tr
                        key={rsvp.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-2)", fontFamily: "'Fira Code', monospace" }}>{i + 1}</td>
                        <td className="px-4 py-3 min-w-[180px]">
                          <p className="font-medium text-white leading-tight">{rsvp.name}</p>
                          {rsvp.company && <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--muted)", maxWidth: 240 }}>{rsvp.company}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                          <span className="block truncate" style={{ maxWidth: 260 }}>{rsvp.email}</span>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--muted)", fontFamily: "'Fira Code', monospace" }}>{rsvp.phone || "—"}</td>
                        <td className="px-4 py-3 text-xs font-bold whitespace-nowrap" style={{ color: "var(--accent)" }}>
                          {isFree ? (rsvp.ticketType ?? "Free") : (formatAssignment(rsvp.seatNumber, event)?.short ?? "—")}
                        </td>
                        <td className="px-4 py-3"><DeliveryChip status={rsvp.emailStatus} /></td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: rsvp.notifiedAt ? "var(--success)" : "var(--muted-2)", fontFamily: "'Fira Code', monospace" }}>
                          {rsvp.notifiedAt ? formatNotifiedAt(rsvp.notifiedAt) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {isAdmin ? (
                            <button
                              onClick={() => handleNotifyOne(rsvp.id!)}
                              disabled={notifyingId === rsvp.id}
                              title={rsvp.notifiedAt ? "Send again" : "Send now"}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                              style={rsvp.notifiedAt
                                ? { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }
                                : { background: "var(--accent-subtle)", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.25)" }}
                              onMouseEnter={(e) => { if (rsvp.notifiedAt) e.currentTarget.style.color = "#fff"; }}
                              onMouseLeave={(e) => { if (rsvp.notifiedAt) e.currentTarget.style.color = "var(--muted)"; }}
                            >
                              {notifyingId === rsvp.id ? (
                                <>
                                  <span className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "currentColor" }} />
                                  Sending…
                                </>
                              ) : rsvp.notifiedAt ? (
                                <><RefreshIcon /> Re-send</>
                              ) : (
                                <><SendIcon /> Notify</>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--muted-2)" }}>—</span>
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

      {/* ── Email Blast tab ──────────────────────────────────────────────── */}
      {activeTab === "blast" && (
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-stretch">

        {/* Compose */}
        <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <h2 className="text-sm font-semibold text-white">Email Blast</h2>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>
              A one-off announcement to everyone who RSVP&rsquo;d — no QR, no seat details.
              Use <code style={{ color: "var(--accent)" }}>{"{{name}}"}</code> and <code style={{ color: "var(--accent)" }}>{"{{event}}"}</code> to personalise.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="blast-subject" className="text-xs font-medium text-white">Subject</label>
            <input
              id="blast-subject"
              type="text"
              value={blastSubject}
              onChange={(e) => setBlastSubject(e.target.value)}
              placeholder={`An update about ${event.title}`}
              className="w-full h-9 rounded-lg px-3 text-sm outline-none"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          <div className="space-y-1.5 flex-1 flex flex-col">
            <label htmlFor="blast-body" className="text-xs font-medium text-white">Message</label>
            <textarea
              id="blast-body"
              value={blastBody}
              onChange={(e) => setBlastBody(e.target.value)}
              rows={7}
              placeholder={`Hi {{name}},\n\nWe wanted to share an update about {{event}}...`}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y flex-1"
              style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)", lineHeight: 1.6, minHeight: 140 }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white">Recipients</span>
              <span className="text-xs" style={{ color: "var(--muted)", fontFamily: "'Fira Code', monospace" }}>
                {selectedBlastIds.size} / {blastRecipients.length} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search recipients</span>
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}><SearchIcon /></span>
                <input
                  type="search"
                  value={blastSearch}
                  onChange={(e) => setBlastSearch(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full h-8 pl-8 pr-3 rounded-lg text-xs outline-none"
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </label>
              <button
                onClick={() => setBlastUnsentOnly((v) => !v)}
                aria-pressed={blastUnsentOnly}
                className="shrink-0 h-8 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-150"
                title="Show only guests who haven't received a blast yet"
                style={{
                  background: blastUnsentOnly ? "var(--accent-subtle)" : "var(--surface-2)",
                  color: blastUnsentOnly ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${blastUnsentOnly ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
                }}
              >
                Unsent only ({blastUnsentCount})
              </button>
            </div>

            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <button
                onClick={toggleBlastSelectAll}
                className="flex items-center gap-2.5 w-full h-9 px-3 text-xs font-medium cursor-pointer transition-colors duration-150"
                style={{ background: "var(--surface-2)", color: "var(--foreground)", borderBottom: "1px solid var(--border)" }}
              >
                <span
                  className="flex items-center justify-center rounded shrink-0"
                  style={{ width: 16, height: 16, border: `1px solid ${allBlastSelected ? "var(--accent)" : "var(--muted-2)"}`, background: allBlastSelected ? "var(--accent)" : "transparent", color: "#000" }}
                >
                  {allBlastSelected && <CheckIcon />}
                </span>
                Select all{blastSearch.trim() ? " (filtered)" : ""} ({filteredBlastRecipients.length})
              </button>

              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {filteredBlastRecipients.length === 0 ? (
                  <div className="px-3 py-5 text-xs text-center" style={{ color: "var(--muted)" }}>No matching guests.</div>
                ) : (
                  filteredBlastRecipients.map((r) => {
                    const checked = selectedBlastIds.has(r.id!);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleBlastSelect(r.id!)}
                        role="checkbox"
                        aria-checked={checked}
                        className="flex items-center gap-2.5 w-full h-9 px-3 text-xs cursor-pointer transition-colors duration-150 text-left"
                        style={{ color: "var(--foreground)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span
                          className="flex items-center justify-center rounded shrink-0"
                          style={{ width: 16, height: 16, border: `1px solid ${checked ? "var(--accent)" : "var(--muted-2)"}`, background: checked ? "var(--accent)" : "transparent", color: "#000" }}
                        >
                          {checked && <CheckIcon />}
                        </span>
                        <span className="truncate flex-1">
                          <span className="font-medium">{r.name}</span>
                          <span style={{ color: "var(--muted)" }}> · {r.email}</span>
                        </span>
                        {r.blastSentAt && (
                          <span className="shrink-0 text-[10px]" style={{ color: "var(--muted-2)" }} title={`Last blast ${formatNotifiedAt(r.blastSentAt)}`}>sent</span>
                        )}
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase" style={{ background: "var(--surface-2)", color: "var(--muted)", letterSpacing: "0.06em" }}>
                          {r.status.replace("_", " ")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 mt-auto">
            <div className="text-xs min-w-0" style={{ color: "var(--muted)" }} aria-live="polite">
              {blastResult && (
                <div className="flex flex-col gap-0.5">
                  <span style={{ color: blastResult.failed > 0 ? "var(--warning)" : "var(--success)" }}>
                    {blastResult.done ? "Sent" : "Sending…"} {blastResult.sent}
                    {blastResult.total ? ` of ${blastResult.total}` : ""}
                    {blastResult.failed > 0 ? ` · ${blastResult.failed} failed` : ""}
                  </span>
                  {blastResult.done && blastResult.failed > 0 && blastResult.firstError && (
                    <span className="truncate" style={{ color: "var(--danger)", maxWidth: 280 }} title={blastResult.firstError}>
                      {blastResult.firstError}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleSendBlast}
              disabled={!isAdmin || sendingBlast || !blastSubject.trim() || !blastBody.trim() || selectedBlastIds.size === 0}
              className={BTN_PRIMARY}
              style={{ background: "var(--accent)", color: "#000", outlineColor: "var(--accent)" }}
            >
              <SendIcon />
              {sendingBlast
                ? `Sending… ${(blastResult?.sent ?? 0) + (blastResult?.failed ?? 0)}/${blastResult?.total ?? selectedBlastIds.size}`
                : `Send to ${selectedBlastIds.size} guest${selectedBlastIds.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between h-10 px-4 text-xs" style={{ background: "var(--surface-2)", color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
            <span className="font-medium">Live preview</span>
            <span>{"{{name}}"} renders as &ldquo;Preview Guest&rdquo;</span>
          </div>
          <iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:24px;background:#f5f5f5;">${blastPreviewHtml}</body></html>`}
            className="flex-1 w-full block"
            style={{ border: "none", background: "#f5f5f5", minHeight: 620 }}
            title="Blast preview"
          />
        </div>
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
