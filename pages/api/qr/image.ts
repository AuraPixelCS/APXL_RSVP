import type { NextApiRequest, NextApiResponse } from "next";
import QRCode from "qrcode";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, download } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token query param is required" });
  }

  try {
    const buffer = await QRCode.toBuffer(token, {
      width: 600,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "H",
      type: "png",
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    // When ?download=1, force a file save instead of inline display.
    if (download) {
      res.setHeader("Content-Disposition", 'attachment; filename="entry-pass-qr.png"');
    }
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("QR image error:", err);
    return res.status(500).json({ error: "Failed to generate QR image" });
  }
}
