import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { RSVP } from "@/types";

// ─── Group field model ───────────────────────────────────────────────────────

export type GroupField = "company" | "jobTitle" | "industry" | "partOf";

interface GroupFieldDef {
  key: GroupField;
  label: string;
}

const GROUP_FIELDS: GroupFieldDef[] = [
  { key: "company", label: "Company" },
  { key: "jobTitle", label: "Job Title" },
  { key: "industry", label: "Industry" },
  { key: "partOf", label: "Part Of" },
];

/** Returns the group key + display label for a guest given the active group
 *  fields. Returns null when any selected field is empty — those guests fall
 *  into the "Ungrouped" bucket and behave single-drag. */
export function groupKeyFor(
  rsvp: RSVP,
  groupBy: GroupField[]
): { key: string; label: string } | null {
  if (groupBy.length === 0) return null;
  const values = groupBy.map((f) => (rsvp[f] ?? "").trim());
  if (values.some((v) => v === "")) return null;
  return { key: values.join("|"), label: values.join(" · ") };
}

/** Build a Map<rsvpId, string[]> where the value is the full list of rsvp ids
 *  in the same group (including the key itself). Solo / ungrouped guests map
 *  to `[selfId]`. */
export function buildGroupMap(
  rsvps: RSVP[],
  groupBy: GroupField[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (groupBy.length === 0) {
    rsvps.forEach((r) => r.id && map.set(r.id, [r.id]));
    return map;
  }
  const groups = new Map<string, string[]>();
  for (const r of rsvps) {
    if (!r.id) continue;
    const k = groupKeyFor(r, groupBy);
    if (!k) {
      map.set(r.id, [r.id]);
      continue;
    }
    if (!groups.has(k.key)) groups.set(k.key, []);
    groups.get(k.key)!.push(r.id);
  }
  for (const [, ids] of groups) {
    for (const id of ids) map.set(id, ids);
  }
  return map;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  rsvps: RSVP[];
  selectedGuestId: string | null;
  onSelectGuest: (rsvpId: string | null) => void;
  renderSeatLabel: (rsvp: RSVP) => string | null;
  /** Active group fields (0–2). When empty, list renders flat. */
  groupBy: GroupField[];
  setGroupBy: (next: GroupField[]) => void;
  /** RsvpId → full group ids. Computed in the parent so the same map can also
   *  drive the drag payload on the page. */
  groupMap: Map<string, string[]>;
  /** While a group is being dragged, every member's id is in this set so
   *  sibling cards show the ghost (opacity 0.4) state. Null when not dragging. */
  draggingRsvpIds: Set<string> | null;
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
  groupBy,
  setGroupBy,
  groupMap,
  draggingRsvpIds,
}: Props) {
  const [tab, setTab] = useState<TabKey>("pending");
  const [search, setSearch] = useState("");

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

  // When groupBy is active, divide `visible` into ordered sections. The group
  // computation uses the full attending list so sizes reflect the real group
  // (the drag carries everyone, search-hidden or not — see comment in plan).
  const sections = useMemo(() => {
    if (groupBy.length === 0) return null;
    type Section = { key: string; label: string; members: RSVP[] };
    const buckets = new Map<string, Section>();
    const ungrouped: RSVP[] = [];
    for (const r of visible) {
      const k = groupKeyFor(r, groupBy);
      if (!k) {
        ungrouped.push(r);
        continue;
      }
      if (!buckets.has(k.key)) {
        buckets.set(k.key, { key: k.key, label: k.label, members: [] });
      }
      buckets.get(k.key)!.members.push(r);
    }
    // Sort: by full group size desc, then label asc. Groups with only one
    // visible member after the search filter still display, but lose the
    // accent bar (which is driven by groupMap size, not visible size).
    const list = Array.from(buckets.values()).sort((a, b) => {
      const sa = groupMap.get(a.members[0].id!)?.length ?? a.members.length;
      const sb = groupMap.get(b.members[0].id!)?.length ?? b.members.length;
      if (sb !== sa) return sb - sa;
      return a.label.localeCompare(b.label);
    });
    return { groups: list, ungrouped };
  }, [groupBy, visible, groupMap]);

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

      {/* Group-by selector */}
      <div className="px-3 pt-2" style={{ flexShrink: 0 }}>
        <GroupBySelector groupBy={groupBy} setGroupBy={setGroupBy} />
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
        ) : sections ? (
          <div className="flex flex-col gap-4">
            {sections.groups.map((sec) => (
              <GroupSection
                key={sec.key}
                label={sec.label}
                size={groupMap.get(sec.members[0].id!)?.length ?? sec.members.length}
                visibleCount={sec.members.length}
              >
                {sec.members.map((rsvp) => (
                  <GuestCard
                    key={rsvp.id}
                    rsvp={rsvp}
                    seatLabel={renderSeatLabel(rsvp)}
                    isSelected={selectedGuestId === rsvp.id}
                    onSelect={() =>
                      onSelectGuest(selectedGuestId === rsvp.id ? null : rsvp.id!)
                    }
                    groupSize={groupMap.get(rsvp.id!)?.length ?? 1}
                    isInDragGroup={!!(draggingRsvpIds && rsvp.id && draggingRsvpIds.has(rsvp.id))}
                  />
                ))}
              </GroupSection>
            ))}
            {sections.ungrouped.length > 0 && (
              <GroupSection
                label="Ungrouped"
                size={sections.ungrouped.length}
                visibleCount={sections.ungrouped.length}
                muted
              >
                {sections.ungrouped.map((rsvp) => (
                  <GuestCard
                    key={rsvp.id}
                    rsvp={rsvp}
                    seatLabel={renderSeatLabel(rsvp)}
                    isSelected={selectedGuestId === rsvp.id}
                    onSelect={() =>
                      onSelectGuest(selectedGuestId === rsvp.id ? null : rsvp.id!)
                    }
                    groupSize={1}
                    isInDragGroup={!!(draggingRsvpIds && rsvp.id && draggingRsvpIds.has(rsvp.id))}
                  />
                ))}
              </GroupSection>
            )}
          </div>
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
                groupSize={1}
                isInDragGroup={!!(draggingRsvpIds && rsvp.id && draggingRsvpIds.has(rsvp.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ─── GroupBy selector ────────────────────────────────────────────────────────

function GroupBySelector({
  groupBy,
  setGroupBy,
}: {
  groupBy: GroupField[];
  setGroupBy: (next: GroupField[]) => void;
}) {
  const [expanded, setExpanded] = useState(groupBy.length > 0);

  const toggle = (field: GroupField) => {
    if (groupBy.includes(field)) {
      setGroupBy(groupBy.filter((f) => f !== field));
    } else if (groupBy.length < 2) {
      setGroupBy([...groupBy, field]);
    }
    // 3rd selection while 2 are active → no-op
  };

  // Collapsed: single pill showing summary. Expanded: row of toggleable chips.
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors w-full"
        style={{
          background: "var(--surface-2)",
          color: "var(--muted)",
          border: "1px dashed var(--border)",
        }}
        aria-expanded={false}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="21" y1="10" x2="3" y2="10" />
          <line x1="21" y1="6" x2="3" y2="6" />
          <line x1="21" y1="14" x2="3" y2="14" />
          <line x1="21" y1="18" x2="3" y2="18" />
        </svg>
        <span>Group by…</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
          Group by · pick up to 2
        </span>
        {groupBy.length > 0 ? (
          <button
            onClick={() => setGroupBy([])}
            className="text-[10px] cursor-pointer"
            style={{ color: "var(--accent)" }}
          >
            Clear
          </button>
        ) : (
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] cursor-pointer"
            style={{ color: "var(--muted)" }}
            aria-label="Hide group-by selector"
          >
            Hide
          </button>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {GROUP_FIELDS.map((field) => {
          const active = groupBy.includes(field.key);
          const disabled = !active && groupBy.length >= 2;
          return (
            <button
              key={field.key}
              onClick={() => toggle(field.key)}
              disabled={disabled}
              className="px-2 py-1 rounded-md text-[10px] font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed"
              style={{
                background: active ? "rgba(61,155,245,0.16)" : "var(--surface-2)",
                color: active ? "var(--accent)" : disabled ? "var(--muted-2, #4a4a4a)" : "var(--muted)",
                border: `1px solid ${active ? "rgba(61,155,245,0.45)" : "var(--border)"}`,
                opacity: disabled ? 0.4 : 1,
              }}
              aria-pressed={active}
            >
              {field.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section header (only when groupBy active) ───────────────────────────────

function GroupSection({
  label,
  size,
  visibleCount,
  muted,
  children,
}: {
  label: string;
  size: number;
  visibleCount: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  // Note in the header when the search filter is hiding some members so the
  // admin isn't surprised when drag picks up "more" guests than visible.
  const hidden = size - visibleCount;
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-1">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold truncate"
          style={{
            color: muted ? "var(--muted)" : "#fff",
            letterSpacing: "0.06em",
            flex: 1,
          }}
          title={label}
        >
          {label}
        </span>
        <span
          className="rounded-full"
          style={{
            fontSize: 9,
            padding: "1px 6px",
            background: muted ? "var(--surface-3)" : "rgba(61,155,245,0.16)",
            color: muted ? "var(--muted)" : "var(--accent)",
            fontFamily: "'Fira Code', monospace",
            minWidth: 18,
            textAlign: "center",
          }}
        >
          {size}
        </span>
        {hidden > 0 && (
          <span
            className="text-[9px]"
            style={{ color: "var(--muted)" }}
            title={`${hidden} hidden by search — still moves with the group on drag`}
          >
            +{hidden} hidden
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

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

// ─── GuestCard ───────────────────────────────────────────────────────────────

function GuestCard({
  rsvp,
  seatLabel,
  isSelected,
  onSelect,
  groupSize,
  isInDragGroup,
}: {
  rsvp: RSVP;
  seatLabel: string | null;
  isSelected: boolean;
  onSelect: () => void;
  /** Total size of the group this guest belongs to (1 = solo). Drives the
   *  left accent bar so admins can see at a glance which cards travel together. */
  groupSize: number;
  /** True when this card's id is part of the currently-dragged group. Used to
   *  paint the ghost (opacity 0.4) on all sibling cards, not just the dragged. */
  isInDragGroup: boolean;
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

  const showGroupBar = groupSize > 1;
  // The source card is dragging, OR a sibling in the same drag-group is —
  // either way the card should look ghosted so the admin sees the set.
  const ghosted = isDragging || isInDragGroup;

  return (
    <li
      ref={setNodeRef}
      style={{
        background: isSelected ? "rgba(61,155,245,0.10)" : "var(--surface-2)",
        border: `1px solid ${isSelected ? "rgba(61,155,245,0.45)" : "var(--border)"}`,
        borderRadius: 10,
        opacity: ghosted ? 0.4 : 1,
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
        transition: "border-color 120ms, background 120ms, opacity 120ms",
        position: "relative",
        overflow: "hidden",
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      {showGroupBar && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: "var(--accent)",
          }}
        />
      )}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
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
