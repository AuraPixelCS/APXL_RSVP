import type { NextApiRequest, NextApiResponse } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { resolveKeyKind, TEST_EVENT_SUFFIX } from "@/lib/integration";

/**
 * POST /api/integrations/cancel — void a registration by the partner's own
 * reference (drop-out with no replacement; for a swap, Register with
 * `transfer: true` does both halves in one call).
 *
 * Finds every record carrying the `submission_id` across the environment's
 * events and marks it `cancelled` — the QR stops scanning at the door, the
 * record stays in the panel for the paper trail. Idempotent: cancelling twice
 * reports the records as already cancelled. Records that were merely `reused`
 * for this person (their own free Summit pass under a different reference)
 * are untouched, because they were never part of this purchase.
 *
 * The key decides the environment: the test key only ever touches "-TEST"
 * events, the production key only real ones.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const keys = { production: process.env.INTEGRATION_API_KEY, test: process.env.INTEGRATION_TEST_API_KEY };
  if (!keys.production) return res.status(503).json({ error: "integration_not_configured" });
  const keyKind = resolveKeyKind(req.headers["x-api-key"], keys);
  if (!keyKind) return res.status(401).json({ error: "unauthorized" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const externalRef = String(
    body.externalRef ?? body.external_ref ?? body.submission_id ?? body.submissionId ?? body.reference ?? "",
  ).trim();
  if (!externalRef) {
    return res.status(400).json({ error: "invalid_payload", message: "externalRef is required", field: "externalRef" });
  }
  const reason = String(body.reason ?? "").trim().slice(0, 300) || null;

  try {
    const eventsSnap = await adminDb.collection("events").get();
    const events = eventsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((e) => typeof e.code === "string" && e.code)
      .filter((e) =>
        keyKind === "test" ? e.code.endsWith(TEST_EVENT_SUFFIX) : !e.code.endsWith(TEST_EVENT_SUFFIX),
      );

    const now = new Date().toISOString();
    const cancelled: any[] = [];
    const alreadyCancelled: any[] = [];

    for (const event of events) {
      const rsvpsRef = adminDb.collection("events").doc(event.id).collection("rsvps");
      const snap = await rsvpsRef.where("externalRef", "==", externalRef).get();
      for (const doc of snap.docs) {
        const data = doc.data();
        const entry = { event: { code: event.code, title: event.title ?? null }, registrationId: doc.id };
        if (data.status === "cancelled") {
          alreadyCancelled.push(entry);
          continue;
        }
        await rsvpsRef.doc(doc.id).update({
          status: "cancelled",
          cancelledAt: now,
          cancelReason: reason ?? "cancelled",
          updatedAt: now,
        });
        cancelled.push(entry);
      }
    }

    if (!cancelled.length && !alreadyCancelled.length) {
      return res.status(404).json({ error: "not_found", message: `No registration under "${externalRef}"` });
    }
    return res.status(200).json({
      externalRef,
      environment: keyKind,
      cancelled,
      alreadyCancelled,
      ...(alreadyCancelled.length && !cancelled.length ? { duplicate: true } : {}),
    });
  } catch (err) {
    console.error("[integrations/cancel]", err);
    return res.status(500).json({ error: "internal_error" });
  }
}
