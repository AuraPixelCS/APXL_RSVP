/**
 * One-off: update a guest's email on the PEOPLElogy event, matched by name.
 *
 * Usage:
 *   node scripts/update-guest-email.js "<name substring>" <new-email>            # preview
 *   node scripts/update-guest-email.js "<name substring>" <new-email> --apply    # write
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const [, , nameArg, emailArg] = process.argv;
const APPLY = process.argv.includes('--apply');
if (!nameArg || !emailArg) {
  console.error('Usage: node scripts/update-guest-email.js "<name substring>" <new-email> [--apply]');
  process.exit(1);
}

if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}
const db = admin.firestore();

(async () => {
  const events = await db.collection('events').get();
  const ev = events.docs.filter((d) => (d.data().title ?? '').toLowerCase().includes('peoplelogy'));
  if (ev.length !== 1) { console.error(`Expected 1 PEOPLElogy event, found ${ev.length}.`); process.exit(1); }
  const eventId = ev[0].id;

  const rsvpsRef = db.collection('events').doc(eventId).collection('rsvps');
  const snap = await rsvpsRef.get();
  // If the search term is an email, match it exactly (case-insensitive);
  // otherwise treat it as a name substring.
  const byEmail = nameArg.includes('@');
  const needle = nameArg.toLowerCase();
  const matches = snap.docs.filter((d) =>
    byEmail
      ? (d.data().email ?? '').toLowerCase() === needle
      : (d.data().name ?? '').toLowerCase().includes(needle)
  );

  if (matches.length === 0) { console.error(`No guest matched "${nameArg}".`); process.exit(1); }
  if (matches.length > 1) {
    console.error(`Multiple guests matched "${nameArg}" — be more specific:`);
    matches.forEach((d) => console.error(`  - ${d.data().name} <${d.data().email}> [${d.id}]`));
    process.exit(1);
  }

  const doc = matches[0];
  const before = doc.data().email;
  console.log(`Guest: ${doc.data().name} [${doc.id}]`);
  console.log(`  email: ${before}  →  ${emailArg}`);
  if (!APPLY) {
    console.log('\n(dry run — re-run with --apply to write)');
    return;
  }
  await doc.ref.update({ email: emailArg, updatedAt: new Date().toISOString() });
  console.log('✓ updated');
})().catch((e) => { console.error(e); process.exit(1); });
