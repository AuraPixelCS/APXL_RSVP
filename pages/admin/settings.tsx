import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import { getEvents } from "@/lib/firestore";
import { db } from "@/lib/firebase";
import { getAuthHeaders } from "@/lib/auth";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Event, AdminUser } from "@/types";

// ─── Icons ────────────────────────────────────────────────────────────────────

function UserPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        style={{ animation: "spin 1s linear infinite" }} />
    </svg>
  );
}

// ─── Shared field style ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  transition: "border-color 150ms",
};

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
        onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
      />
    </div>
  );
}

// ─── Role Toggle ──────────────────────────────────────────────────────────────

function RoleToggle({ value, onChange }: { value: "admin" | "client"; onChange: (v: "admin" | "client") => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        Role
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        {(["admin", "client"] as const).map((role) => {
          const active = value === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => onChange(role)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 150ms",
                background: active ? (role === "admin" ? "rgba(61,155,245,0.15)" : "rgba(168,85,247,0.12)") : "var(--surface-2)",
                border: `1px solid ${active ? (role === "admin" ? "rgba(61,155,245,0.35)" : "rgba(168,85,247,0.3)") : "var(--border)"}`,
                color: active ? (role === "admin" ? "var(--accent)" : "#a855f7") : "var(--muted)",
              }}
            >
              {role === "admin" ? "Admin" : "Client"}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        {value === "admin"
          ? "Full access — can create events, manage users, send notifications."
          : "Limited access — can view and allocate seats, but cannot create events or send notifications."}
      </p>
    </div>
  );
}

// ─── Add User Panel ───────────────────────────────────────────────────────────

function AddUserPanel() {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirmPassword: "" });
  const [role, setRole] = useState<"admin" | "client">("client");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    setError(null);
    if (!form.email || !form.password) {
      setError("Email and password are required");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          displayName: form.displayName || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setSuccess(true);
      setForm({ displayName: "", email: "", password: "", confirmPassword: "" });
      setRole("client");
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-md">
      <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
        Creates a new user account that can log in to the RSVP dashboard. Choose the role carefully — admin users have full control.
      </p>

      <Field label="Display Name" value={form.displayName} onChange={(v) => update("displayName", v)} placeholder="e.g. Sarah" />
      <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} placeholder="user@example.com" />
      <Field label="Password" type="password" value={form.password} onChange={(v) => update("password", v)} placeholder="Min. 6 characters" />
      <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => update("confirmPassword", v)} placeholder="Re-enter password" />
      <RoleToggle value={role} onChange={setRole} />

      <AnimatePresence mode="wait">
        {error && (
          <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ fontSize: 13, color: "#ef4444", padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </motion.p>
        )}
        {success && (
          <motion.div key="ok" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#22c55e", padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <CheckIcon /> User account created successfully
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          padding: "11px 20px",
          borderRadius: 10,
          background: loading ? "var(--accent-subtle)" : "var(--accent)",
          color: loading ? "var(--accent)" : "#000",
          fontWeight: 600,
          fontSize: 14,
          border: "none",
          transition: "background 150ms, color 150ms",
          alignSelf: "flex-start",
        }}
      >
        {loading ? "Creating…" : "Create User"}
      </button>
    </div>
  );
}

// ─── Manage Users Panel ───────────────────────────────────────────────────────

function ManageUsersPanel() {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
      setUsers(snap.docs.map((d) => ({ ...(d.data() as AdminUser), uid: d.id })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (u: AdminUser) => {
    const confirmed = confirm(`Remove "${u.displayName || u.email}"?\n\nThis will permanently delete their account. They will no longer be able to log in.`);
    if (!confirmed) return;

    setDeletingUid(u.uid);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/delete-user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ uid: u.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      setUsers((prev) => prev.filter((x) => x.uid !== u.uid));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingUid(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
        {[1, 2].map((i) => (
          <div key={i} style={{ height: 60, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p style={{ fontSize: 13, color: "#ef4444", padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </p>
      )}

      {users.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted)", padding: "40px 0", textAlign: "center" }}>
          No users found. Users created via the "Add User" tab will appear here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <motion.div
              key={u.uid}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 16px",
                borderRadius: 12,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: u.role === "admin" ? "rgba(61,155,245,0.12)" : "rgba(168,85,247,0.1)",
                border: `1px solid ${u.role === "admin" ? "rgba(61,155,245,0.25)" : "rgba(168,85,247,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600,
                color: u.role === "admin" ? "var(--accent)" : "#a855f7",
              }}>
                {(u.displayName || u.email).charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.displayName || <span style={{ color: "var(--muted)", fontWeight: 400 }}>No name</span>}
                </p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email}
                </p>
              </div>

              {/* Role badge */}
              <div style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
                background: u.role === "admin" ? "rgba(61,155,245,0.1)" : "rgba(168,85,247,0.08)",
                color: u.role === "admin" ? "var(--accent)" : "#a855f7",
                border: `1px solid ${u.role === "admin" ? "rgba(61,155,245,0.2)" : "rgba(168,85,247,0.2)"}`,
                textTransform: "capitalize",
              }}>
                {u.role}
              </div>

              {/* Created date */}
              {u.createdAt && (
                <p style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>
                  {format(new Date(u.createdAt), "dd MMM yyyy")}
                </p>
              )}

              {/* Delete — disabled for self */}
              <button
                onClick={() => handleDelete(u)}
                disabled={deletingUid === u.uid || u.uid === currentUser?.uid}
                title={u.uid === currentUser?.uid ? "Cannot delete your own account" : "Remove user"}
                className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#ef4444",
                  transition: "background 150ms, border-color 150ms",
                }}
                onMouseEnter={(e) => {
                  if (u.uid !== currentUser?.uid) {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.14)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.4)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)";
                }}
              >
                {deletingUid === u.uid ? <SpinnerIcon /> : <TrashIcon />}
              </button>
            </motion.div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
        {users.length} user{users.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Event List Panel ─────────────────────────────────────────────────────────

function EventListPanel({ isAdmin }: { isAdmin: boolean }) {
  const [events, setEvents]       = useState<Event[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEvents();
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (event: Event) => {
    if (!event.id) return;
    const confirmed = confirm(
      `Delete "${event.title}"?\n\nThis will permanently remove the event and ALL its RSVPs. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(event.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/delete-event`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ eventId: event.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete event");
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 70, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p style={{ fontSize: 13, color: "#ef4444", padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </p>
      )}

      {events.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted)", padding: "40px 0", textAlign: "center" }}>
          No events yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <motion.div
              key={event.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 18px",
                borderRadius: 12,
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: event.isActive ? "#22c55e" : "var(--muted)",
                boxShadow: event.isActive ? "0 0 6px rgba(34,197,94,0.5)" : "none",
              }} />

              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {event.title}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                    <CalendarIcon />
                    {format(new Date(event.date), "dd MMM yyyy")}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--border)" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{event.venue}</span>
                  <span style={{ fontSize: 12, color: "var(--border)" }}>·</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{event.totalSeats} seats</span>
                </div>
              </div>

              <div style={{
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 500,
                background: event.isActive ? "rgba(34,197,94,0.08)" : "rgba(107,114,128,0.12)",
                color: event.isActive ? "#22c55e" : "var(--muted)",
                border: `1px solid ${event.isActive ? "rgba(34,197,94,0.2)" : "rgba(107,114,128,0.2)"}`,
                flexShrink: 0,
              }}>
                {event.isActive ? "Active" : "Inactive"}
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleDelete(event)}
                  disabled={deletingId === event.id}
                  title="Delete event"
                  className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#ef4444",
                    transition: "background 150ms, border-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.14)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.4)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.2)";
                  }}
                >
                  {deletingId === event.id ? <SpinnerIcon /> : <TrashIcon />}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
        {events.length} event{events.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "add-user" | "manage-users" | "event-list";

const ALL_TABS: { id: Tab; label: string; icon: () => React.ReactElement; description: string; adminOnly: boolean }[] = [
  {
    id: "add-user",
    label: "Add User",
    icon: UserPlusIcon,
    description: "Create admin or client account",
    adminOnly: true,
  },
  {
    id: "manage-users",
    label: "Manage Users",
    icon: UsersIcon,
    description: "View and remove user accounts",
    adminOnly: true,
  },
  {
    id: "event-list",
    label: "Event List",
    icon: ListIcon,
    description: "View and manage events",
    adminOnly: false,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

const SettingsPage: NextPageWithLayout = () => {
  const { role } = useAuthContext();
  const isAdmin = role === "admin";

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState<Tab>("event-list");

  // If admin, default to add-user tab; otherwise event-list
  useEffect(() => {
    setActiveTab(isAdmin ? "add-user" : "event-list");
  }, [isAdmin]);

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Settings</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {isAdmin ? "Manage users, access, and events" : "View events"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Role badge */}
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8, letterSpacing: "0.03em",
            background: isAdmin ? "rgba(61,155,245,0.1)" : "rgba(168,85,247,0.08)",
            color: isAdmin ? "var(--accent)" : "#a855f7",
            border: `1px solid ${isAdmin ? "rgba(61,155,245,0.2)" : "rgba(168,85,247,0.2)"}`,
            textTransform: "capitalize",
          }}>
            {role ?? "…"}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "var(--accent)",
            background: "var(--accent-subtle)", border: "1px solid rgba(61,155,245,0.25)",
            borderRadius: 8, padding: "3px 10px", letterSpacing: "0.03em",
          }}>
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </span>
        </div>
      </div>

      {/* Tab cards */}
      <div className={`grid gap-3 ${tabs.length === 3 ? "grid-cols-3" : tabs.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="cursor-pointer text-left"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 14,
                background: active ? "var(--accent-subtle)" : "var(--surface)",
                border: `1px solid ${active ? "rgba(61,155,245,0.35)" : "var(--border)"}`,
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(61,155,245,0.2)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: active ? "rgba(61,155,245,0.15)" : "var(--surface-2)",
                border: `1px solid ${active ? "rgba(61,155,245,0.25)" : "var(--border)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: active ? "var(--accent)" : "var(--muted)",
                transition: "all 150ms",
              }}>
                <Icon />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: active ? "var(--accent)" : "#fff", transition: "color 150ms" }}>
                  {tab.label}
                </p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>
                  {tab.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      <div style={{ padding: "24px", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "add-user" && <AddUserPanel />}
            {activeTab === "manage-users" && <ManageUsersPanel />}
            {activeTab === "event-list" && <EventListPanel isAdmin={isAdmin} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

SettingsPage.getLayout = (page) => (
  <AdminLayout title="Settings — AuraPixel RSVP">{page}</AdminLayout>
);

export default SettingsPage;
