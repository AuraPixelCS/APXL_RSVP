import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendResendEmail } from "@/lib/resend";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { buildRsvpConfirmEmail } from "@/lib/emailTemplates";
import { loadPeoplelogyEmailBanner } from "@/lib/emailBanners";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, name, email, phone, attending, plusOne, plusOneName, dietaryRestrictions, message, partOf, company, jobTitle, industry } = req.body;

  if (!eventId || !name || !email || !phone) {
    return res.status(400).json({ error: "eventId, name, email, and phone are required" });
  }

  try {
    // Verify event exists and is active
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;
    if (!event.isActive) {
      return res.status(400).json({ error: "This event is no longer accepting RSVPs" });
    }

    // Check deadline
    if (event.rsvpDeadline) {
      const deadline = new Date(event.rsvpDeadline);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) {
        return res.status(400).json({ error: "RSVP deadline has passed" });
      }
    }

    // Check for duplicate (same email for same event)
    const existing = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .where("email", "==", email)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ error: "You have already submitted an RSVP for this event" });
    }

    const now = new Date().toISOString();
    const rsvpData = {
      eventId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      attending: attending !== false,
      plusOne: plusOne === true,
      plusOneName: plusOneName?.trim() || null,
      dietaryRestrictions: dietaryRestrictions?.trim() || null,
      message: message?.trim() || null,
      partOf: partOf?.trim() || null,
      company: company?.trim() || null,
      jobTitle: jobTitle?.trim() || null,
      industry: industry?.trim() || null,
      status: attending === false ? "not_attending" : "pending",
      seatNumber: null,
      qrToken: null,
      qrIssuedAt: null,
      whatsappConfirmSent: false,
      whatsappQRSent: false,
      submittedAt: now,
      updatedAt: now,
    };

    const ref = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .add(rsvpData);

    // Send confirmation email — must be awaited before response so Vercel doesn't freeze the function
    try {
      let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
      let attachments;
      if (!bannerUrl) {
        const fallback = loadPeoplelogyEmailBanner(event.title, "rsvp_banner");
        bannerUrl = fallback.bannerUrl;
        if (fallback.attachment) attachments = [fallback.attachment];
      }
      const emailResult = await sendResendEmail({
        to: rsvpData.email,
        subject: `RSVP Confirmation – ${event.title}`,
        html: buildRsvpConfirmEmail({
          name: rsvpData.name,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          venue: event.venue ?? "",
          address: event.address,
          bannerUrl,
          showTitleOnBanner: !!event.showEventTitleOnBanner,
        }),
        attachments,
      });
      console.log("✉️ EMAIL LOG:", emailResult);
    } catch (e) {
      console.error("Email throw:", e);
    }

    // Send WhatsApp confirmation — awaited for same reason
    if (process.env.WATI_API_ENDPOINT && process.env.WATI_API_TOKEN) {
      try {
        const templateName = process.env.WATI_TEMPLATE_NAME || "rsvp_confirmation";
        const cleanPhone = rsvpData.phone.replace(/[^0-9]/g, '');
        const internationalPhone = cleanPhone.startsWith('0') ? '6' + cleanPhone : cleanPhone;
        console.log(`Sending WATI WhatsApp to ${internationalPhone} using template ${templateName}`);
        const waResult = await sendWhatsAppTemplate(internationalPhone, templateName, [
          { name: "name", value: rsvpData.name },
          { name: "event", value: event.title },
        ]);
        console.log("💬 WATI LOG:", waResult);
      } catch (e) {
        console.error("WATI throw:", e);
      }
    }

    return res.status(201).json({
      success: true,
      rsvpId: ref.id,
      message: "RSVP submitted successfully",
    });
  } catch (err) {
    console.error("RSVP submit error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
