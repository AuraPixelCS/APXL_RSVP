import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { collection, getDocs, getCountFromServer, orderBy, query } from "firebase/firestore";
import { updateProfile, sendPasswordResetEmail } from "firebase/auth";
import type { NextPageWithLayout } from "@/pages/_app";
import AdminLayout from "@/components/layout/AdminLayout";
import { getEvents } from "@/lib/firestore";
import { db, auth } from "@/lib/firebase";
import { getAuthHeaders } from "@/lib/auth";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Event, AdminUser } from "@/types";

// ─── Icons ────────────────────────────────────────────────────────────────────

function UsersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ListIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function UserIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CogIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function ReportIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="18" x2="8" y2="14" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="16" y1="18" x2="16" y2="16" />
    </svg>
  );
}

function CalendarIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.7s linear infinite" }}>
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    </svg>
  );
}

// ─── Field primitives ─────────────────────────────────────────────────────────

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
  label, type = "text", value, onChange, placeholder, readOnly,
}: {
  label: string;
  type?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ ...inputStyle, opacity: readOnly ? 0.7 : 1, cursor: readOnly ? "default" : "text" }}
        onFocus={(e) => { if (!readOnly) e.target.style.borderColor = "var(--accent)"; }}
        onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
      />
    </div>
  );
}

function RoleToggle({ value, onChange }: { value: "admin" | "client"; onChange: (v: "admin" | "client") => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
                flex: 1, padding: "9px 0", borderRadius: 10,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
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

// ─── Inline Add User form ─────────────────────────────────────────────────────

function AddUserInlineForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirmPassword: "" });
  const [role, setRole] = useState<"admin" | "client">("client");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    setError(null);
    if (!form.email || !form.password) { setError("Email and password are required"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }

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
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      style={{ overflow: "hidden" }}
    >
      <div
        className="flex flex-col gap-4 p-4 rounded-xl"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Add a user</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
              Creates a new login. Admins can manage everything; clients are view + allocate only.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Display Name" value={form.displayName} onChange={(v) => update("displayName", v)} placeholder="e.g. Sarah" />
          <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} placeholder="user@example.com" />
          <Field label="Password" type="password" value={form.password} onChange={(v) => update("password", v)} placeholder="Min. 6 characters" />
          <Field label="Confirm Password" type="password" value={form.confirmPassword} onChange={(v) => update("confirmPassword", v)} placeholder="Re-enter password" />
        </div>
        <RoleToggle value={role} onChange={setRole} />

        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
            style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              background: loading ? "var(--accent-subtle)" : "var(--accent)",
              color: loading ? "var(--accent)" : "#000",
              fontWeight: 600, fontSize: 13, border: "none",
            }}
          >
            {loading ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Users Panel (combined) ───────────────────────────────────────────────────

function UsersPanel() {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

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
    const confirmed = confirm(`Remove "${u.displayName || u.email}"?\n\nThis will permanently delete their account.`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingUid(null);
    }
  };

  const handleCreated = async () => {
    setAdding(false);
    setJustCreated(true);
    setTimeout(() => setJustCreated(false), 3500);
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Users</h2>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
            {users.length} {users.length === 1 ? "user" : "users"} with access to this workspace
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            <PlusIcon />
            Add user
          </button>
        )}
      </div>

      <AnimatePresence>
        {adding && (
          <AddUserInlineForm
            key="add-form"
            onCreated={handleCreated}
            onCancel={() => setAdding(false)}
          />
        )}
        {justCreated && !adding && (
          <motion.div
            key="just-created"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#22c55e", padding: "8px 12px", borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
          >
            <CheckIcon /> User created successfully
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div key={i} style={{ height: 60, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--muted)" }}>
          No users yet. Click <strong style={{ color: "#fff" }}>Add user</strong> to create the first one.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {users.map((u) => (
              <motion.div
                key={u.uid}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", borderRadius: 12,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: u.role === "admin" ? "rgba(61,155,245,0.12)" : "rgba(168,85,247,0.1)",
                  border: `1px solid ${u.role === "admin" ? "rgba(61,155,245,0.25)" : "rgba(168,85,247,0.2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 600,
                  color: u.role === "admin" ? "var(--accent)" : "#a855f7",
                }}>
                  {(u.displayName || u.email).charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.displayName || <span style={{ color: "var(--muted)", fontWeight: 400 }}>No name</span>}
                    {u.uid === currentUser?.uid && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>· you</span>}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.email}
                  </p>
                </div>

                <div style={{
                  padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, flexShrink: 0,
                  background: u.role === "admin" ? "rgba(61,155,245,0.1)" : "rgba(168,85,247,0.08)",
                  color: u.role === "admin" ? "var(--accent)" : "#a855f7",
                  border: `1px solid ${u.role === "admin" ? "rgba(61,155,245,0.2)" : "rgba(168,85,247,0.2)"}`,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {u.role}
                </div>

                {u.createdAt && (
                  <p style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0, fontFamily: "'Fira Code', monospace" }}>
                    {format(new Date(u.createdAt), "dd MMM yyyy")}
                  </p>
                )}

                <button
                  onClick={() => handleDelete(u)}
                  disabled={deletingUid === u.uid || u.uid === currentUser?.uid}
                  title={u.uid === currentUser?.uid ? "Cannot delete your own account" : "Remove user"}
                  className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    color: "#ef4444",
                    transition: "background 150ms, border-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    if (u.uid !== currentUser?.uid) {
                      e.currentTarget.style.background = "rgba(239,68,68,0.14)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(239,68,68,0.06)";
                    e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)";
                  }}
                >
                  {deletingUid === u.uid ? <SpinnerIcon /> : <TrashIcon />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Account Panel ────────────────────────────────────────────────────────────

function AccountPanel() {
  const { user, role, signOut } = useAuthContext();
  const initialName = user?.displayName ?? "";
  const [displayName, setDisplayName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [savedName, setSavedName] = useState(initialName);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep displayName in sync with user.displayName when Firebase loads it
  useEffect(() => {
    const fb = user?.displayName ?? "";
    setSavedName(fb);
    setDisplayName(fb);
  }, [user?.displayName]);

  const dirty = displayName.trim() !== savedName.trim();

  const handleSave = async () => {
    if (!user || !dirty) return;
    setError(null);
    setSaving(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() || null });
      setSavedName(displayName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setError(null);
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-white">Account</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
          Your profile, password, and session.
        </p>
      </div>

      {/* Profile card */}
      <div
        className="rounded-xl p-5 flex flex-col gap-5"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: role === "admin" ? "rgba(61,155,245,0.12)" : "rgba(168,85,247,0.1)",
              border: `1px solid ${role === "admin" ? "rgba(61,155,245,0.3)" : "rgba(168,85,247,0.25)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 600,
              color: role === "admin" ? "var(--accent)" : "#a855f7",
              flexShrink: 0,
            }}
          >
            {(savedName || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{savedName || user?.email}</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
              Signed in as <span style={{ textTransform: "capitalize", color: role === "admin" ? "var(--accent)" : "#a855f7", fontWeight: 600 }}>{role ?? "…"}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Display Name" value={displayName} onChange={setDisplayName} placeholder="Your name" />
          <Field label="Email" type="email" value={user?.email ?? ""} readOnly />
        </div>

        <div
          className="flex items-center justify-between gap-3 pt-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-[11px]" style={{ color: dirty ? "#f59e0b" : "var(--muted)" }}>
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{
              background: dirty ? "var(--accent)" : "var(--surface-3)",
              color: dirty ? "#000" : "var(--muted)",
              border: "1px solid var(--border)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Password card — single-row layout matches Session below */}
      <div
        className="rounded-xl p-5 flex items-center justify-between gap-4"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Password</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
            Sends a reset link to your email. Click the link to set a new password.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AnimatePresence>
            {resetSent && (
              <motion.span
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs flex items-center gap-1"
                style={{ color: "#22c55e" }}
              >
                <CheckIcon size={12} /> Email sent
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={handlePasswordReset}
            disabled={resetSending || !user?.email}
            className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
            style={{ background: "var(--surface-3)", color: "#fff", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => { if (!resetSending && user?.email) e.currentTarget.style.background = "var(--surface)"; }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
          >
            {resetSending ? "Sending…" : "Send Reset Email"}
          </button>
        </div>
      </div>

      {/* Session card — same layout as Password card */}
      <div
        className="rounded-xl p-5 flex items-center justify-between gap-4"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Session</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
            Sessions auto-expire after 12 hours.
          </p>
        </div>
        <button
          onClick={signOut}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.16)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
        >
          Sign Out
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Workspace Panel ──────────────────────────────────────────────────────────

function WorkspacePanel() {
  const { role } = useAuthContext();
  const isAdmin = role === "admin";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "—";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "—";
  const [stats, setStats] = useState<{ events: number | null; users: number | null; loading: boolean }>({
    events: null, users: null, loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const eventsSnap = await getCountFromServer(collection(db, "events"));
        const eventsCount = eventsSnap.data().count;
        let usersCount: number | null = null;
        if (isAdmin) {
          try {
            const usersSnap = await getCountFromServer(collection(db, "users"));
            usersCount = usersSnap.data().count;
          } catch {}
        }
        if (!cancelled) setStats({ events: eventsCount, users: usersCount, loading: false });
      } catch {
        if (!cancelled) setStats({ events: null, users: null, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const loginTime = (() => {
    if (typeof window === "undefined") return null;
    try {
      const ts = localStorage.getItem("auth_login_time");
      if (!ts) return null;
      return new Date(parseInt(ts, 10));
    } catch { return null; }
  })();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-white">Workspace</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
          System info and metadata about this RSVP workspace.
        </p>
      </div>

      {/* System info — uniform 3-column row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="App Version" value={`v${version}`} mono />
        <InfoCard label="Firebase Project" value={projectId} mono />
        <InfoCard
          label="Signed In"
          value={loginTime ? format(loginTime, "dd MMM, HH:mm") : "—"}
          mono
        />
      </div>

      {/* Counts — clean 2-col row (admin) or full-width (non-admin), so no
          orphan cell either way. Larger numbers signal these as primary metrics. */}
      <div className={`grid gap-3 ${isAdmin ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        <InfoCard
          label="Total Events"
          value={stats.loading ? "…" : stats.events != null ? String(stats.events) : "—"}
          mono
          emphasis
        />
        {isAdmin && (
          <InfoCard
            label="Total Users"
            value={stats.loading ? "…" : stats.users != null ? String(stats.users) : "—"}
            mono
            emphasis
          />
        )}
      </div>

      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: "var(--surface-2)", border: "1px dashed var(--border)" }}
      >
        <span style={{ color: "var(--muted)", marginTop: 2, flexShrink: 0 }}>
          <CogIcon size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Workspace defaults are configured per-event</p>
          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
            Email banners, body copy, and seating layouts live on each event under{" "}
            <strong style={{ color: "#fff" }}>Notifications</strong> and{" "}
            <strong style={{ color: "#fff" }}>Manage Seating</strong> respectively.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, mono, emphasis }: { label: string; value: string; mono?: boolean; emphasis?: boolean }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <p
        className="text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--muted)", letterSpacing: "0.1em" }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 truncate"
        style={{
          color: "#fff",
          fontFamily: mono ? "'Fira Code', monospace" : undefined,
          fontSize: emphasis ? 22 : 14,
          fontWeight: emphasis ? 700 : 600,
          lineHeight: 1.2,
        }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Derived event status ─────────────────────────────────────────────────────
// The stored `isActive` flag only says whether an event is enabled — it never
// expires on its own. So an event whose date has passed still reads "Active".
// Derive a real status: a past-dated event is "Completed" regardless of the
// flag; otherwise it's "Active" / "Inactive" per the flag.

type DerivedStatusKey = "completed" | "active" | "inactive";

interface DerivedStatus {
  key: DerivedStatusKey;
  label: string;
  dot: string;        // status-dot colour
  glow: boolean;      // soft glow on the dot (live events only)
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
}

function getEventStatus(event: Event): DerivedStatus {
  // Treat the event as live through the end of its own calendar day (local tz),
  // so a 7pm event isn't marked "Completed" at 9am the same morning.
  const endOfEventDay = new Date(`${event.date}T23:59:59`).getTime();
  const isPast = Number.isFinite(endOfEventDay) && endOfEventDay < Date.now();

  if (isPast) {
    return {
      key: "completed",
      label: "Completed",
      dot: "#3d9bf5",
      glow: false,
      badgeBg: "rgba(61,155,245,0.08)",
      badgeColor: "#3d9bf5",
      badgeBorder: "rgba(61,155,245,0.22)",
    };
  }
  if (event.isActive) {
    return {
      key: "active",
      label: "Active",
      dot: "#22c55e",
      glow: true,
      badgeBg: "rgba(34,197,94,0.08)",
      badgeColor: "#22c55e",
      badgeBorder: "rgba(34,197,94,0.2)",
    };
  }
  return {
    key: "inactive",
    label: "Inactive",
    dot: "var(--muted)",
    glow: false,
    badgeBg: "rgba(107,114,128,0.12)",
    badgeColor: "var(--muted)",
    badgeBorder: "rgba(107,114,128,0.2)",
  };
}

// ─── Event List Panel (kept, lightly polished) ────────────────────────────────

function EventListPanel({ isAdmin }: { isAdmin: boolean }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleReport = async (event: Event) => {
    if (!event.id) return;
    setReportingId(event.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/event-report?eventId=${encodeURIComponent(event.id)}`,
        { headers }
      );
      if (!res.ok) {
        let msg = "Failed to generate report";
        try { const d = await res.json(); msg = d.error || msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition");
      const m = cd ? /filename="?([^"]+)"?/.exec(cd) : null;
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? m[1] : `${event.title}-Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReportingId(null);
    }
  };

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Event List</h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
          {events.length} {events.length === 1 ? "event" : "events"} in the workspace. Use this view to delete events permanently.
        </p>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#ef4444", padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 56, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "var(--muted)" }}>No events yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {events.map((event) => {
              const status = getEventStatus(event);
              return (
              <motion.div
                key={event.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 14px", borderRadius: 12,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: status.dot,
                  boxShadow: status.glow ? "0 0 6px rgba(34,197,94,0.5)" : "none",
                }} />

                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {event.title}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted)" }}>
                      <CalendarIcon />
                      {format(new Date(event.date), "dd MMM yyyy")}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{event.venue || "—"}</span>
                    <span style={{ fontSize: 11, color: "var(--border)" }}>·</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{event.totalSeats} seats</span>
                  </div>
                </div>

                <div style={{
                  padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: status.badgeBg,
                  color: status.badgeColor,
                  border: `1px solid ${status.badgeBorder}`,
                  flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {status.label}
                </div>

                <button
                  onClick={() => handleReport(event)}
                  disabled={reportingId === event.id}
                  title="Generate a branded PDF report for this event"
                  className="cursor-pointer disabled:opacity-60 disabled:cursor-wait transition-all"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
                    padding: "6px 11px", borderRadius: 8,
                    background: "var(--accent-subtle)",
                    border: "1px solid rgba(61,155,245,0.3)",
                    color: "var(--accent)",
                    fontSize: 12, fontWeight: 600,
                  }}
                  onMouseEnter={(e) => {
                    if (reportingId !== event.id) {
                      e.currentTarget.style.background = "rgba(61,155,245,0.18)";
                      e.currentTarget.style.borderColor = "rgba(61,155,245,0.5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--accent-subtle)";
                    e.currentTarget.style.borderColor = "rgba(61,155,245,0.3)";
                  }}
                >
                  {reportingId === event.id ? <SpinnerIcon /> : <ReportIcon />}
                  {reportingId === event.id ? "Generating…" : "Report"}
                </button>

                {isAdmin && (
                  <button
                    onClick={() => handleDelete(event)}
                    disabled={deletingId === event.id}
                    title="Delete event"
                    className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      color: "#ef4444",
                      transition: "background 150ms, border-color 150ms",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.14)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.06)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)";
                    }}
                  >
                    {deletingId === event.id ? <SpinnerIcon /> : <TrashIcon />}
                  </button>
                )}
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "users" | "account" | "workspace" | "event-list";

interface TabDef {
  id: Tab;
  label: string;
  description: string;
  icon: (props: { size?: number }) => React.ReactElement;
  adminOnly: boolean;
}

const ALL_TABS: TabDef[] = [
  { id: "users",      label: "Users",      description: "Invite and remove people",   icon: UsersIcon,    adminOnly: true },
  { id: "account",    label: "Account",    description: "Your profile and password",  icon: UserIcon,     adminOnly: false },
  { id: "workspace",  label: "Workspace",  description: "Version and system info",    icon: CogIcon,      adminOnly: false },
  { id: "event-list", label: "Event List", description: "Delete events permanently",  icon: ListIcon,     adminOnly: false },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

const SettingsPage: NextPageWithLayout = () => {
  const { role } = useAuthContext();
  const isAdmin = role === "admin";

  const visibleTabs = useMemo(() => ALL_TABS.filter((t) => !t.adminOnly || isAdmin), [isAdmin]);
  const [requestedTab, setRequestedTab] = useState<Tab>("account");
  // Derived (no setState-in-effect): if the user's choice isn't visible, fall back to first visible
  const activeTab: Tab = visibleTabs.some((t) => t.id === requestedTab)
    ? requestedTab
    : (visibleTabs[0]?.id ?? "account");

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Settings</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Manage your account, users, and workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, letterSpacing: "0.06em",
            background: isAdmin ? "rgba(61,155,245,0.1)" : "rgba(168,85,247,0.08)",
            color: isAdmin ? "var(--accent)" : "#a855f7",
            border: `1px solid ${isAdmin ? "rgba(61,155,245,0.2)" : "rgba(168,85,247,0.2)"}`,
            textTransform: "uppercase",
          }}>
            {role ?? "…"}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: "var(--muted)",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "3px 9px", letterSpacing: "0.05em",
            fontFamily: "'Fira Code', monospace",
          }}>
            v{process.env.NEXT_PUBLIC_APP_VERSION}
          </span>
        </div>
      </div>

      {/* Layout: vertical nav rail (lg+) + content. Mobile = horizontal pills + content. */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Nav */}
        <nav
          className="lg:w-56 shrink-0 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible"
          role="tablist"
          aria-label="Settings sections"
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setRequestedTab(tab.id)}
                className="cursor-pointer text-left shrink-0 transition-all"
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 10,
                  background: active ? "var(--accent-subtle)" : "transparent",
                  border: `1px solid ${active ? "rgba(61,155,245,0.3)" : "transparent"}`,
                  color: active ? "var(--accent)" : "var(--muted)",
                  minWidth: 140,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--surface-2)";
                    e.currentTarget.style.color = "#fff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--muted)";
                  }
                }}
              >
                <span style={{ display: "inline-flex", flexShrink: 0 }}>
                  <Icon />
                </span>
                <div className="min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "inherit" }}>{tab.label}</p>
                  <p className="hidden lg:block" style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>
                    {tab.description}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div
          className="flex-1 min-w-0 rounded-xl p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === "users" && <UsersPanel />}
              {activeTab === "account" && <AccountPanel />}
              {activeTab === "workspace" && <WorkspacePanel />}
              {activeTab === "event-list" && <EventListPanel isAdmin={isAdmin} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

SettingsPage.getLayout = (page) => (
  <AdminLayout title="Settings — AuraPixel RSVP">{page}</AdminLayout>
);

export default SettingsPage;
