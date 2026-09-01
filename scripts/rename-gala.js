#!/usr/bin/env node
/**
 * Set the Gala (E2 / E2-TEST) title to PEOPLElogy's confirmed wording:
 *   "Asia AI Excellence Award Gala Dinner"  (1 Sep 2026 reply, item 5)
 *
 *   node scripts/rename-gala.js           # dry run
 *   node scripts/rename-gala.js --apply
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const TITLE = 'Asia AI Excellence Award Gala Dinner';

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

(async () => {
  const events = await db.collection('events').get();
  for (const doc of events.docs) {
    const d = doc.data();
    if (d.code !== 'E2' && d.code !== 'E2-TEST') continue;
    const next = d.code === 'E2' ? TITLE : `${TITLE} — TEST`;
    if (d.title === next) {
      console.log(`${d.code}: already "${next}"`);
      continue;
    }
    console.log(`${d.code}: "${d.title}" -> "${next}"${APPLY ? '' : '  (dry run)'}`);
    if (APPLY) await doc.ref.update({ title: next });
  }
  console.log(APPLY ? 'Done.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
