#!/usr/bin/env node
/**
 * Clear the description text on the three real events — it was internal build
 * notes ("brief open question 06" etc.), not something admins need under the
 * event titles. Test twins keep their "Test twin of …" note.
 *
 *   node scripts/clear-event-descriptions.js           # dry run
 *   node scripts/clear-event-descriptions.js --apply
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const CODES = ['E1', 'E2', 'E3'];

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

(async () => {
  const events = await admin.firestore().collection('events').get();
  for (const doc of events.docs) {
    const d = doc.data();
    if (!CODES.includes(d.code)) continue;
    if (!d.description) {
      console.log(`${d.code}: already empty`);
      continue;
    }
    console.log(`${d.code}: clearing "${String(d.description).slice(0, 60)}…"${APPLY ? '' : '  (dry run)'}`);
    if (APPLY) await doc.ref.update({ description: '' });
  }
  console.log(APPLY ? 'Done.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
