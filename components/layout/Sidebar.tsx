import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import { useAuthContext } from "@/contexts/AuthContext";
import { useState } from "react";

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ label }: { label: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left: "calc(100% + 10px)",
        top: "50%",
        transform: "translateY(-50%)",
        background: "rgba(15,15,20,0.95)",
        color: "#fff",
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 10px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        pointerEvents: "none",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: 100,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </span>
  );
}

// ─── Nav button ───────────────────────────────────────────────────────────────

function NavBtn({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      style={{ position: "relative", display: "block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 10,
          margin: "0 auto",
          background: active ? "var(--accent-subtle)" : "transparent",
          border: active ? "1px solid rgba(61,155,245,0.3)" : "1px solid transparent",
          color: active ? "var(--accent)" : "var(--muted)",
          cursor: "pointer",
          transition: "background 150ms, color 150ms, border-color 150ms",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--muted)";
          }
        }}
      >
        {icon}
      </span>
      {hovered && <Tooltip label={label} />}
    </Link>
  );
}

// ─── Icon-only action button (no href) ────────────────────────────────────────

function ActionBtn({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      style={{ position: "relative", display: "block", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 10,
          margin: "0 auto",
          background: "transparent",
          border: "1px solid transparent",
          color: danger ? "rgba(239,68,68,0.7)" : "var(--muted)",
          transition: "background 150ms, color 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = danger
            ? "rgba(239,68,68,0.08)"
            : "var(--surface-3)";
          (e.currentTarget as HTMLElement).style.color = danger ? "#ef4444" : "#fff";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = danger
            ? "rgba(239,68,68,0.7)"
            : "var(--muted)";
        }}
      >
        {icon}
      </span>
      {hovered && <Tooltip label={label} />}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar() {
  const router = useRouter();
  const { signOut, user } = useAuthContext();
  const [logoHovered, setLogoHovered] = useState(false);

  const isActive = (href: string) => {
    if (href === "/admin") return router.pathname === "/admin";
    return router.pathname.startsWith(href);
  };

  const SIDEBAR_W = 64;

  return (
    <motion.aside
      initial={{ x: -SIDEBAR_W, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        height: "100%",
        width: SIDEBAR_W,
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        overflow: "visible",
      }}
    >
      {/* Logo — centered square brand mark with subtle separator */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 72,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: "1px solid var(--border)",
        }}
        onMouseEnter={() => setLogoHovered(true)}
        onMouseLeave={() => setLogoHovered(false)}
      >
        <Image
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ap-logo-small.png`}
          alt="AuraPixel"
          width={40}
          height={40}
          style={{
            width: 40,
            height: 40,
            display: "block",
            objectFit: "contain",
          }}
          priority
        />
        {logoHovered && (
          <span
            style={{
              position: "absolute",
              left: "calc(100% + 10px)",
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(15,15,20,0.95)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              padding: "4px 10px",
              borderRadius: 6,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 100,
            }}
          >
            AuraPixel RSVP
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", flexShrink: 0 }} />

      {/* Top nav */}
      <nav
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "12px 0",
          alignItems: "center",
          overflowY: "auto",
        }}
      >
        <NavBtn href="/admin"            icon={<CalendarIcon />} label="Events"    active={isActive("/admin")} />
        <NavBtn href="/admin/dashboard"  icon={<ChartIcon />}    label="Dashboard" active={isActive("/admin/dashboard")} />
        <NavBtn href="/admin/settings"   icon={<SettingsIcon />} label="Settings"  active={isActive("/admin/settings")} />
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--border)", flexShrink: 0 }} />

      {/* Bottom: user avatar + logout */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "12px 0",
          alignItems: "center",
        }}
      >
        {/* User avatar */}
        {user && <UserAvatar email={user.email ?? ""} />}

        <ActionBtn onClick={signOut} icon={<LogOutIcon />} label="Sign Out" danger />
      </div>
    </motion.aside>
  );
}

function UserAvatar({ email }: { email: string }) {
  const [avatarHovered, setAvatarHovered] = useState(false);
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setAvatarHovered(true)}
      onMouseLeave={() => setAvatarHovered(false)}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          background: "var(--accent)",
          color: "#000",
          cursor: "default",
          userSelect: "none",
        }}
      >
        {email[0]?.toUpperCase()}
      </div>
      {avatarHovered && <Tooltip label={email} />}
    </div>
  );
}
