#!/usr/bin/env node
/**
 * Give the Gala (E2 / E2-TEST) its confirmed banquet layout:
 * 30 round tables × 10 chairs = 300 seats (PEOPLElogy, 3 Sep 2026).
 *
 * Laid out 3 tables per side (6 per row) × 5 rows — the row arrangement is
 * cosmetic and can be reshaped in the Seat Map UI when the real floor plan
 * arrives; table count and seats-per-table are what allocation cares about.
 *
 *   node scripts/set-gala-tables.js           # dry run
 *   node scripts/set-gala-tables.js --apply
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const CONFIG = { style: 'banquet', seatsPerTable: 10, tablesPerSide: 3 };

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
    if (d.code !== 'E2' && d.code !== 'E2-TEST') continue;
    console.log(
      `${d.code}: seatingConfig ${JSON.stringify(d.seatingConfig) ?? 'unset'} -> ${JSON.stringify(CONFIG)}` +
      `  (totalSeats ${d.totalSeats} = ${d.totalSeats / CONFIG.seatsPerTable} tables of ${CONFIG.seatsPerTable})` +
      (APPLY ? '' : '  (dry run)')
    );
    if (APPLY) await doc.ref.update({ seatingConfig: CONFIG });
  }
  console.log(APPLY ? 'Done.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
