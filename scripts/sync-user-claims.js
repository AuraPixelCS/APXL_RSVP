/**
 * Reconcile every Firebase Auth user's `role` custom claim with the role stored
 * in Firestore `users/{uid}.role`.
 *
 * WHY: `withAuth` / AuthContext now default a user with NO role claim to the
 * least-privileged "client" (previously they defaulted to "admin"). Any admin
 * account created directly in the Firebase console — or before create-user.ts
 * started setting claims — has no claim and would lose admin access after that
 * change deploys. Run this ONCE before deploying the role-default flip so every
 * admin carries an explicit `{ role: "admin" }` claim.
 *
 * Usage:
 *   node scripts/sync-user-claims.js            # apply
 *   node scripts/sync-user-claims.js --dry-run  # show what would change only
 *
 * Users present in Auth but missing from the `users` collection are reported and
 * left untouched (this script never invents a role).
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Minimal .env.local loader (project has no dotenv dep) ────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env.local');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const auth = admin.auth();
const db = admin.firestore();

(async () => {
  const snap = await db.collection('users').get();
  if (snap.empty) {
    console.error('No documents in the `users` collection — nothing to sync.');
    process.exit(1);
  }

  let updated = 0;
  let unchanged = 0;
  let missingAuth = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const uid = data.uid || doc.id;
    const role = data.role === 'admin' ? 'admin' : 'client';

    let userRecord;
    try {
      userRecord = await auth.getUser(uid);
    } catch (e) {
      console.warn(`  ! users/${doc.id} (${data.email || 'no email'}): no matching Auth user — skipped`);
      missingAuth++;
      continue;
    }

    const currentClaim = (userRecord.customClaims || {}).role;
    if (currentClaim === role) {
      unchanged++;
      continue;
    }

    console.log(
      `  ${DRY_RUN ? '[dry-run] would set' : 'set'} ${data.email || uid}: ` +
        `claim ${currentClaim ?? '(none)'} -> ${role}`,
    );
    if (!DRY_RUN) {
      await auth.setCustomUserClaims(uid, { ...(userRecord.customClaims || {}), role });
    }
    updated++;
  }

  console.log(
    `\nDone. ${updated} ${DRY_RUN ? 'would be updated' : 'updated'}, ` +
      `${unchanged} already correct, ${missingAuth} missing in Auth.`,
  );
  if (!DRY_RUN && updated > 0) {
    console.log('Affected users must sign out and back in (or wait for token refresh) to pick up the new claim.');
  }
  process.exit(0);
})().catch((err) => {
  console.error('sync-user-claims failed:', err);
  process.exit(1);
});
