import type { NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email";
import { buildRsvpConfirmEmail } from "@/lib/emailTemplates";
import { loadPeoplelogyEmailBanner } from "@/lib/emailBanners";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventId, rsvps } = req.body;

  if (!eventId || !Array.isArray(rsvps)) {
    return res.status(400).json({ error: "eventId and rsvps array are required" });
  }

  try {
    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return res.status(404).json({ error: "Event not found" });
    }
    const event = eventSnap.data()!;
    // Fetch existing RSVPs — build a map of email → doc id so we can update duplicates
    const existingSnap = await adminDb.collection("events").doc(eventId).collection("rsvps").get();
    const existingByEmail = new Map<string, string>(); // email → docId
    for (const doc of existingSnap.docs) {
      const email = doc.data().email?.toLowerCase();
      if (email) existingByEmail.set(email, doc.id);
    }

    const now = new Date().toISOString();
    let addedCount = 0;
    let updatedCount = 0;

    for (const rsvp of rsvps) {
      if (!rsvp.email) continue;

      const emailLower = rsvp.email.trim().toLowerCase();

      if (existingByEmail.has(emailLower)) {
        // Existing record — patch only the new extended fields that are currently missing
        const docId = existingByEmail.get(emailLower)!;
        const patch: Record<string, string | null> = {};
        const fields: [string, string | undefined][] = [
          ["partOf",   rsvp.partOf?.trim()],
          ["company",  rsvp.company?.trim()],
          ["jobTitle", rsvp.jobTitle?.trim()],
          ["industry", rsvp.industry?.trim()],
        ];
        for (const [key, val] of fields) {
          if (val) patch[key] = val;
        }
        if (Object.keys(patch).length > 0) {
          patch["updatedAt"] = now;
          await adminDb.collection("events").doc(eventId).collection("rsvps").doc(docId).update(patch);
          updatedCount++;
        }
        continue;
      }

      const rsvpData = {
        eventId,
        name: rsvp.name?.trim() || "Guest",
        email: emailLower,
        phone: rsvp.phone?.trim() || "",
        attending: rsvp.attending !== false,
        plusOne: rsvp.plusOne === true || rsvp.plusOne === "true" || rsvp.plusOne === "TRUE",
        plusOneName: rsvp.plusOneName?.trim() || null,
        dietaryRestrictions: rsvp.dietaryRestrictions?.trim() || null,
        message: rsvp.message?.trim() || null,
        partOf: rsvp.partOf?.trim() || null,
        company: rsvp.company?.trim() || null,
        jobTitle: rsvp.jobTitle?.trim() || null,
        industry: rsvp.industry?.trim() || null,
        status: rsvp.attending === false ? "not_attending" : "pending",
        seatNumber: null,
        qrToken: null,
        qrIssuedAt: null,
        whatsappConfirmSent: false,
        whatsappQRSent: false,
        notifiedAt: null,
        submittedAt: now,
        updatedAt: now,
      };

      await adminDb.collection("events").doc(eventId).collection("rsvps").add(rsvpData);
      existingByEmail.set(emailLower, "");
      addedCount++;

      // Send confirmation email
      try {
        let bannerUrl: string | undefined = event.customRsvpConfirmBanner;
        let attachments;
        if (!bannerUrl) {
          const fallback = loadPeoplelogyEmailBanner(event.title, "rsvp_banner");
          bannerUrl = fallback.bannerUrl;
          if (fallback.attachment) attachments = [fallback.attachment];
        }
        await sendEmail({
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
      } catch (e) {
        console.error("Email throw for imported RSVP:", e);
      }
    }

    return res.status(200).json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      skipped: 0,
    });
  } catch (err) {
    console.error("Import CSV error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAuth(handler, "admin");
