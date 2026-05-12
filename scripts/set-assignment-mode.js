/**
 * One-off: flip an event's assignmentMode in Firestore.
 *
 * Usage:
 *   node scripts/set-assignment-mode.js <titleSubstring> <seat|table>
 *
 * Example:
 *   node scripts/set-assignment-mode.js peoplelogy seat
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

const [, , titleArg, modeArg] = process.argv;
if (!titleArg || !modeArg || !['seat', 'table'].includes(modeArg)) {
  console.error('Usage: node scripts/set-assignment-mode.js <titleSubstring> <seat|table>');
  process.exit(1);
}

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

const db = admin.firestore();

(async () => {
  const snap = await db.collection('events').get();
  const matches = snap.docs.filter((d) =>
    (d.data().title ?? '').toLowerCase().includes(titleArg.toLowerCase())
  );

  if (matches.length === 0) {
    console.error(`No events matched title substring "${titleArg}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Multiple events matched "${titleArg}":`);
    matches.forEach((d) => console.error(`  - ${d.id} :: ${d.data().title}`));
    process.exit(1);
  }

  const doc = matches[0];
  const before = doc.data().assignmentMode ?? '(unset)';
  await doc.ref.update({
    assignmentMode: modeArg,
    updatedAt: new Date().toISOString(),
  });
  console.log(`✓ ${doc.data().title} [${doc.id}]`);
  console.log(`  assignmentMode: ${before} → ${modeArg}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
