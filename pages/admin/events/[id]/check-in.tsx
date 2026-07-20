import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import { getEvent, subscribeToRSVPs, updateRSVP } from "@/lib/firestore";
import { formatAssignment } from "@/lib/seatLabel";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import type { Event, RSVP } from "@/types";
import { motion, AnimatePresence } from "framer-motion";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The scanner has always written checkInTime; checkedInAt is the web-side twin. */
function checkedInAtOf(r: RSVP): string | null {
  return r.checkInTime ?? r.checkedInAt ?? null;
}

function timeAgo(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function clockOf(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CheckInPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { id } = router.query as { id: string };
  const { role } = useAuthContext();
  const toast = useToast();
  const isAdmin = role === "admin";

  const [event, setEvent] = useState<Event | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "arrived" | "expected">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Ticks so relative timestamps stay honest without a reload.
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  // Only allocated/checked-in guests are expected at the door.
  const expected = useMemo(
    () => rsvps.filter((r) => r.status === "allocated" || r.status === "checked_in"),
    [rsvps],
  );
  const arrived = useMemo(() => expected.filter((r) => r.status === "checked_in"), [expected]);
  const notArrived = useMemo(() => expected.filter((r) => r.status !== "checked_in"), [expected]);
  const pct = expected.length > 0 ? Math.round((arrived.length / expected.length) * 100) : 0;

  // Arrivals in the last 15 minutes — the "is it busy right now" number.
  const recentRate = useMemo(() => {
    const cutoff = now - 15 * 60_000;
    return arrived.filter((r) => {
      const at = checkedInAtOf(r);
      return at ? new Date(at).getTime() >= cutoff : false;
    }).length;
  }, [arrived, now]);

  // Live activity feed — most recent arrivals first.
  const feed = useMemo(() => {
    return [...arrived]
      .filter((r) => checkedInAtOf(r))
      .sort((a, b) => new Date(checkedInAtOf(b)!).getTime() - new Date(checkedInAtOf(a)!).getTime())
      .slice(0, 25);
  }, [arrived]);

  const visible = useMemo(() => {
    const base = filter === "arrived" ? arrived : filter === "expected" ? notArrived : expected;
    const q = search.trim().toLowerCase();
    const list = q
      ? base.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            r.phone.toLowerCase().includes(q) ||
            (r.company ?? "").toLowerCase().includes(q),
        )
      : base;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filter, search, expected, arrived, notArrived]);

  // ── Manual check-in / undo ─────────────────────────────────────────────────
  const setCheckedIn = useCallback(
    async (rsvp: RSVP, checked: boolean) => {
      if (!event?.id || !rsvp.id) return;
      setBusyId(rsvp.id);
      try {
        const stamp = new Date().toISOString();
        await updateRSVP(event.id, rsvp.id, checked
          ? { status: "checked_in", checkInTime: stamp, checkedInAt: stamp }
          : { status: "allocated", checkInTime: null, checkedInAt: null });
        if (checked) toast.success(`${rsvp.name} checked in`);
        else toast.info(`Check-in undone for ${rsvp.name}`);
      } catch (e) {
        toast.error("Check-in failed", e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [event, toast],
  );

  const undoCheckIn = useCallback(
    async (rsvp: RSVP) => {
      const ok = await toast.confirm({
        title: `Undo check-in for ${rsvp.name}?`,
        message: "They will be marked as not yet arrived.",
        confirmLabel: "Undo check-in",
        tone: "danger",
      });
      if (ok) await setCheckedIn(rsvp, false);
    },
    [toast, setCheckedIn],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!event) {
    return <div className="max-w-3xl mx-auto px-4 py-12 text-center" style={{ color: "var(--muted)" }}>Event not found.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 space-y-5">
      <button
        onClick={() => router.push(`/admin/events/${event.id}`)}
        className="flex items-center gap-1.5 text-xs cursor-pointer transition-colors"
        style={{ color: "var(--muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
        </svg>
        Back to event
      </button>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto]">
          <div className="p-5 sm:p-6 flex flex-col gap-4">
            <div>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase mb-3"
                style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)", letterSpacing: "0.08em" }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />
                Live check-in
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">{event.title}</h1>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                {expected.length === 0
                  ? "No allocated guests yet — allocate seats before the doors open."
                  : `${arrived.length} of ${expected.length} expected guests have arrived.`}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Stat label="Arrived" value={arrived.length} color="#22c55e" />
              <Stat label="Not arrived" value={notArrived.length} color={notArrived.length > 0 ? "#f59e0b" : "var(--muted)"} />
              <Stat label="Expected" value={expected.length} color="var(--accent)" />
              <Stat label="Last 15 min" value={recentRate} color="var(--foreground)" />
            </div>
          </div>

          <div
            className="p-6 flex items-center justify-center"
            style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", minWidth: 200 }}
          >
            <ProgressRing pct={pct} />
          </div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg p-1 gap-1 self-start" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {([
            { key: "all", label: "All", count: expected.length, color: "var(--accent)" },
            { key: "expected", label: "Not arrived", count: notArrived.length, color: "#f59e0b" },
            { key: "arrived", label: "Arrived", count: arrived.length, color: "#22c55e" },
          ] as const).map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all duration-150"
                style={{ background: on ? f.color : "transparent", color: on ? "#000" : "var(--muted)" }}
              >
                {f.label}
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: on ? "rgba(0,0,0,0.15)" : "var(--surface-3)", color: on ? "#000" : "var(--muted)", minWidth: 18, height: 16, padding: "0 5px" }}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative sm:min-w-[260px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, company…"
            aria-label="Search guests"
            className="w-full pl-8 pr-3 py-2.5 rounded-lg text-sm text-white"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
        </div>
      </div>

      {/* ── Guest list + live feed ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Guest list */}
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          {visible.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-white font-medium">
                {search ? `No guests match “${search}”` : filter === "expected" ? "Everyone expected has arrived." : "No guests in this view."}
              </p>
              {search && (
                <button onClick={() => setSearch("")} className="text-xs mt-2 cursor-pointer" style={{ color: "var(--accent)" }}>
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {visible.map((r) => {
                const at = checkedInAtOf(r);
                const isIn = r.status === "checked_in";
                const seat = formatAssignment(r.seatNumber, event)?.short;
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: "var(--border)" }}>
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded-full"
                      style={{ width: 8, height: 8, background: isIn ? "#22c55e" : "var(--surface-3)", border: isIn ? "none" : "1px solid var(--border)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{r.name}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                        {seat ? `${seat} · ` : ""}{r.company || r.email}
                        {isIn && at ? ` · ${clockOf(at)}` : ""}
                      </p>
                    </div>
                    {isAdmin ? (
                      isIn ? (
                        <button
                          onClick={() => undoCheckIn(r)}
                          disabled={busyId === r.id}
                          className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40"
                          style={{ background: "rgba(34,197,94,0.10)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}
                        >
                          {busyId === r.id ? "…" : "Arrived ✓"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setCheckedIn(r, true)}
                          disabled={busyId === r.id}
                          className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40"
                          style={{ background: "var(--accent)", color: "#000" }}
                        >
                          {busyId === r.id ? "…" : "Check in"}
                        </button>
                      )
                    ) : (
                      <span className="text-[11px]" style={{ color: isIn ? "#22c55e" : "var(--muted)" }}>{isIn ? "Arrived" : "—"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Live feed */}
        <div className="rounded-xl overflow-hidden lg:sticky lg:top-4" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
              Recent arrivals
            </p>
          </div>
          {feed.length === 0 ? (
            <p className="px-4 py-8 text-xs text-center" style={{ color: "var(--muted)" }}>No arrivals yet.</p>
          ) : (
            <ul style={{ maxHeight: 420, overflowY: "auto" }}>
              <AnimatePresence initial={false}>
                {feed.map((r) => {
                  const at = checkedInAtOf(r)!;
                  return (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-2.5 px-4 py-2.5"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <span className="shrink-0 rounded-full" style={{ width: 6, height: 6, background: "#22c55e" }} />
                      <span className="text-xs text-white truncate flex-1">{r.name}</span>
                      <span className="text-[10px] shrink-0" style={{ color: "var(--muted)", fontFamily: "'Fira Code', monospace" }}>
                        {timeAgo(at, now)}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Bits ─────────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color, fontFamily: "'Fira Code', monospace" }}>{value}</p>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const SIZE = 140;
  const STROKE = 12;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 100 ? "#22c55e" : "var(--accent)";
  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }} role="img" aria-label={`${pct}% of expected guests have arrived`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={radius} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ pointerEvents: "none" }}>
        <p className="text-3xl font-bold text-white" style={{ fontFamily: "'Fira Code', monospace" }}>{pct}%</p>
        <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>Arrived</p>
      </div>
    </div>
  );
}

CheckInPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Live Check-in — AuraPixel RSVP">{page}</AdminLayout>
);

export default CheckInPage;
