import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";

function EyeIcon({ show }: { show: boolean }) {
  return show ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/admin");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

  return (
    <div className="relative w-full max-w-sm">
      {/* Ambient accent-blue radial glow behind the card */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(61,155,245,0.22) 0%, rgba(61,155,245,0.06) 45%, transparent 75%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center"
      >
        {/* Brand logo — large, prominent, no filter (new asset is correctly colored) */}
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          className="mb-8"
        >
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/aurapixel-tight.png`}
            alt="AuraPixel"
            width={180}
            height={116}
            priority
            style={{ width: 160, height: "auto", display: "block" }}
          />
        </motion.div>

        {/* Card */}
        <div
          className="w-full rounded-2xl p-7 space-y-6"
          style={{
            background: "rgba(20,20,20,0.72)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(61,155,245,0.18)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg text-sm text-white transition-all duration-150"
                  style={{
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--accent)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(61,155,245,0.18)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-150"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  <EyeIcon show={showPw} />
                </button>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#fca5a5",
                  }}
                >
                  <svg className="shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: "var(--accent)",
                color: "#000",
                padding: "11px 0",
              }}
            >
              {loading && (
                <span
                  className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: "rgba(0,0,0,0.4)", borderTopColor: "transparent" }}
                />
              )}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-[10px] mt-5 text-center" style={{ color: "var(--muted)", letterSpacing: "0.05em" }}>
          AuraPixel RSVP Platform{version ? ` · v${version}` : ""}
        </p>
      </motion.div>
    </div>
  );
}
