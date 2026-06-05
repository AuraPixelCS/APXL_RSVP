import type { GetServerSideProps } from "next";
import Head from "next/head";

// ─── Online Entry Pass ──────────────────────────────────────────────────────
//
// Guest-facing fallback for the emailed QR code. The entry-pass email links here
// (`/pass?t=<signed-token>`) so the QR is reachable even when an email client
// blocks images — most importantly when the message lands in the junk folder.
// The page is fully self-contained: it verifies the signed token, loads the
// event/RSVP, and renders the QR generated server-side (no blocked remote image,
// no client JS required).

interface PassProps {
  valid: boolean;
  name?: string;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  venue?: string;
  address?: string;
  label?: string;
  qrDataUrl?: string;
}

export default function PassPage(props: PassProps) {
  return (
    <>
      <Head>
        <title>{props.valid ? `Entry Pass — ${props.eventTitle}` : "Entry Pass"}</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div
        style={{
          minHeight: "100vh",
          background: "#000000",
          color: "#ffffff",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        {!props.valid ? (
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Pass not found</h1>
            <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6 }}>
              This entry-pass link is invalid or has expired. Please use the most
              recent email we sent you, or reply to it for help.
            </p>
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background: "#0d0d0d",
              border: "1px solid #1f1f1f",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "24px 24px 8px", textAlign: "center" }}>
              <p
                style={{
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#3d9bf5",
                  margin: "0 0 4px",
                  fontWeight: 700,
                }}
              >
                Your Entry Pass
              </p>
              <h1 style={{ fontSize: 20, margin: "0 0 2px", fontWeight: 700 }}>
                {props.eventTitle}
              </h1>
              <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>
                {props.eventDate}
                {props.eventTime ? ` · ${props.eventTime}` : ""}
              </p>
            </div>

            <div style={{ padding: 24, textAlign: "center" }}>
              <div
                style={{
                  background: "#ffffff",
                  display: "inline-block",
                  padding: 12,
                  borderRadius: 12,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={props.qrDataUrl}
                  alt="QR Entry Pass"
                  width={240}
                  height={240}
                  style={{ display: "block", width: 240, height: 240 }}
                />
              </div>
              <p style={{ color: "#6b7280", fontSize: 11, margin: "12px 0 0" }}>
                Show this QR code at the entrance. Do not share it.
              </p>
            </div>

            <div
              style={{
                borderTop: "1px solid #1f1f1f",
                padding: "16px 24px 24px",
                fontSize: 14,
              }}
            >
              <Row label="Name" value={props.name} />
              {props.label ? <Row label="Seat" value={props.label} /> : null}
              {props.venue ? <Row label="Venue" value={props.venue} /> : null}
              {props.address ? <Row label="Address" value={props.address} /> : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", gap: 16 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<PassProps> = async (ctx) => {
  const token = typeof ctx.query.t === "string" ? ctx.query.t : "";
  const invalid = { props: { valid: false } };

  if (!token) return invalid;

  // Server-only imports — kept inside getServerSideProps so they never reach the
  // client bundle (firebase-admin + qrcode are Node-only).
  const { verifyQRToken } = await import("@/lib/qr");
  const payload = verifyQRToken(token);
  if (!payload) return invalid;

  try {
    const { adminDb } = await import("@/lib/firebaseAdmin");
    const QRCode = (await import("qrcode")).default;
    const { formatAssignment } = await import("@/lib/seatLabel");

    const eventSnap = await adminDb.collection("events").doc(payload.eventId).get();
    if (!eventSnap.exists) return invalid;
    const event = eventSnap.data()! as any;

    const rsvpSnap = await adminDb
      .collection("events")
      .doc(payload.eventId)
      .collection("rsvps")
      .doc(payload.rsvpId)
      .get();
    if (!rsvpSnap.exists) return invalid;
    const rsvp = rsvpSnap.data()! as any;

    // Token must still match this RSVP's current pass (revokes superseded links).
    if (rsvp.qrToken && rsvp.qrToken !== token) return invalid;

    const qrDataUrl = await QRCode.toDataURL(token, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 480,
      color: { dark: "#000000", light: "#ffffff" },
    });

    const assignment = formatAssignment(rsvp.seatNumber, event);

    return {
      props: {
        valid: true,
        name: rsvp.name ?? "",
        eventTitle: event.title ?? "",
        eventDate: event.date ?? "",
        eventTime: event.time ?? "",
        venue: event.venue ?? "",
        address: event.address ?? "",
        label: assignment ? assignment.long : `Seat #${rsvp.seatNumber}`,
        qrDataUrl,
      },
    };
  } catch (e) {
    console.error("Pass page error:", e);
    return invalid;
  }
};
