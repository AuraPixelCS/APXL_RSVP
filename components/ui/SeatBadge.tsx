interface SeatBadgeProps {
  /** Pre-formatted assignment label, e.g. "T1", "V1", "T1-S3", "A3". */
  label: string | null;
  /** Render in gold (VIP tables) instead of the default blue. */
  vip?: boolean;
}

export default function SeatBadge({ label, vip = false }: SeatBadgeProps) {
  if (!label) {
    return <span style={{ color: "var(--muted-2)" }}>—</span>;
  }
  const palette = vip
    ? { background: "rgba(212,175,55,0.14)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.35)" }
    : { background: "rgba(61,155,245,0.12)", color: "var(--accent)", border: "1px solid rgba(61,155,245,0.2)" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold"
      style={palette}
    >
      {label}
    </span>
  );
}
