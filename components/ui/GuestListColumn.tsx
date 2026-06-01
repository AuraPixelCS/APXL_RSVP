import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { RSVP } from "@/types";

interface Props {
  rsvps: RSVP[];
  /** ID of the currently click-selected guest (for click-to-place fallback). */
  selectedGuestId: string | null;
  onSelectGuest: (rsvpId: string | null) => void;
  /** Renders a status / seat label per row. Caller injects this so layout
   *  formatting stays inside the page (table mode vs seat mode etc). */
  renderSeatLabel: (rsvp: RSVP) => string | null;
}

type TabKey = "pending" | "allocated";

const TAB_COPY: Record<TabKey, { label: string; emptyTitle: string; emptyBody: string }> = {
  pending: {
    label: "Pending",
    emptyTitle: "No pending guests",
    emptyBody: "Every attending guest has been allocated a seat.",
  },
  allocated: {
    label: "Allocated",
    emptyTitle: "No guests allocated yet",
    emptyBody: "Drag a guest onto a seat to allocate.",
  },
};

export default function GuestListColumn({
  rsvps,
  selectedGuestId,
  onSelectGuest,
  renderSeatLabel,
}: Props) {
  const [tab, setTab] = useState<TabKey>("pending");
  const [search, setSearch] = useState("");

  // Filter out not-attending — they can't be allocated anyway.
  const attending = useMemo(
    () => rsvps.filter((r) => r.attending && r.status !== "not_attending"),
    [rsvps]
  );

  const pending = useMemo(
    () => attending.filter((r) => r.status === "pending"),
    [attending]
  );
  const allocated = useMemo(
    () =>
      attending.filter(
        (r) => r.status === "allocated" || r.status === "checked_in"
      ),
    [attending]
  );

  const active = tab === "pending" ? pending : allocated;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.company ?? "").toLowerCase().includes(q)
    );
  }, [active, search]);

  return (
    <aside
      className="flex flex-col h-full min-h-0"
      style={{
        width: 320,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
      aria-label="Guest list"
    >
      {/* Tabs */}
      <div
        className="flex items-center gap-1 px-3 pt-3"
        style={{ flexShrink: 0 }}
      >
        {(["pending", "allocated"] as const).map((key) => {
          const isActive = tab === key;
          const count = key === "pending" ? pending.length : allocated.length;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              style={{
                background: isActive ? "rgba(61,155,245,0.12)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--muted)",
                border: `1px solid ${isActive ? "rgba(61,155,245,0.3)" : "transparent"}`,
              }}
              aria-pressed={isActive}
              role="tab"
            >
              {TAB_COPY[key].label}
              <span
                className="rounded-full"
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  background: isActive ? "rgba(61,155,245,0.18)" : "var(--surface-3)",
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  fontFamily: "'Fira Code', monospace",
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-3 pt-2 pb-3" style={{ flexShrink: 0 }}>
        <div
          className="flex items-center gap-2 px-2.5 rounded-lg"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            height: 32,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--muted)", flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guests…"
            aria-label="Search guests"
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: "#fff" }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="cursor-pointer"
              style={{ color: "var(--muted)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div
        className="flex-1 min-h-0 overflow-auto px-2 pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
        role="tabpanel"
      >
        {visible.length === 0 ? (
          <EmptyState
            title={search ? "No matches" : TAB_COPY[tab].emptyTitle}
            body={search ? `No guests match "${search}".` : TAB_COPY[tab].emptyBody}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visible.map((rsvp) => (
              <GuestCard
                key={rsvp.id}
                rsvp={rsvp}
                seatLabel={renderSeatLabel(rsvp)}
                isSelected={selectedGuestId === rsvp.id}
                onSelect={() =>
                  onSelectGuest(selectedGuestId === rsvp.id ? null : rsvp.id!)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div
        className="rounded-full mb-3 flex items-center justify-center"
        style={{
          width: 40,
          height: 40,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      </div>
      <p className="text-xs font-semibold text-white">{title}</p>
      <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
        {body}
      </p>
    </div>
  );
}

function GuestCard({
  rsvp,
  seatLabel,
  isSelected,
  onSelect,
}: {
  rsvp: RSVP;
  seatLabel: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `guest-${rsvp.id}`,
    data: { rsvpId: rsvp.id, name: rsvp.name, currentSeat: rsvp.seatNumber },
  });

  const status = rsvp.status;
  const statusColor =
    status === "checked_in"
      ? "#22c55e"
      : status === "allocated"
      ? "var(--accent)"
      : status === "pending"
      ? "#f59e0b"
      : "var(--muted)";
  const statusLabel =
    status === "checked_in" ? "Checked In" : status === "allocated" ? "Allocated" : "Pending";

  return (
    // Source card stays put — the DragOverlay handles the floating visual.
    // Using a plain <li> (not motion.li) avoids ref-forwarding conflicts with
    // @dnd-kit's setNodeRef that previously caused the whole list to misrender.
    <li
      ref={setNodeRef}
      style={{
        background: isSelected ? "rgba(61,155,245,0.10)" : "var(--surface-2)",
        border: `1px solid ${isSelected ? "rgba(61,155,245,0.45)" : "var(--border)"}`,
        borderRadius: 10,
        opacity: isDragging ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
        transition: "border-color 120ms, background 120ms",
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Avatar */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "rgba(61,155,245,0.12)",
            border: "1px solid rgba(61,155,245,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "var(--accent)",
            flexShrink: 0,
          }}
          aria-hidden
        >
          {rsvp.name.charAt(0).toUpperCase()}
        </div>

        {/* Name + company + status */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white truncate leading-tight">
            {rsvp.name}
          </p>
          {rsvp.company && (
            <p
              className="text-[10px] mt-0.5 truncate leading-tight"
              style={{ color: "var(--muted)" }}
              title={rsvp.company}
            >
              {rsvp.company}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: statusColor }}
              aria-hidden
            />
            <span
              className="text-[10px] leading-none"
              style={{ color: statusColor }}
            >
              {statusLabel}
            </span>
            {seatLabel && (
              <span
                className="text-[10px] leading-none truncate"
                style={{
                  color: "var(--muted)",
                  fontFamily: "'Fira Code', monospace",
                }}
              >
                · {seatLabel}
              </span>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          aria-hidden
          style={{
            color: "var(--muted)",
            flexShrink: 0,
            opacity: 0.6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>
      </div>
    </li>
  );
}
