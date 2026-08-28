/**
 * Guest self-service page — /manage?t=<signed token>
 *
 * Reached from a link in the RSVP confirmation and waitlist emails. The token
 * IS the credential, so this page never asks who you are; it either resolves
 * the booking or says the link is dead.
 *
 * Every state is rendered explicitly — loading, bad link, closed for edits,
 * cancelled — because the alternative on a guest-facing page is a blank screen
 * and an email to the organiser.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { motion, AnimatePresence } from "framer-motion";

interface ManageRsvp {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  attending: boolean;
  plusOne: boolean;
  plusOneName: string;
  dietaryRestrictions: string;
  message: string;
  seatNumber: number | null;
  plusOneSeatNumber: number | null;
  hasPass: boolean;
}

interface ManageEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  assignmentMode: "seat" | "table";
}

interface ManageData {
  rsvp: ManageRsvp;
  event: ManageEvent;
  editable: boolean;
}

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/rsvp/manage`;

export default function ManagePage() {
  const router = useRouter();
  const token = typeof router.query.t === "string" ? router.query.t : "";

  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", plusOneName: "", dietaryRestrictions: "", message: "",
  });
  const [dropPlusOne, setDropPlusOne] = useState(false);

  const hydrate = useCallback((d: ManageData) => {
    setData(d);
    setForm({
      name: d.rsvp.name,
      phone: d.rsvp.phone,
      plusOneName: d.rsvp.plusOneName,
      dietaryRestrictions: d.rsvp.dietaryRestrictions,
      message: d.rsvp.message,
    });
    setDropPlusOne(false);
  }, []);

  // router.query is empty on the first render, so a missing token can only be
  // judged once the router is ready. Derived during render rather than pushed
  // into state from an effect — there is nothing async about it.
  const missingToken = router.isReady && !token;

  useEffect(() => {
    if (!router.isReady || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}?t=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(body.error ?? "We couldn't load your RSVP.");
        else hydrate(body);
      } catch {
        if (!cancelled) setError("We couldn't reach the server. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, token, hydrate]);

  const shownError = missingToken
    ? "This link is missing its access code. Please use the link from your email."
    : error;
  const busy = loading && !missingToken;

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      setSaving(true);
      setNotice(null);
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ...payload }),
        });
        const body = await res.json();
        if (!res.ok) {
          setNotice(body.error ?? "That didn't work. Please try again.");
          return null;
        }
        return body;
      } catch {
        setNotice("We couldn't reach the server. Please try again.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  const handleSave = useCallback(async () => {
    const body = await post({
      action: "update",
      ...form,
      ...(dropPlusOne ? { plusOne: false } : {}),
    });
    if (body?.rsvp) {
      hydrate(body as ManageData);
      setNotice("Your details have been updated.");
    }
  }, [post, form, dropPlusOne, hydrate]);

  const handleCancel = useCallback(async () => {
    const body = await post({ action: "cancel" });
    if (body?.ok && data) {
      setData({ ...data, rsvp: { ...data.rsvp, status: "not_attending", attending: false, seatNumber: null, plusOneSeatNumber: null } });
      setConfirmingCancel(false);
      setNotice(null);
    }
  }, [post, data]);

  const handleResend = useCallback(async () => {
    const body = await post({ action: "resend_pass" });
    if (body?.ok) setNotice(body.message ?? "Request sent.");
  }, [post]);

  const seatWord = data?.event.assignmentMode === "table" ? "Table" : "Seat";

  return (
    <>
      <Head>
        <title>Manage your RSVP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* A booking link must never be indexed or forwarded to a referrer. */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>

      <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-lg">
          {busy && (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div
                className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-transparent"
                style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent)" }}
                role="status"
                aria-label="Loading your RSVP"
              />
              <p className="text-sm" style={{ color: "var(--muted)" }}>Loading your RSVP…</p>
            </div>
          )}

          {!busy && shownError && (
            <div className="rounded-2xl p-8 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <h1 className="text-base font-semibold mb-2" style={{ color: "var(--foreground)" }}>
                This link doesn&rsquo;t work
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{shownError}</p>
              <p className="text-xs mt-4" style={{ color: "var(--muted-2)" }}>
                Links expire after a few months. Reply to your confirmation email and the
                organiser can send a fresh one.
              </p>
            </div>
          )}

          {!busy && !shownError && data && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-4"
            >
              {/* Event header */}
              <div className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
                  Your RSVP
                </p>
                <h1 className="text-lg font-semibold leading-snug" style={{ color: "var(--foreground)" }}>
                  {data.event.title}
                </h1>
                <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                  {[data.event.date, data.event.time].filter(Boolean).join(" · ")}
                  {data.event.venue ? ` · ${data.event.venue}` : ""}
                </p>

                <StatusBanner status={data.rsvp.status} seatWord={seatWord} rsvp={data.rsvp} />
              </div>

              {notice && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  role="status"
                  aria-live="polite"
                  style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  {notice}
                </div>
              )}

              {data.rsvp.status === "not_attending" ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Your RSVP has been cancelled and your {seatWord.toLowerCase()} released.
                    If this was a mistake, reply to your confirmation email.
                  </p>
                </div>
              ) : (
                <>
                  {/* Editable details */}
                  <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Your details</h2>

                    {!data.editable && (
                      <p className="text-xs rounded-lg p-3" style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                        Changes are closed for this event. Reply to your confirmation email if
                        something needs correcting.
                      </p>
                    )}

                    <Field id="mg-name" label="Name" value={form.name} disabled={!data.editable}
                      onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                    <Field id="mg-phone" label="Phone" value={form.phone} disabled={!data.editable}
                      onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />

                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
                        Email
                      </label>
                      <p className="text-sm px-3 py-2.5 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                        {data.rsvp.email}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--muted-2)" }}>
                        Your email identifies this booking and can&rsquo;t be changed here.
                      </p>
                    </div>

                    <Field id="mg-diet" label="Dietary requirements" value={form.dietaryRestrictions} disabled={!data.editable}
                      placeholder="e.g. vegetarian, no nuts"
                      onChange={(v) => setForm((f) => ({ ...f, dietaryRestrictions: v }))} />

                    {data.rsvp.plusOne && (
                      <>
                        <Field id="mg-p1" label="Guest name (+1)" value={form.plusOneName} disabled={!data.editable || dropPlusOne}
                          onChange={(v) => setForm((f) => ({ ...f, plusOneName: v }))} />
                        {data.editable && (
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dropPlusOne}
                              onChange={(e) => setDropPlusOne(e.target.checked)}
                              className="mt-0.5 h-4 w-4 cursor-pointer"
                              style={{ accentColor: "var(--accent)" }}
                            />
                            <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                              I&rsquo;m coming alone after all — release my guest&rsquo;s {seatWord.toLowerCase()}.
                            </span>
                          </label>
                        )}
                      </>
                    )}

                    {data.editable && (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "var(--accent)", color: "#000" }}
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="rounded-2xl p-6 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    {data.rsvp.hasPass && (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={saving}
                        className="w-full py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 disabled:opacity-50"
                        style={{ background: "var(--surface-3)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                      >
                        Can&rsquo;t find your entry pass? Ask for it again
                      </button>
                    )}

                    <AnimatePresence mode="wait" initial={false}>
                      {confirmingCancel ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-lg p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                            <p className="text-sm mb-3" style={{ color: "var(--foreground)" }}>
                              Cancel your RSVP? Your {seatWord.toLowerCase()} will be released and your
                              entry pass will stop working.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmingCancel(false)}
                                className="flex-1 py-2 rounded-lg text-xs font-medium cursor-pointer"
                                style={{ background: "var(--surface-3)", color: "var(--muted)", border: "1px solid var(--border)" }}
                              >
                                Keep my RSVP
                              </button>
                              <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="flex-1 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                                style={{ background: "var(--danger)", color: "#fff" }}
                              >
                                {saving ? "Cancelling…" : "Yes, cancel"}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        data.editable && (
                          <motion.button
                            key="trigger"
                            type="button"
                            onClick={() => setConfirmingCancel(true)}
                            className="w-full py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
                            style={{ background: "transparent", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.3)" }}
                          >
                            I can no longer attend
                          </motion.button>
                        )
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </>
  );
}

/** The one thing a guest actually opens this page to check. */
function StatusBanner({
  status, seatWord, rsvp,
}: { status: string; seatWord: string; rsvp: ManageRsvp }) {
  const tone =
    status === "allocated" || status === "checked_in"
      ? { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", color: "#22c55e" }
      : status === "waitlisted"
        ? { bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.3)", color: "#a855f7" }
        : status === "not_attending"
          ? { bg: "rgba(107,114,128,0.12)", border: "var(--border)", color: "var(--muted)" }
          : { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", color: "#f59e0b" };

  const label =
    status === "allocated" ? `Confirmed — ${seatWord} #${rsvp.seatNumber}`
      : status === "checked_in" ? "Checked in"
        : status === "waitlisted" ? "On the waitlist"
          : status === "not_attending" ? "Cancelled"
            : "Confirmed — seat not yet assigned";

  const detail =
    status === "waitlisted"
      ? "The event is full. If a place opens up we'll email your entry pass automatically."
      : status === "pending"
        ? "You're on the guest list. Your seat and entry pass will be emailed before the event."
        : status === "allocated" && rsvp.plusOneSeatNumber
          ? `Your guest is in ${seatWord.toLowerCase()} #${rsvp.plusOneSeatNumber}.`
          : null;

  return (
    <div className="mt-4 rounded-xl px-4 py-3" style={{ background: tone.bg, border: `1px solid ${tone.border}` }}>
      <p className="text-sm font-semibold" style={{ color: tone.color }}>{label}</p>
      {detail && (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>{detail}</p>
      )}
    </div>
  );
}

function Field({
  id, label, value, onChange, disabled, placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium block mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--surface-3)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          outline: "none",
        }}
      />
    </div>
  );
}
