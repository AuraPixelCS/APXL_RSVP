import type { RSVPStatus } from "@/types";

interface StatusChipProps {
  status: RSVPStatus;
}

const CONFIG: Record<RSVPStatus, { label: string; bg: string; color: string }> = {
  pending: {
    label: "Pending",
    bg: "rgba(245,158,11,0.12)",
    color: "#f59e0b",
  },
  allocated: {
    label: "Allocated",
    bg: "rgba(34,197,94,0.12)",
    color: "#22c55e",
  },
  checked_in: {
    label: "Checked In",
    bg: "rgba(61,155,245,0.14)",
    color: "#3d9bf5",
  },
  not_attending: {
    label: "Not Attending",
    bg: "rgba(107,114,128,0.14)",
    color: "#6b7280",
  },
};

export default function StatusChip({ status }: StatusChipProps) {
  const { label, bg, color } = CONFIG[status] ?? CONFIG.pending;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-mono"
      style={{ background: bg, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}
