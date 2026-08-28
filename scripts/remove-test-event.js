#!/usr/bin/env node
/**
 * Delete the E3-TEST staging twin (and any RSVPs under it).
 *
 *   node scripts/remove-test-event.js            # dry run
 *   node scripts/remove-test-event.js --apply    # delete
 *
 * Only ever touches the event whose `code` is E3-TEST. Refuses if more than
 * one doc carries that code.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const CODE = 'E3-TEST';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}
const db = admin.firestore();

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);
  const snap = await db.collection('events').where('code', '==', CODE).get();
  if (snap.empty) { console.log(`  = ${CODE} not found — nothing to do`); return; }
  if (snap.size > 1) throw new Error(`${CODE}: ${snap.size} docs carry this code — resolve by hand`);
  const doc = snap.docs[0];
  const rsvps = await doc.ref.collection('rsvps').get();
  console.log(`  - ${CODE} "${doc.data().title}" (${doc.id}) with ${rsvps.size} rsvp(s)`);
  if (!APPLY) { console.log('\nNothing deleted. Re-run with --apply.'); return; }
  let batch = db.batch(); let n = 0;
  for (const r of rsvps.docs) { batch.delete(r.ref); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  batch.delete(doc.ref);
  await batch.commit();
  console.log(`      deleted ${doc.id}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
