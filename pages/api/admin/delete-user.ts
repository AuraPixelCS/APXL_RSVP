import type { NextApiResponse } from "next";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ error: "uid is required" });
  }

  // Prevent self-deletion
  if (uid === req.decodedToken.uid) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  try {
    await adminAuth.deleteUser(uid);
    await adminDb.collection("users").doc(uid).delete();

    return res.status(200).json({ success: true });
  } catch (err: any) {
    const code = err?.errorInfo?.code || err?.code || "";
    if (code === "auth/user-not-found") {
      return res.status(404).json({ error: "User not found" });
    }
    console.error("delete-user error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
}

export default withAuth(handler, "admin");
