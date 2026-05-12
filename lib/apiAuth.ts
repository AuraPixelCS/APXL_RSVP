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
 * Users with no role claim (pre-existing accounts) are treated as admin.
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
      const role: AppRole = (decoded.role as AppRole) ?? "admin";

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
