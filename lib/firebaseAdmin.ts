import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  // In production, use a service account JSON file or env vars
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    // Vercel/Next.js ENV loaders often double-escape newlines. We must unescape back to real newlines.
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  // Fallback: uses default credentials (works in Cloud Run / GCF / local with gcloud auth)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

// Only initialize when actually used (at request time, not build time)
let _adminDb: Firestore | null = null;

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    if (!_adminDb) {
      const app = getAdminApp();
      _adminDb = getFirestore(app);
    }
    return (_adminDb as any)[prop];
  },
});

let _adminAuth: Auth | null = null;

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    if (!_adminAuth) {
      const app = getAdminApp();
      _adminAuth = getAuth(app);
    }
    return (_adminAuth as any)[prop];
  },
});
