import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useDebounce } from "use-debounce";
import StatusChip from "./StatusChip";
import SeatBadge from "./SeatBadge";
import { formatAssignment } from "@/lib/seatLabel";
import type { RSVP, RSVPStatus, FieldMapping, SeatingConfig } from "@/types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface RSVPTableProps {
  rsvps: RSVP[];
  onAllocate?: (rsvpId: string) => void;
  allocatingId?: string | null;
  onDeallocate?: (rsvpId: string) => void;
  deallocatingId?: string | null;
  onDeleteRsvp?: (rsvpId: string) => void;
  deletingRsvpId?: string | null;
  assignmentMode?: "seat" | "table";
  // Event seating context — needed to format the seat/table label consistently.
  seatingConfig?: SeatingConfig;
  totalSeats?: number;
  // Google Form mode
  googleFormMode?: boolean;
  formMappings?: FieldMapping[];
  starredFieldId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_FILTERS: { label: string; value: RSVPStatus | "all" }[] = [
  { label: "All",           value: "all"          },
  { label: "Pending",       value: "pending"      },
  { label: "Allocated",     value: "allocated"    },
  { label: "Checked In",    value: "checked_in"   },
  { label: "Not Attending", value: "not_attending"},
];

const SORT_OPTIONS: { label: string; value: "az" | "za" | "vip" }[] = [
  { label: "A–Z",       value: "az"  },
  { label: "Z–A",       value: "za"  },
  { label: "VIP first", value: "vip" },
];

function splitName(name: string): [string, string] {
  const idx = name.indexOf(" ");
  if (idx === -1) return [name, ""];
  return [name.slice(0, idx), name.slice(idx + 1)];
}

function extractExtra(message: string | undefined | null, label: string): string {
  if (!message) return "—";
  const match = message.match(new RegExp(`${label}:\\s*(.+)`));
  return match?.[1]?.trim() ?? "—";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Shared cell styles ───────────────────────────────────────────────────────

const TH = "text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider";
const TD = "px-4 py-3";

// ─── Info Modal ───────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 148, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--foreground)", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function RsvpInfoModal({ rsvp, onClose, assignmentMode, seatingConfig, totalSeats }: { rsvp: RSVP; onClose: () => void; assignmentMode?: "seat" | "table"; seatingConfig?: SeatingConfig; totalSeats?: number }) {
  const seatLabel = assignmentMode === "table" ? "Table" : "Seat";
  const assignment = formatAssignment(rsvp.seatNumber, { assignmentMode, totalSeats: totalSeats ?? 0, seatingConfig });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, width: "100%", maxWidth: 460, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{rsvp.name}</h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>{rsvp.email}</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "12px 20px 20px", overflowY: "auto", flex: 1 }}>
          <InfoRow label="Part Of" value={rsvp.partOf} />
          <InfoRow label="Company" value={rsvp.company} />
          <InfoRow label="Job Title" value={rsvp.jobTitle} />
          <InfoRow label="Industry" value={rsvp.industry} />
          <InfoRow label="Phone" value={rsvp.phone} />
          <InfoRow label={`${seatLabel}`} value={assignment ? assignment.long : null} />
          <InfoRow label="Allocated By" value={rsvp.allocatedBy?.displayName ?? null} />
          <InfoRow label="Dietary Restrictions" value={rsvp.dietaryRestrictions} />
          <InfoRow label="Message / Notes" value={rsvp.message} />
          <InfoRow label="Submitted" value={format(new Date(rsvp.submittedAt), "dd MMM yyyy, HH:mm")} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RSVPTable({
  rsvps,
  onAllocate,
  allocatingId,
  onDeallocate,
  deallocatingId,
  onDeleteRsvp,
  deletingRsvpId,
  assignmentMode,
  seatingConfig,
  totalSeats,
  googleFormMode = false,
  formMappings = [],
  starredFieldId = null,
}: RSVPTableProps) {
  const [search, setSearch]             = useState("");
  const [debouncedSearch]               = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<RSVPStatus | "all">("all");
  const [sortBy, setSortBy]             = useState<"default" | "az" | "za" | "vip">("default");
  const [infoRsvp, setInfoRsvp]         = useState<RSVP | null>(null);

  const filtered = useMemo(() => {
    let items = rsvps;
    if (statusFilter !== "all") items = items.filter((r) => r.status === statusFilter);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          r.company?.toLowerCase().includes(q) ||
          r.partOf?.toLowerCase().includes(q)
      );
    }
    if (sortBy !== "default") {
      items = [...items];
      if (sortBy === "az" || sortBy === "za") {
        items.sort((a, b) => a.name.localeCompare(b.name));
        if (sortBy === "za") items.reverse();
      } else if (sortBy === "vip") {
        const isVip = (r: RSVP) =>
          formatAssignment(r.seatNumber, { assignmentMode, totalSeats: totalSeats ?? 0, seatingConfig })?.isVip ? 0 : 1;
        items.sort((a, b) => isVip(a) - isVip(b));
      }
    }
    return items;
  }, [rsvps, statusFilter, debouncedSearch, sortBy, assignmentMode, totalSeats, seatingConfig]);

  // ── Derive column config from mappings ──────────────────────────────────────

  const firstNameMap = formMappings.find((m) => m.mapsTo === "firstName");
  const lastNameMap  = formMappings.find((m) => m.mapsTo === "lastName");
  const emailMap     = formMappings.find((m) => m.mapsTo === "email");
  const phoneMap     = formMappings.find((m) => m.mapsTo === "phone");
  const starredMap   = starredFieldId ? formMappings.find((m) => m.id === starredFieldId) : null;

  const splitNameCols = googleFormMode && firstNameMap && lastNameMap;
  const nameLabel     = googleFormMode
    ? (splitNameCols ? null : (firstNameMap?.formHeader ?? lastNameMap?.formHeader ?? "Name"))
    : "Name";
  const emailLabel    = googleFormMode ? (emailMap?.formHeader ?? "Email") : "Email";
  const phoneLabel    = googleFormMode ? (phoneMap?.formHeader ?? "Phone") : "Phone";
  const starredLabel  = starredMap ? (starredMap.extraLabel || starredMap.formHeader) : null;
  const seatLabel     = assignmentMode === "table" ? "Table" : "Seat";

  const colCount =
    1 + // #
    (splitNameCols ? 2 : 1) + // name
    1 + // email
    1 + // phone
    3 + // part of, company, job title (hidden mobile)
    1 + // seat
    1 + // submitted (hidden mobile)
    (starredLabel && googleFormMode ? 1 : 0) +
    1 + // status
    1;  // actions (always)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }}>
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search name, email, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-white transition-all duration-150"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
              style={{
                background: statusFilter === f.value ? "var(--accent-subtle)" : "transparent",
                color:      statusFilter === f.value ? "var(--accent)"        : "var(--muted)",
                border: `1px solid ${statusFilter === f.value ? "rgba(61,155,245,0.3)" : "transparent"}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 flex-wrap">
          {SORT_OPTIONS.map((s) => {
            const active = sortBy === s.value;
            const gold = s.value === "vip";
            return (
              <button
                key={s.value}
                onClick={() => setSortBy(active ? "default" : s.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
                style={{
                  background: active ? (gold ? "rgba(212,175,55,0.14)" : "var(--accent-subtle)") : "transparent",
                  color:      active ? (gold ? "#d4af37" : "var(--accent)") : "var(--muted)",
                  border: `1px solid ${active ? (gold ? "rgba(212,175,55,0.35)" : "rgba(61,155,245,0.3)") : "transparent"}`,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {googleFormMode && (
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px",
            background: "rgba(61,155,245,0.08)",
            border: "1px solid rgba(61,155,245,0.2)",
            borderRadius: 20,
            fontSize: 11, fontWeight: 500,
            color: "var(--accent)",
            whiteSpace: "nowrap",
          }}>
            <StarIcon /> Google Form columns
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <th className={TH} style={{ color: "var(--muted)", width: 40 }}>#</th>

                {splitNameCols ? (
                  <>
                    <th className={TH} style={{ color: "var(--muted)" }}>{firstNameMap!.formHeader}</th>
                    <th className={TH} style={{ color: "var(--muted)" }}>{lastNameMap!.formHeader}</th>
                  </>
                ) : (
                  <th className={TH} style={{ color: "var(--muted)" }}>{nameLabel}</th>
                )}

                <th className={TH} style={{ color: "var(--muted)" }}>{emailLabel}</th>
                <th className={TH} style={{ color: "var(--muted)" }}>{phoneLabel}</th>

                <th className={`${TH} hidden lg:table-cell`} style={{ color: "var(--muted)" }}>Part Of</th>
                <th className={`${TH} hidden lg:table-cell`} style={{ color: "var(--muted)" }}>Company</th>
                <th className={`${TH} hidden lg:table-cell`} style={{ color: "var(--muted)" }}>Job Title</th>

                <th className={TH} style={{ color: "var(--muted)" }}>{seatLabel}</th>

                <th className={`${TH} hidden lg:table-cell`} style={{ color: "var(--muted)" }}>Submitted</th>

                {starredLabel && googleFormMode && (
                  <th className={`${TH} hidden lg:table-cell`} style={{ color: "var(--accent)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <StarIcon /> {starredLabel}
                    </span>
                  </th>
                )}

                <th className={TH} style={{ color: "var(--muted)" }}>Status</th>
                <th className={`${TH} text-right`} style={{ color: "var(--muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filtered.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={colCount} className="px-4 py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
                      No RSVPs found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((rsvp, i) => {
                    const [firstName, lastName] = splitName(rsvp.name);
                    const starredValue = starredLabel ? extractExtra(rsvp.message, starredLabel) : "—";

                    return (
                      <motion.tr
                        key={rsvp.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="transition-colors duration-100"
                        style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      >
                        <td className={TD} style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>{i + 1}</td>

                        {splitNameCols ? (
                          <>
                            <td className={TD}><span className="text-sm font-medium text-white">{firstName}</span></td>
                            <td className={TD}><span className="text-sm text-white">{lastName}</span></td>
                          </>
                        ) : (
                          <td className={TD}><span className="text-sm font-medium text-white">{rsvp.name}</span></td>
                        )}

                        <td className={TD}><span className="text-xs text-white">{rsvp.email}</span></td>
                        <td className={TD}><span className="text-xs font-mono" style={{ color: "var(--muted)" }}>{rsvp.phone}</span></td>

                        <td className={`${TD} hidden lg:table-cell`} style={{ fontSize: 12, color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rsvp.partOf || "—"}
                        </td>
                        <td className={`${TD} hidden lg:table-cell`} style={{ fontSize: 12, color: "var(--foreground)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rsvp.company || "—"}
                        </td>
                        <td className={`${TD} hidden lg:table-cell`} style={{ fontSize: 12, color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rsvp.jobTitle || "—"}
                        </td>

                        <td className={TD}>{(() => {
                          const a = formatAssignment(rsvp.seatNumber, { assignmentMode, totalSeats: totalSeats ?? 0, seatingConfig });
                          return <SeatBadge label={a?.short ?? null} vip={a?.isVip} />;
                        })()}</td>

                        <td className={`${TD} hidden lg:table-cell`} style={{ fontSize: 12, fontFamily: "monospace", color: "var(--muted)" }}>
                          {format(new Date(rsvp.submittedAt), "dd MMM HH:mm")}
                        </td>

                        {starredLabel && googleFormMode && (
                          <td className={`${TD} hidden lg:table-cell`} style={{ fontSize: 12, color: "var(--foreground)" }}>
                            {starredValue}
                          </td>
                        )}

                        <td className={TD}><StatusChip status={rsvp.status} /></td>

                        {/* Actions */}
                        <td className={`${TD} text-right`}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setInfoRsvp(rsvp)}
                              title="View details"
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                color: "var(--muted)",
                                border: "1px solid var(--border)",
                                display: "inline-flex", alignItems: "center", gap: 4,
                              }}
                            >
                              <InfoIcon /> Info
                            </button>

                            {rsvp.status === "pending" && rsvp.attending && onAllocate && (
                              <button
                                onClick={() => onAllocate(rsvp.id!)}
                                disabled={allocatingId === rsvp.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                  background: "var(--accent-subtle)",
                                  color: "var(--accent)",
                                  border: "1px solid rgba(61,155,245,0.25)",
                                }}
                              >
                                {allocatingId === rsvp.id ? "Allocating…" : "Allocate"}
                              </button>
                            )}

                            {rsvp.status === "allocated" && onDeallocate && (
                              <button
                                onClick={() => onDeallocate(rsvp.id!)}
                                disabled={deallocatingId === rsvp.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-50"
                                style={{
                                  background: "rgba(239,68,68,0.08)",
                                  color: "#ef4444",
                                  border: "1px solid rgba(239,68,68,0.25)",
                                }}
                              >
                                {deallocatingId === rsvp.id ? "Cancelling…" : "Cancel"}
                              </button>
                            )}

                            {onDeleteRsvp && (
                              <button
                                onClick={() => onDeleteRsvp(rsvp.id!)}
                                disabled={deletingRsvpId === rsvp.id}
                                title="Delete RSVP"
                                className="flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-40"
                                style={{
                                  width: 28, height: 28,
                                  background: "rgba(239,68,68,0.06)",
                                  color: "#ef4444",
                                  border: "1px solid rgba(239,68,68,0.2)",
                                  flexShrink: 0,
                                }}
                              >
                                {deletingRsvpId === rsvp.id ? (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" style={{ animation: "spin 1s linear infinite" }} />
                                  </svg>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                    <path d="M9 6V4h6v2" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-right" style={{ color: "var(--muted)" }}>
        Showing {filtered.length} of {rsvps.length} RSVPs
      </p>

      {/* Info Modal */}
      <AnimatePresence>
        {infoRsvp && (
          <RsvpInfoModal
            rsvp={infoRsvp}
            onClose={() => setInfoRsvp(null)}
            assignmentMode={assignmentMode}
            seatingConfig={seatingConfig}
            totalSeats={totalSeats}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
