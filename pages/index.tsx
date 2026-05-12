import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { getEvent } from "@/lib/firestore";
import { format } from "date-fns";
import type { Event } from "@/types";

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export default function PublicRSVPPage() {
  const router = useRouter();
  const { eventId } = router.query;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    attending: true,
    partOf: "",
    company: "",
    jobTitle: "",
    industry: "",
    plusOne: false,
    plusOneName: "",
    dietaryRestrictions: "",
    message: "",
  });

  useEffect(() => {
    if (!router.isReady) return;
    
    if (!eventId || typeof eventId !== "string") {
      router.push("/admin");
      return;
    }

    getEvent(eventId)
      .then((ev) => {
        setEvent(ev);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId, router]);

  const update = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/api/rsvp/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, eventId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>RSVP — AuraPixel</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <main className="min-h-screen flex items-center justify-center bg-background">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
        </main>
      </>
    );
  }

  if (!event) {
    return (
      <>
        <Head>
          <title>Event Not Found — AuraPixel</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <main className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="text-center space-y-4">
            <div
              className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
              style={{ background: "var(--surface-2)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white">Event Not Found</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              This event may have been removed or the link is invalid.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (submitted) {
    return (
      <>
        <Head>
          <title>RSVP Submitted — {event.title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <main className="min-h-screen flex items-center justify-center bg-background px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4 max-w-sm"
          >
            <CheckCircleIcon />
            <h1 className="text-2xl font-bold text-white">Thank You!</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your RSVP for <strong className="text-white">{event.title}</strong> has been submitted
              successfully. {form.attending ? "We look forward to seeing you!" : "We're sorry you can't make it."}
            </p>
            <div
              className="rounded-xl p-4 mt-6 text-left space-y-2"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <CalendarIcon />
                {format(new Date(event.date), "EEEE, dd MMMM yyyy")} · {event.time}
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <MapPinIcon />
                {event.venue}
              </div>
            </div>
          </motion.div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>RSVP — {event.title}</title>
        <meta name="description" content={`RSVP for ${event.title} by AuraPixel`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Event Header Card */}
          <div
            className="rounded-t-2xl p-6 text-center space-y-3"
            style={{
              background: "linear-gradient(135deg, rgba(61,155,245,0.15) 0%, rgba(61,155,245,0.05) 100%)",
              borderTop: "1px solid rgba(61,155,245,0.2)",
              borderLeft: "1px solid rgba(61,155,245,0.15)",
              borderRight: "1px solid rgba(61,155,245,0.15)",
            }}
          >
            <Image
              src="/ap-logo.png"
              alt="AuraPixel"
              width={80}
              height={45}
              className="object-contain mx-auto"
              style={{ filter: "brightness(0) invert(1)" }}
              priority
            />
            <h1 className="text-xl font-bold text-white">{event.title}</h1>
            {event.description && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>{event.description}</p>
            )}
            <div className="flex items-center justify-center flex-wrap gap-4 pt-2">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
                <CalendarIcon />
                {format(new Date(event.date), "dd MMM yyyy")}
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
                <ClockIcon />
                {event.time}
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--accent)" }}>
                <MapPinIcon />
                {event.venue}
              </span>
            </div>
          </div>

          {/* Form */}
          <div
            className="rounded-b-2xl p-6 space-y-5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderTop: "none" }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Phone (WhatsApp) *
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+601234567890"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
              </div>

              {/* Attending toggle */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Will you be attending? *
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => update("attending", true)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{
                      background: form.attending ? "var(--accent-subtle)" : "var(--surface-3)",
                      color: form.attending ? "var(--accent)" : "var(--muted)",
                      border: `1px solid ${form.attending ? "rgba(61,155,245,0.3)" : "var(--border)"}`,
                    }}
                  >
                    ✓ Yes, I&apos;ll be there
                  </button>
                  <button
                    type="button"
                    onClick={() => update("attending", false)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{
                      background: !form.attending ? "rgba(239,68,68,0.1)" : "var(--surface-3)",
                      color: !form.attending ? "#ef4444" : "var(--muted)",
                      border: `1px solid ${!form.attending ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
                    }}
                  >
                    ✗ Can&apos;t make it
                  </button>
                </div>
              </div>

              {/* Conditional fields */}
              <AnimatePresence>
                {form.attending && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    {/* Part Of */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                        I am part of this event as a
                      </label>
                      <select
                        value={form.partOf}
                        onChange={(e) => update("partOf", e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                      >
                        <option value="">Select…</option>
                        <option value="Guest">Guest</option>
                        <option value="Business Partner (Corporate Client)">Business Partner</option>
                        <option value="Impact Partner (Sponsor / Enabler)">Impact Partner (Sponsor / Enabler)</option>
                        <option value="Skill Partner (Technology Partner)">Skill Partner (Technology Partner)</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Company */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                        Company / Organisation
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => update("company", e.target.value)}
                        placeholder="Your company or organisation name"
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                      />
                    </div>

                    {/* Job Title */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                        Job Title
                      </label>
                      <input
                        type="text"
                        value={form.jobTitle}
                        onChange={(e) => update("jobTitle", e.target.value)}
                        placeholder="e.g. CEO, HR Manager, Director"
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                      />
                    </div>

                    {/* Industry */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                        Industry
                      </label>
                      <select
                        value={form.industry}
                        onChange={(e) => update("industry", e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                      >
                        <option value="">Select…</option>
                        <option value="Technology & Digital">Technology &amp; Digital</option>
                        <option value="Healthcare & Pharma">Healthcare &amp; Pharma</option>
                        <option value="Education & Training">Education &amp; Training</option>
                        <option value="Retail & Consumer">Retail &amp; Consumer</option>
                        <option value="Banking & Finance">Banking &amp; Finance</option>
                        <option value="Professional Services">Professional Services</option>
                        <option value="Property & Construction">Property &amp; Construction</option>
                        <option value="Government & GLC">Government &amp; GLC</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>

                    {/* Plus One */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.plusOne}
                          onChange={(e) => update("plusOne", e.target.checked)}
                          className="w-4 h-4 rounded accent-[#3d9bf5]"
                        />
                        <span className="text-sm text-white">Bringing a +1</span>
                      </label>
                    </div>

                    <AnimatePresence>
                      {form.plusOne && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1.5">
                            <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                              +1 Name
                            </label>
                            <input
                              type="text"
                              value={form.plusOneName}
                              onChange={(e) => update("plusOneName", e.target.value)}
                              placeholder="Guest's name"
                              className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                              style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Dietary */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                        Dietary Restrictions
                      </label>
                      <input
                        type="text"
                        value={form.dietaryRestrictions}
                        onChange={(e) => update("dietaryRestrictions", e.target.value)}
                        placeholder="e.g. Vegetarian, Halal, None"
                        className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                        onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Message (optional)
                </label>
                <textarea
                  value={form.message}
                  onChange={(e) => update("message", e.target.value)}
                  placeholder="Any special requests or notes…"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white transition-all duration-150 resize-none"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border)", outline: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                />
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
                disabled={submitting}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {submitting && (
                  <span
                    className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: "rgba(0,0,0,0.4)", borderTopColor: "transparent" }}
                  />
                )}
                {submitting ? "Submitting…" : form.attending ? "Submit RSVP" : "Send Regrets"}
              </button>
            </form>

            <p className="text-center text-[10px]" style={{ color: "var(--muted-2)" }}>
              Powered by AuraPixel
            </p>
          </div>
        </motion.div>
      </main>
    </>
  );
}
