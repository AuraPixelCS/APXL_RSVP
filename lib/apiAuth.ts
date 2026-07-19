import type { NextApiRequest, NextApiResponse, NextApiHandler } from "next";
import { adminAuth } from "@/lib/firebaseAdmin";
import type { DecodedIdToken } from "firebase-admin/auth";

export type AppRole = "admin" | "client";

export interface AuthedRequest extends NextApiRequest {
  decodedToken: DecodedIdToken;
  userRole: AppRole;
}

type AuthedHandler = (req: AuthedRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Wraps an API handler with Firebase ID token verification.
 * Pass requiredRole="admin" to reject client-role users with 403.
 * Users with no role claim default to the least-privileged "client" role.
 * Run scripts/sync-user-claims.js once so existing admins carry an explicit claim.
 */
export function withAuth(handler: AuthedHandler, requiredRole?: "admin"): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.slice(7);
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const role: AppRole = (decoded.role as AppRole) ?? "client";

      if (requiredRole === "admin" && role !== "admin") {
        return res.status(403).json({ error: "Forbidden: admin access required" });
      }

      (req as AuthedRequest).decodedToken = decoded;
      (req as AuthedRequest).userRole = role;
      return handler(req as AuthedRequest, res);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

/**
 * Lightweight shared-secret guard for the scanner endpoints (the mobile scanner
 * has no user login). The app sends an `x-scanner-key` header that must match
 * SCANNER_API_KEY.
 *
 * Staged rollout: while SCANNER_API_KEY is unset, the guard allows all callers,
 * so deploying it does NOT brick the scanner build already in the field. Turn on
 * enforcement by (1) shipping an app build that sends the key, then (2) setting
 * SCANNER_API_KEY in the server environment.
 */
export function scannerKeyValid(req: NextApiRequest): boolean {
  const expected = process.env.SCANNER_API_KEY;
  if (!expected) return true; // not configured yet — allow (see staged rollout)
  const provided = req.headers["x-scanner-key"];
  return typeof provided === "string" && provided.length > 0 && provided === expected;
}
