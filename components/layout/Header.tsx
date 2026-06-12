import { useRouter } from "next/router";
import { useState } from "react";
import { useAuthContext } from "@/contexts/AuthContext";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

function deriveBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: BreadcrumbSegment[] = [{ label: "Home", href: "/admin" }];

  if (segments.length <= 1) return crumbs;

  if (segments[1] === "dashboard") {
    crumbs.push({ label: "Dashboard" });
  } else if (segments[1] === "events") {
    crumbs.push({ label: "Events", href: "/admin" });
    if (segments[2]) crumbs.push({ label: "Event Detail" });
  }

  return crumbs;
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

/** Monospace, copy-to-clipboard chip surfacing the current event ID. */
function EventIdChip({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Event ID copied to clipboard" : `Copy event ID ${eventId}`}
      title={copied ? "Copied!" : "Copy event ID"}
      className="group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-xs cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d9bf5]"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <span className="uppercase tracking-wider text-[10px]" style={{ color: "var(--muted-2)" }}>ID</span>
      <span className="text-white max-w-[160px] truncate">{eventId}</span>
      <span className="transition-colors duration-150" style={{ color: copied ? "#22c55e" : "var(--accent)" }}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </span>
    </button>
  );
}

export default function Header() {
  const router = useRouter();
  const { user } = useAuthContext();
  const crumbs = deriveBreadcrumbs(router.pathname);
  // Present on every /admin/events/[id] route (detail, seat-map, notifications).
  const eventId = typeof router.query.id === "string" ? router.query.id : null;

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-6"
      style={{
        height: "var(--header-height)",
        background: "rgba(13, 13, 13, 0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span style={{ color: "var(--muted-2)" }}>
                <ChevronIcon />
              </span>
            )}
            {crumb.href && i < crumbs.length - 1 ? (
              <button
                onClick={() => router.push(crumb.href!)}
                className="text-sm cursor-pointer hover:text-white transition-colors duration-150"
                style={{ color: "var(--muted)" }}
              >
                {crumb.label}
              </button>
            ) : (
              <span className="text-sm font-medium text-white">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Admin user — sign-out lives in the sidebar */}
      <div className="flex items-center gap-3">
        {eventId && <EventIdChip eventId={eventId} />}
        <span className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>
          {user?.email}
        </span>
      </div>
    </header>
  );
}
