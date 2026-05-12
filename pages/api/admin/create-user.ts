import type { NextApiResponse } from "next";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { withAuth, type AuthedRequest } from "@/lib/apiAuth";
import type { AppRole } from "@/lib/apiAuth";

async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password, displayName, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const userRole: AppRole = role === "admin" ? "admin" : "client";

  try {
    const user = await adminAuth.createUser({
      email,
      password,
      displayName: displayName || undefined,
      emailVerified: false,
    });

    // Set role as a custom claim so API middleware can verify it
    await adminAuth.setCustomUserClaims(user.uid, { role: userRole });

    // Store user metadata in Firestore
    await adminDb.collection("users").doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: displayName || "",
      role: userRole,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({ success: true, uid: user.uid, email: user.email, role: userRole });
  } catch (err: any) {
    const code = err?.errorInfo?.code || err?.code || "";
    if (code === "auth/email-already-exists") {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    if (code === "auth/invalid-email") {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (code === "auth/invalid-password") {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    console.error("create-user error:", err);
    return res.status(500).json({ error: "Failed to create user" });
  }
}

export default withAuth(handler, "admin");
