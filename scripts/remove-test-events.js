#!/usr/bin/env node
/**
 * Delete the "-TEST" twin events (E1-TEST / E2-TEST / E3-TEST) and every RSVP
 * under them — or just their RSVPs, to reset the partner's test data.
 *
 *   node scripts/remove-test-events.js                 # dry run
 *   node scripts/remove-test-events.js --apply         # delete twins + their RSVPs
 *   node scripts/remove-test-events.js --apply --rsvps # keep the twins, wipe their RSVPs only
 *
 * Only ever touches events whose `code` ends in "-TEST".
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const RSVPS_ONLY = process.argv.includes('--rsvps');
const SUFFIX = '-TEST';

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

async function deleteAll(refs) {
  let batch = db.batch(); let n = 0;
  for (const r of refs) { batch.delete(r); if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); } }
  if (n % 400 !== 0) await batch.commit();
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID} · ${RSVPS_ONLY ? 'RSVPs only' : 'twins + RSVPs'}\n`);
  const all = await db.collection('events').get();
  const twins = all.docs.filter((d) => String(d.data().code ?? '').endsWith(SUFFIX));
  if (!twins.length) { console.log('  = no -TEST events — nothing to do'); return; }
  for (const doc of twins) {
    const rsvps = await doc.ref.collection('rsvps').get();
    console.log(`  - ${doc.data().code} "${doc.data().title}" (${doc.id}) · ${rsvps.size} rsvp(s)`);
    if (!APPLY) continue;
    await deleteAll(rsvps.docs.map((r) => r.ref));
    if (!RSVPS_ONLY) await doc.ref.delete();
    console.log(`      ${RSVPS_ONLY ? 'rsvps wiped' : 'deleted'}`);
  }
  if (!APPLY) console.log('\nNothing deleted. Re-run with --apply.');
}
main().catch((e) => { console.error(e.message); process.exit(1); });
