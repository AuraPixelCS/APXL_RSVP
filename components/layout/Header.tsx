import { useRouter } from "next/router";
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

export default function Header() {
  const router = useRouter();
  const { user, signOut } = useAuthContext();
  const crumbs = deriveBreadcrumbs(router.pathname);

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

      {/* Admin user */}
      <div className="flex items-center gap-3">
        <span className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>
          {user?.email}
        </span>
        <button
          onClick={signOut}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer"
          style={{
            background: "var(--surface-2)",
            color: "var(--muted)",
            border: "1px solid var(--border)",
          }}
          title="Sign out"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
