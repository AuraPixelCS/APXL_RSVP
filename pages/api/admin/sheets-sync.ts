/**
 * POST /api/admin/sheets-sync — rewrite every real event's tab in the client's
 * Google Sheet from Firestore, now.
 *
 * Integration writes (register / cancel / confirm-payment) already sync as
 * they happen; this catches everything else — admin edits, allocations,
 * check-ins — and backs the panel's "Open Google Sheet" action, which syncs
 * before opening so what the client sees is never stale.
 *
 * Any signed-in panel user may trigger it (it only pushes data OUT to a sheet
 * the client already has access to).
 */

import type { NextApiResponse } from "next";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import { sheetsConfigured, syncSheetForEvents } from "@/lib/googleSheets";

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!sheetsConfigured()) {
    return res.status(503).json({
      error: "Google Sheet not configured — set GOOGLE_SHEETS_SERVICE_ACCOUNT and GOOGLE_SHEET_ID",
    });
  }
  const result = await syncSheetForEvents();
  if (result.skipped) {
    return res.status(502).json({ error: "Sheet sync failed — see server logs" });
  }
  return res.status(200).json({ success: true, synced: result.synced });
}

export default withAuth(handler);
