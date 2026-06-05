import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { verifyQRToken } from "@/lib/qr";
import { adminDb } from "@/lib/firebaseAdmin";
import { formatAssignment } from "@/lib/seatLabel";

// ─── Entry Pass PDF ─────────────────────────────────────────────────────────
//
// GET /api/pass/pdf?t=<signed-token> — returns a printable A6-ish PDF ticket
// (event details + QR) as a file download. Verifies the signed token and that
// it still matches the RSVP's current pass, same as the /pass page.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.query.t === "string" ? req.query.t : "";
  if (!token) return res.status(400).json({ error: "t query param is required" });

  const payload = verifyQRToken(token);
  if (!payload) return res.status(404).json({ error: "Invalid or expired pass" });

  try {
    const eventSnap = await adminDb.collection("events").doc(payload.eventId).get();
    if (!eventSnap.exists) return res.status(404).json({ error: "Pass not found" });
    const event = eventSnap.data()! as any;

    const rsvpSnap = await adminDb
      .collection("events")
      .doc(payload.eventId)
      .collection("rsvps")
      .doc(payload.rsvpId)
      .get();
    if (!rsvpSnap.exists) return res.status(404).json({ error: "Pass not found" });
    const rsvp = rsvpSnap.data()! as any;

    if (rsvp.qrToken && rsvp.qrToken !== token) {
      return res.status(404).json({ error: "Pass not found" });
    }

    const assignment = formatAssignment(rsvp.seatNumber, event);
    const seatLabel = assignment ? assignment.long : `Seat #${rsvp.seatNumber}`;

    const qrPng = await QRCode.toBuffer(token, {
      width: 600,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "H",
      type: "png",
    });

    // ── Build the PDF ──
    const pdf = await PDFDocument.create();
    const W = 320;
    const H = 520;
    const page = pdf.addPage([W, H]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const accent = rgb(0.24, 0.61, 0.96); // #3d9bf5
    const dark = rgb(0.07, 0.07, 0.07);
    const grey = rgb(0.42, 0.45, 0.5);

    const cx = (text: string, f: typeof font, size: number, y: number, color = dark) => {
      const w = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (W - w) / 2, y, size, font: f, color });
    };

    let y = H - 40;
    cx("YOUR ENTRY PASS", bold, 10, y, accent);
    y -= 26;

    // Event title (wrap to 2 lines if needed).
    const title = String(event.title ?? "");
    const titleSize = 15;
    const maxW = W - 48;
    const words = title.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (bold.widthOfTextAtSize(test, titleSize) > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (const l of lines.slice(0, 3)) {
      cx(l, bold, titleSize, y);
      y -= 19;
    }
    y -= 4;
    cx(
      `${event.date ?? ""}${event.time ? ` · ${event.time}` : ""}`,
      font,
      11,
      y,
      grey
    );
    y -= 24;

    // QR — white card + image.
    const qrSize = 200;
    const qrX = (W - qrSize) / 2;
    const qrY = y - qrSize;
    page.drawRectangle({
      x: qrX - 10,
      y: qrY - 10,
      width: qrSize + 20,
      height: qrSize + 20,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1,
    });
    const qrImage = await pdf.embedPng(qrPng);
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    y = qrY - 26;
    cx("Show this QR code at the entrance. Do not share it.", font, 8, y, grey);
    y -= 26;

    // Details rows.
    const rows: [string, string][] = [["Name", String(rsvp.name ?? "")]];
    if (seatLabel) rows.push(["Seat", seatLabel]);
    if (event.venue) rows.push(["Venue", String(event.venue)]);
    for (const [label, value] of rows) {
      page.drawText(label, { x: 28, y, size: 10, font, color: grey });
      const vw = bold.widthOfTextAtSize(value, 10);
      page.drawText(value, { x: W - 28 - vw, y, size: 10, font: bold, color: dark });
      y -= 18;
    }

    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="entry-pass.pdf"');
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    console.error("Pass PDF error:", e);
    return res.status(500).json({ error: "Failed to generate pass PDF" });
  }
}
