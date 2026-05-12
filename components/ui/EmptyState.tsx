interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-white mb-1">{title}</p>
      {description && (
        <p className="text-xs max-w-xs" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
