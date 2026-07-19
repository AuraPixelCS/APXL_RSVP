import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

// ─── Toast + Confirm system ───────────────────────────────────────────────────
//
// Replaces native alert()/confirm() across the app with a themed, non-blocking
// toast stack plus a promise-based confirm dialog. Mounted once at the app root
// (pages/_app.tsx) so any page — public or admin — can call useToast().

export type ToastTone = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red (deletes, irreversible sends). */
  tone?: "danger" | "default";
}

interface ConfirmState extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

interface ToastApi {
  /** Low-level push; returns the toast id. */
  push: (t: Omit<Toast, "id"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
  success: (title: string, message?: string) => number;
  error: (title: string, message?: string) => number;
  warning: (title: string, message?: string) => number;
  info: (title: string, message?: string) => number;
  /** Promise-based confirm — resolves true when confirmed, false when cancelled. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastTone, { color: string; bg: string; icon: ReactNode }> = {
  success: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.10)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  error: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.10)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
      </svg>
    ),
  },
  warning: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.10)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" />
      </svg>
    ),
  },
  info: {
    color: "var(--accent)",
    bg: "rgba(61,155,245,0.10)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastApi["push"]>(
    ({ duration, ...toast }) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const ms = duration ?? (toast.tone === "error" ? 7000 : 4500);
      if (ms > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
      return id;
    },
    [dismiss],
  );

  const confirm = useCallback<ToastApi["confirm"]>((opts) => {
    return new Promise<boolean>((resolve) => {
      const id = ++idRef.current;
      setConfirmState({ ...opts, id, resolve });
    });
  }, []);

  const closeConfirm = useCallback(
    (ok: boolean) => {
      setConfirmState((prev) => {
        prev?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, message) => push({ tone: "success", title, message }),
      error: (title, message) => push({ tone: "error", title, message }),
      warning: (title, message) => push({ tone: "warning", title, message }),
      info: (title, message) => push({ tone: "info", title, message }),
      confirm,
    }),
    [push, dismiss, confirm],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Toast stack */}
      <div
        className="fixed z-[100] flex flex-col gap-2 pointer-events-none"
        style={{ bottom: 20, right: 20, width: "min(360px, calc(100vw - 40px))" }}
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONE[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl p-3.5 shadow-lg"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${tone.color}`,
                }}
                role="status"
              >
                <span
                  className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                  style={{ width: 26, height: 26, background: tone.bg, color: tone.color }}
                >
                  {tone.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                    {t.title}
                  </p>
                  {t.message && (
                    <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--muted)" }}>
                      {t.message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 flex items-center justify-center rounded-md cursor-pointer transition-colors"
                  style={{ width: 20, height: 20, color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmState && (
          <motion.div
            key="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
            onClick={() => closeConfirm(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="confirm-title" className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
                {confirmState.title}
              </h2>
              {confirmState.message && (
                <p className="text-sm mt-2 leading-relaxed whitespace-pre-line" style={{ color: "var(--muted)" }}>
                  {confirmState.message}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  onClick={() => closeConfirm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150"
                  style={{ background: "var(--surface-2)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                >
                  {confirmState.cancelLabel ?? "Cancel"}
                </button>
                <button
                  autoFocus
                  onClick={() => closeConfirm(true)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150"
                  style={
                    confirmState.tone === "danger"
                      ? { background: "#ef4444", color: "#fff" }
                      : { background: "var(--accent)", color: "#000" }
                  }
                >
                  {confirmState.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
