import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import type { ReactElement } from "react";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import EmptyState from "@/components/ui/EmptyState";
import { subscribeToEvents, subscribeToRSVPs } from "@/lib/firestore";
import { getTotalSeatCount } from "@/lib/seating";
import type { Event, RSVP } from "@/types";
import type { Unsubscribe } from "firebase/firestore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { format, subDays, parseISO, differenceInCalendarDays, getDay, getHours } from "date-fns";

// ─── Icons ─────────────────────────────────────────────────────────────────────

function CalendarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UsersIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function MailIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function GaugeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CalendarLargeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ─── Scope dropdown ───────────────────────────────────────────────────────────

function ScopeDropdown({
  events, selectedId, onSelect,
}: {
  events: Event[];
  selectedId: string | null; // null = All Events
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const current = events.find((e) => e.id === selectedId) ?? null;
  const sorted = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isUpcoming = (e: Event) => { try { return parseISO(e.date) >= today; } catch { return false; } };
    const upcoming = events.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date));
    const past = events.filter((e) => !isUpcoming(e)).sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...past];
  }, [events]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
        style={{ background: open ? "var(--surface-3)" : "var(--surface-2)", border: "1px solid var(--border)", color: "#fff" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CalendarIcon size={12} />
        <span className="truncate max-w-[220px]">
          {current ? current.title : "All Events"}
        </span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute z-30 mt-1.5 rounded-lg overflow-hidden"
            style={{
              right: 0,
              minWidth: 260,
              maxWidth: 340,
              maxHeight: 340,
              overflowY: "auto",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}
          >
            <div className="py-1">
              <ScopeOption
                label="All Events"
                description="Aggregate across every event"
                selected={selectedId === null}
                onClick={() => { onSelect(null); setOpen(false); }}
              />
              <div style={{ borderTop: "1px solid var(--border)" }} />
              {sorted.map((e) => {
                if (!e.id) return null;
                const isSelected = e.id === selectedId;
                let dateLabel = e.date;
                try { dateLabel = format(parseISO(e.date), "dd MMM yyyy"); } catch {}
                return (
                  <ScopeOption
                    key={e.id}
                    label={e.title}
                    description={dateLabel}
                    selected={isSelected}
                    onClick={() => { onSelect(e.id!); setOpen(false); }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScopeOption({
  label, description, selected, onClick,
}: { label: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors"
      style={{ background: selected ? "rgba(61,155,245,0.08)" : "transparent" }}
      onMouseEnter={(ev) => { if (!selected) ev.currentTarget.style.background = "var(--surface-3)"; }}
      onMouseLeave={(ev) => { if (!selected) ev.currentTarget.style.background = "transparent"; }}
    >
      <span
        style={{
          width: 14, height: 14,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          color: selected ? "var(--accent)" : "transparent",
          flexShrink: 0,
        }}
      >
        <CheckIcon size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white truncate">{label}</p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>{description}</p>
      </div>
    </button>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon, color,
}: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl p-4"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${color}1f`, color }}
      >
        {icon}
      </div>
      <p
        className="font-bold leading-none mt-3"
        style={{ fontSize: 28, color: "#fff", fontFamily: "'Fira Code', monospace" }}
      >
        {value}
      </p>
      <p
        className="text-[10px] mt-2 uppercase tracking-wider font-semibold"
        style={{ color: "var(--muted)", letterSpacing: "0.08em" }}
      >
        {label}
      </p>
    </motion.div>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, headerRight, children,
}: {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
          {subtitle && (
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>{subtitle}</p>
          )}
        </div>
        {headerRight}
      </div>
      <div className="p-5">{children}</div>
    </motion.div>
  );
}

// ─── Range picker (chip group) ────────────────────────────────────────────────

type Range = "7d" | "14d" | "30d" | "90d" | "all";

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const items: { key: Range; label: string }[] = [
    { key: "7d", label: "7d" },
    { key: "14d", label: "14d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "all", label: "All" },
  ];
  return (
    <div
      className="inline-flex items-center rounded-lg p-0.5"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
      role="tablist"
    >
      {items.map((i) => {
        const active = value === i.key;
        return (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            className="px-2 py-1 rounded-md text-[10px] font-semibold cursor-pointer transition-colors"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#000" : "var(--muted)",
              minWidth: 28,
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--muted)"; }}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Sortable events comparison bar chart ─────────────────────────────────────

type ComparisonSort = "rsvps" | "attending" | "allocated" | "fill";

interface ComparisonRow {
  id: string;
  label: string;
  rsvps: number;
  attending: number;
  allocated: number;
  capacity: number;
  fillPct: number;
}

function EventsComparison({ rows }: { rows: ComparisonRow[] }) {
  const [sort, setSort] = useState<ComparisonSort>("rsvps");
  const sorted = useMemo(() => {
    const s = [...rows];
    s.sort((a, b) => {
      if (sort === "fill") return b.fillPct - a.fillPct;
      return b[sort] - a[sort];
    });
    return s.slice(0, 10);
  }, [rows, sort]);

  const maxVal = useMemo(() => {
    if (sort === "fill") return 100;
    return Math.max(...sorted.map((r) => r[sort]), 1);
  }, [sorted, sort]);

  const sortOptions: { key: ComparisonSort; label: string }[] = [
    { key: "rsvps",     label: "RSVPs" },
    { key: "attending", label: "Attending" },
    { key: "allocated", label: "Allocated" },
    { key: "fill",      label: "Fill %" },
  ];

  if (sorted.length === 0) {
    return <p className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>No events in scope.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
          Sort by:
        </span>
        {sortOptions.map((o) => {
          const active = sort === o.key;
          return (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--surface-3)",
                color: active ? "#000" : "var(--muted)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {sorted.map((row, i) => {
          const value = sort === "fill" ? row.fillPct : row[sort];
          const pct = (value / maxVal) * 100;
          const display = sort === "fill" ? `${row.fillPct}%` : String(value);
          return (
            <div key={row.id} className="flex items-center gap-3">
              <div className="w-32 shrink-0 min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{row.label}</p>
              </div>
              <div className="flex-1 relative" style={{ height: 24 }}>
                <div
                  className="absolute inset-0 rounded-md"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
                  className="absolute left-0 top-0 bottom-0 rounded-md"
                  style={{
                    background: "linear-gradient(90deg, rgba(61,155,245,0.55) 0%, rgba(61,155,245,0.25) 100%)",
                    borderRight: "2px solid var(--accent)",
                  }}
                />
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono font-semibold text-white"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                >
                  {display}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Funnel ──────────────────────────────────────────────────────────────────

interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const maxVal = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const pct = (stage.value / maxVal) * 100;
        const prev = i > 0 ? stages[i - 1].value : null;
        const conversion = prev != null && prev > 0 ? Math.round((stage.value / prev) * 100) : null;
        return (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-28 shrink-0">
              <p className="text-[11px] font-semibold text-white">{stage.label}</p>
              {conversion != null && (
                <p className="text-[10px] mt-0.5" style={{ color: conversion >= 80 ? "#22c55e" : conversion >= 50 ? "#f59e0b" : "#ef4444" }}>
                  {conversion}% conversion
                </p>
              )}
            </div>
            <div className="flex-1 relative">
              <div
                className="rounded-md overflow-hidden flex items-center px-3"
                style={{ height: 32, background: "var(--surface-3)", border: "1px solid var(--border)" }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                  style={{
                    height: "100%",
                    background: `linear-gradient(90deg, ${stage.color}88 0%, ${stage.color}40 100%)`,
                    borderRight: `2px solid ${stage.color}`,
                    position: "absolute",
                    left: 0,
                    top: 0,
                  }}
                />
                <span className="relative z-10 text-xs font-mono font-semibold text-white">{stage.value}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RSVP heatmap (day-of-week × hour) ────────────────────────────────────────

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// 12 buckets of 2 hours each
const HOUR_BUCKETS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

function RsvpHeatmap({ matrix }: { matrix: number[][] /* [7 days][12 buckets] */ }) {
  const flat = matrix.flat();
  const max = Math.max(...flat, 1);
  const total = flat.reduce((s, v) => s + v, 0);

  if (total === 0) {
    return <p className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>No RSVPs to plot yet.</p>;
  }

  return (
    <div>
      <div className="flex">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-around mr-2" style={{ paddingTop: 24, paddingBottom: 4 }}>
          {DOW_LABELS.map((d) => (
            <span key={d} className="text-[10px] font-mono" style={{ color: "var(--muted)", lineHeight: "20px" }}>
              {d}
            </span>
          ))}
        </div>
        {/* Heatmap grid */}
        <div className="flex-1 min-w-0">
          {/* X-axis labels */}
          <div className="flex" style={{ height: 20 }}>
            {HOUR_BUCKETS.map((h) => (
              <div key={h} className="flex-1 text-center text-[9px] font-mono" style={{ color: "var(--muted)" }}>
                {h.toString().padStart(2, "0")}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="flex flex-col gap-1">
            {matrix.map((row, dayIdx) => (
              <div key={dayIdx} className="flex gap-1" style={{ height: 20 }}>
                {row.map((val, bIdx) => {
                  const intensity = val === 0 ? 0 : 0.15 + (val / max) * 0.75;
                  const label = `${DOW_LABELS[dayIdx]} ${HOUR_BUCKETS[bIdx].toString().padStart(2, "0")}:00 — ${val} RSVP${val === 1 ? "" : "s"}`;
                  return (
                    <div
                      key={bIdx}
                      title={label}
                      className="flex-1 rounded-sm transition-colors"
                      style={{
                        background: val === 0
                          ? "var(--surface-3)"
                          : `rgba(61,155,245,${intensity})`,
                        border: "1px solid var(--border)",
                        minWidth: 18,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>Less</span>
        {[0.15, 0.35, 0.55, 0.75, 0.9].map((a) => (
          <div
            key={a}
            className="rounded-sm"
            style={{
              width: 14, height: 14,
              background: `rgba(61,155,245,${a})`,
              border: "1px solid var(--border)",
            }}
          />
        ))}
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>More</span>
      </div>
    </div>
  );
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltipContent({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {label && <p className="font-medium text-white mb-1">{label}</p>}
      {payload.map((entry, i: number) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#22c55e", "#f59e0b", "#3d9bf5", "#6b7280"];
const LAYOUT_COLORS: Record<string, string> = {
  theater:         "#3d9bf5",
  auditorium:      "#8b5cf6",
  banquet:         "#22c55e",
  classroom:       "#f59e0b",
  runway:          "#ec4899",
  "banquet-runway":"#d4af37",
};

// ─── Main page ────────────────────────────────────────────────────────────────

const DashboardPage: NextPageWithLayout = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [allRsvps, setAllRsvps] = useState<Map<string, RSVP[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filters
  const [scopeEventId, setScopeEventId] = useState<string | null>(null); // null = All Events
  const [range, setRange] = useState<Range>("30d");

  const rsvpSubsRef = useRef<Map<string, Unsubscribe>>(new Map());

  // Subscribe to events
  useEffect(() => {
    const unsub = subscribeToEvents((evts) => {
      setEvents(evts);
      setLoading(false);
    });
    return () => {
      unsub();
      rsvpSubsRef.current.forEach((u) => u());
      rsvpSubsRef.current.clear();
    };
  }, []);

  // Sync per-event subscriptions
  useEffect(() => {
    const subs = rsvpSubsRef.current;
    const wanted = new Set(events.map((e) => e.id).filter((id): id is string => !!id));
    for (const [id, unsub] of subs.entries()) {
      if (!wanted.has(id)) {
        unsub();
        subs.delete(id);
        setAllRsvps((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }
    for (const id of wanted) {
      if (!subs.has(id)) {
        const unsub = subscribeToRSVPs(id, (rsvps) => {
          setAllRsvps((prev) => {
            const next = new Map(prev);
            next.set(id, rsvps);
            return next;
          });
        });
        subs.set(id, unsub);
      }
    }
  }, [events]);

  // If scoped event vanishes, fall back to All
  useEffect(() => {
    if (scopeEventId && !events.some((e) => e.id === scopeEventId)) {
      setScopeEventId(null);
    }
  }, [events, scopeEventId]);

  // ── Derived scoped data ─────────────────────────────────────────────────────

  const scopedEvents = useMemo<Event[]>(
    () => (scopeEventId ? events.filter((e) => e.id === scopeEventId) : events),
    [events, scopeEventId]
  );

  const scopedRsvps = useMemo<RSVP[]>(() => {
    const out: RSVP[] = [];
    for (const e of scopedEvents) {
      if (!e.id) continue;
      const list = allRsvps.get(e.id) ?? [];
      for (const r of list) out.push(r);
    }
    return out;
  }, [scopedEvents, allRsvps]);

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalEvents = scopedEvents.length;
    const totalRsvps = scopedRsvps.length;
    const totalCheckedIn = scopedRsvps.filter((r) => r.status === "checked_in").length;

    // Avg fill rate across events: allocated / capacity, averaged
    const fills: number[] = [];
    const notifs: number[] = [];
    let totalCapacity = 0;
    let totalAllocated = 0;
    for (const e of scopedEvents) {
      if (!e.id) continue;
      const list = allRsvps.get(e.id) ?? [];
      const capacity = getTotalSeatCount(e.seatingConfig, e.totalSeats);
      const allocated = list.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
      const notified = list.filter((r) => (r.status === "allocated" || r.status === "checked_in") && !!r.notifiedAt).length;
      totalCapacity += capacity;
      totalAllocated += allocated;
      if (capacity > 0) fills.push(allocated / capacity);
      if (allocated > 0) notifs.push(notified / allocated);
    }
    const avgFill = fills.length > 0 ? Math.round((fills.reduce((s, v) => s + v, 0) / fills.length) * 100) : 0;
    const avgNotif = notifs.length > 0 ? Math.round((notifs.reduce((s, v) => s + v, 0) / notifs.length) * 100) : 0;

    // When single-event scope, "Total Events" gives way to "Capacity"
    return {
      totalEvents,
      totalRsvps,
      totalCheckedIn,
      avgFill,
      avgNotif,
      capacity: totalCapacity,
      allocated: totalAllocated,
    };
  }, [scopedEvents, scopedRsvps, allRsvps]);

  const singleEventScope = scopeEventId !== null;

  // ── Trend (filtered by range) ───────────────────────────────────────────────

  const trendData = useMemo(() => {
    let daysWindow: number;
    if (range === "all") {
      // For "All", default to 90 unless we have older data
      const earliest = scopedRsvps.reduce<string | null>((min, r) => {
        if (!r.submittedAt) return min;
        if (!min) return r.submittedAt;
        return r.submittedAt.localeCompare(min) < 0 ? r.submittedAt : min;
      }, null);
      if (earliest) {
        try {
          const days = Math.max(7, Math.min(365, differenceInCalendarDays(new Date(), parseISO(earliest)) + 1));
          daysWindow = days;
        } catch { daysWindow = 90; }
      } else daysWindow = 30;
    } else {
      daysWindow = parseInt(range);
    }

    const out: { date: string; count: number }[] = [];
    for (let i = daysWindow - 1; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      let count = 0;
      for (const r of scopedRsvps) {
        if (r.submittedAt && r.submittedAt.startsWith(dayStr)) count++;
      }
      out.push({ date: format(day, daysWindow > 60 ? "dd MMM" : "dd MMM"), count });
    }
    return out;
  }, [scopedRsvps, range]);

  // ── Events comparison ───────────────────────────────────────────────────────

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    return scopedEvents
      .filter((e): e is Event & { id: string } => !!e.id)
      .map((e) => {
        const list = allRsvps.get(e.id) ?? [];
        const rsvps = list.length;
        const attending = list.filter((r) => r.attending).length;
        const allocated = list.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
        const capacity = getTotalSeatCount(e.seatingConfig, e.totalSeats);
        const fillPct = capacity > 0 ? Math.round((allocated / capacity) * 100) : 0;
        return {
          id: e.id,
          label: e.title.length > 22 ? e.title.slice(0, 22) + "…" : e.title,
          rsvps, attending, allocated, capacity, fillPct,
        };
      });
  }, [scopedEvents, allRsvps]);

  // ── Funnel (aggregate or per-scoped) ─────────────────────────────────────────

  const funnelStages = useMemo<FunnelStage[]>(() => {
    const submitted = scopedRsvps.length;
    const attending = scopedRsvps.filter((r) => r.attending).length;
    const allocated = scopedRsvps.filter((r) => r.status === "allocated" || r.status === "checked_in").length;
    const notified = scopedRsvps.filter((r) => r.notifiedAt && (r.status === "allocated" || r.status === "checked_in")).length;
    const checkedIn = scopedRsvps.filter((r) => r.status === "checked_in").length;
    return [
      { label: "Submitted",  value: submitted,  color: "#6b7280" },
      { label: "Attending",  value: attending,  color: "#3d9bf5" },
      { label: "Allocated",  value: allocated,  color: "#8b5cf6" },
      { label: "Notified",   value: notified,   color: "#f59e0b" },
      { label: "Checked In", value: checkedIn,  color: "#22c55e" },
    ];
  }, [scopedRsvps]);

  // ── Status pie ──────────────────────────────────────────────────────────────

  const pieData = useMemo(() => {
    let allocated = 0, pending = 0, checkedIn = 0, notAttending = 0;
    for (const r of scopedRsvps) {
      if (r.status === "allocated") allocated++;
      else if (r.status === "pending") pending++;
      else if (r.status === "checked_in") checkedIn++;
      else if (r.status === "not_attending" || !r.attending) notAttending++;
    }
    return [
      { name: "Allocated", value: allocated },
      { name: "Pending", value: pending },
      { name: "Checked In", value: checkedIn },
      { name: "Not Attending", value: notAttending },
    ].filter((d) => d.value > 0);
  }, [scopedRsvps]);

  // ── Layout style distribution ───────────────────────────────────────────────

  const layoutData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of scopedEvents) {
      const style = e.seatingConfig?.style ?? "theater";
      counts.set(style, (counts.get(style) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [scopedEvents]);

  // ── RSVP heatmap matrix ─────────────────────────────────────────────────────

  const heatmapMatrix = useMemo<number[][]>(() => {
    // 7 days × 12 buckets, initialise to 0
    const m: number[][] = Array.from({ length: 7 }, () => Array(HOUR_BUCKETS.length).fill(0));
    for (const r of scopedRsvps) {
      if (!r.submittedAt) continue;
      try {
        const d = parseISO(r.submittedAt);
        // getDay: 0=Sun..6=Sat; rotate so Mon=0..Sun=6
        const dow = (getDay(d) + 6) % 7;
        const hr = getHours(d);
        const bIdx = Math.floor(hr / 2);
        m[dow][bIdx]++;
      } catch {}
    }
    return m;
  }, [scopedRsvps]);

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

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Performance and pipeline metrics across your events
          </p>
        </div>
        <EmptyState
          icon={<CalendarLargeIcon />}
          title="No events to analyse yet"
          description="Create an event and collect RSVPs to start seeing analytics here."
          action={
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              Go to Events
              <ArrowRightIcon />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {scopeEventId
              ? "Scoped to a single event"
              : "Performance and pipeline metrics across all your events"}
          </p>
        </div>
        <ScopeDropdown
          events={events}
          selectedId={scopeEventId}
          onSelect={setScopeEventId}
        />
      </div>

      {/* KPI Row — adapts to scope */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {singleEventScope ? (
          <KpiCard
            label="Capacity"
            value={String(kpis.capacity)}
            icon={<CalendarIcon />}
            color="#8b5cf6"
          />
        ) : (
          <KpiCard
            label="Total Events"
            value={String(kpis.totalEvents)}
            icon={<CalendarIcon />}
            color="#8b5cf6"
          />
        )}
        <KpiCard
          label="Total RSVPs"
          value={String(kpis.totalRsvps)}
          icon={<UsersIcon />}
          color="#3d9bf5"
        />
        <KpiCard
          label={singleEventScope ? "Fill Rate" : "Avg Fill Rate"}
          value={`${kpis.avgFill}%`}
          icon={<GaugeIcon />}
          color="#22c55e"
        />
        <KpiCard
          label={singleEventScope ? "Notified" : "Avg Notif Rate"}
          value={`${kpis.avgNotif}%`}
          icon={<MailIcon />}
          color="#f59e0b"
        />
        <KpiCard
          label="Checked In"
          value={String(kpis.totalCheckedIn)}
          icon={<CheckIcon />}
          color="#ec4899"
        />
      </div>

      {/* Trend (full width) */}
      <ChartCard
        title="RSVP Trend"
        subtitle={
          range === "all"
            ? "All submissions to date"
            : `Last ${range === "7d" ? "7" : range === "14d" ? "14" : range === "30d" ? "30" : "90"} days`
        }
        headerRight={<RangePicker value={range} onChange={setRange} />}
      >
        <div style={{ width: "100%", height: 256 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={20}
              />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltipContent />} cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }} />
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3d9bf5" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3d9bf5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="count" name="RSVPs" stroke="#3d9bf5" strokeWidth={2} fill="url(#trendGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Events comparison + Layout donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard
            title="Events Comparison"
            subtitle="Top 10 events by selected metric"
          >
            <EventsComparison rows={comparisonRows} />
          </ChartCard>
        </div>
        <div>
          <ChartCard
            title="Layout Style Mix"
            subtitle="Events grouped by seating layout"
          >
            {layoutData.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>No events.</p>
            ) : (
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={layoutData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                      {layoutData.map((d, i) => (
                        <Cell key={i} fill={LAYOUT_COLORS[d.name] ?? "#6b7280"} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Legend
                      wrapperStyle={{ fontSize: 10, color: "var(--muted)" }}
                      formatter={(value: string) => (
                        <span style={{ color: "var(--muted)", fontSize: 10, textTransform: "capitalize" }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Funnel + Status pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="RSVP Funnel"
          subtitle={scopeEventId ? "For this event" : "Aggregate across all events"}
        >
          <FunnelChart stages={funnelStages} />
        </ChartCard>
        <ChartCard
          title="Status Distribution"
          subtitle="Where every RSVP currently sits"
        >
          {pieData.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--muted)" }}>No RSVPs to plot.</p>
          ) : (
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltipContent />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
                    formatter={(value: string) => (
                      <span style={{ color: "var(--muted)", fontSize: 11 }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Heatmap */}
      <ChartCard
        title="RSVP Velocity"
        subtitle="When guests typically respond (all-time, in your local timezone)"
      >
        <RsvpHeatmap matrix={heatmapMatrix} />
      </ChartCard>
    </div>
  );
};

DashboardPage.getLayout = (page: ReactElement) => (
  <AdminLayout title="Analytics — AuraPixel RSVP">{page}</AdminLayout>
);

export default DashboardPage;
