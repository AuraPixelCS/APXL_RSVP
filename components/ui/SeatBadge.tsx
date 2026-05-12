interface SeatBadgeProps {
  seat: number | null;
}

export default function SeatBadge({ seat }: SeatBadgeProps) {
  if (seat == null) {
    return <span style={{ color: "var(--muted-2)" }}>—</span>;
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-semibold"
      style={{
        background: "rgba(61,155,245,0.12)",
        color: "var(--accent)",
        border: "1px solid rgba(61,155,245,0.2)",
      }}
    >
      #{String(seat).padStart(3, "0")}
    </span>
  );
}
