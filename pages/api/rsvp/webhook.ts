import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/email";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { buildRsvpConfirmEmail } from "@/lib/emailTemplates";

function setCorsHeaders(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
}

// Parse Elementor Pro's native webhook format:
// { fields: [{id, title, value, type}, ...], form_id, form_name, ... }
function parseElementorBody(body: Record<string, unknown>) {
  const fields = body.fields as Array<{ id: string; value: string }> | undefined;
  if (!Array.isArray(fields)) return null;

  const map: Record<string, string> = {};
  for (const f of fields) {
    if (f.id) map[f.id] = f.value ?? "";
  }

  return {
    firstName: map["field_4d4fa02"] ?? "",
    lastName:  map["field_76a12f5"] ?? "",
    email:     map["email"]         ?? "",
    phone:     map["field_d683406"] ?? "",
    role:      map["name"]          ?? "",
    company:   map["field_97486c1"] ?? "",
    jobTitle:  map["message"]       ?? "",
    industry:  map["field_cce635a"] ?? "",
    notes:     map["field_ecd0abc"] ?? "",
  };
}

// Parse Fluent Forms native field format:
// { input_text, input_text_1, email, input_text_2, dropdown, input_text_3, input_text_4, dropdown_1, description }
function parseFluentFormsBody(body: Record<string, unknown>) {
  if (!("input_text" in body) && !("input_text_1" in body)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    firstName: s(body["input_text"]),
    lastName:  s(body["input_text_1"]),
    email:     s(body["email"]),
    phone:     s(body["input_text_2"]),
    role:      s(body["dropdown"]),
    company:   s(body["input_text_3"]),
    jobTitle:  s(body["input_text_4"]),
    industry:  s(body["dropdown_1"]),
    notes:     s(body["description"]),
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Accept API key from header OR query param (Elementor can't set custom headers)
  const apiKey = req.headers["x-api-key"] ?? req.query.key;
  if (!apiKey || apiKey !== process.env.WEBHOOK_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const eventId = process.env.WEBHOOK_EVENT_ID;
  if (!eventId) {
    console.error("[webhook] WEBHOOK_EVENT_ID is not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Detect format: Elementor native → Fluent Forms native → flat JSON
  const parsed = parseElementorBody(body) ?? parseFluentFormsBody(body) ?? (body as Record<string, string>);

  const {
    firstName,
    lastName = "",
    email,
    phone,
    role = "",
    company = "",
    jobTitle = "",
    industry = "",
    notes = "",
  } = parsed as Record<string, string>;

  if (!firstName?.trim() || !email?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: "firstName, email, and phone are required" });
  }

  const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

  const message = notes.trim() || null;

  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = digits.startsWith("0") ? "6" + digits : digits;

  try {
    const eventDoc = await adminDb.collection("events").doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: "Event not found" });
    const event = eventDoc.data();
    if (!event?.isActive) return res.status(400).json({ error: "RSVP is closed for this event" });

    const existing = await adminDb
      .collection("events").doc(eventId)
      .collection("rsvps")
      .where("email", "==", email.toLowerCase().trim())
      .limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: "This email has already RSVPed for this event" });
    }

    const now = new Date().toISOString();
    const rsvpData = {
      eventId,
      name,
      email: email.toLowerCase().trim(),
      phone: normalizedPhone,
      attending: true,
      plusOne: false,
      plusOneName: null,
      dietaryRestrictions: null,
      message,
      partOf: role.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      industry: industry.trim() || null,
      status: "pending",
      seatNumber: null,
      qrToken: null,
      qrIssuedAt: null,
      whatsappConfirmSent: false,
      whatsappQRSent: false,
      notifiedAt: null,
      submittedAt: now,
      updatedAt: now,
    };

    const docRef = await adminDb
      .collection("events").doc(eventId)
      .collection("rsvps").add(rsvpData);

    // Send confirmation email — must be awaited before response so Vercel doesn't freeze the function
    try {
      const emailResult = await sendEmail({
        to: rsvpData.email,
        subject: `RSVP Confirmation – ${event.title}`,
        html: buildRsvpConfirmEmail({
          name,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          venue: event.venue ?? "",
          address: event.address,
          bannerUrl: event.customRsvpConfirmBanner,
        }),
      });
      console.log("[webhook] ✉️ EMAIL LOG:", emailResult);
    } catch (e) {
      console.error("[webhook] Email throw:", e);
    }

    // Send WhatsApp confirmation — awaited for same reason
    if (process.env.WATI_API_ENDPOINT && process.env.WATI_API_TOKEN) {
      try {
        const templateName = process.env.WATI_TEMPLATE_NAME || "rsvp_confirmation";
        const waResult = await sendWhatsAppTemplate(normalizedPhone, templateName, [
          { name: "name", value: rsvpData.name },
          { name: "event", value: event.title },
        ]);
        console.log("[webhook] 💬 WATI LOG:", waResult);
      } catch (e) {
        console.error("[webhook] WATI throw:", e);
      }
    }

    return res.status(201).json({ success: true, rsvpId: docRef.id });
  } catch (err) {
    console.error("[webhook] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
