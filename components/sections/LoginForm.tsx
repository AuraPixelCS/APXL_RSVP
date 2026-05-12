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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <div
        className="rounded-2xl p-8 space-y-6"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        {/* Logo */}
        <div className="flex justify-center">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ap-logo.png`}
            alt="AuraPixel"
            width={96}
            height={54}
            className="object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
            priority
          />
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-white">Admin Login</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            AuraPixel RSVP Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@aurapixel.com"
              className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
              style={{
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
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
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm text-white transition-all duration-150"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-150"
                style={{ color: "var(--muted)" }}
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
                className="rounded-lg px-3 py-2.5 text-xs"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#fca5a5",
                }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "var(--accent)", color: "#000" }}
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
    </motion.div>
  );
}
