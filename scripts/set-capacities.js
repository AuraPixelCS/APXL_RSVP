#!/usr/bin/env node
/**
 * Set the confirmed venue capacities (PEOPLElogy, 3 Sep 2026):
 *   BAFT (E1)   300
 *   Gala (E2)   300  (30 round tables × 10 chairs — matches table allocation)
 *   Summit (E3) 500  (client says "500/day"; every current pass covers all
 *                     3 days, so per-day == per-event until single-day passes
 *                     exist — revisit if F12/F13/F14 ever go on sale)
 *
 * Summit gets waitlistEnabled so free F3 registrations past 500 are
 * waitlisted rather than turned away (paid passes are never capacity-blocked
 * — the partner gates the sale). Twins get the same numbers so UAT behaves
 * like production.
 *
 *   node scripts/set-capacities.js           # dry run
 *   node scripts/set-capacities.js --apply
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const CAPS = {
  E1: { capacityLimit: 300 },
  E2: { capacityLimit: 300 },
  E3: { capacityLimit: 500, waitlistEnabled: true },
};

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
    const base = String(d.code || '').replace(/-TEST$/, '');
    const caps = CAPS[base];
    if (!caps || !String(d.code || '').startsWith('E')) continue;
    console.log(
      `${d.code}: capacityLimit ${d.capacityLimit ?? 'unset'} -> ${caps.capacityLimit}` +
      (caps.waitlistEnabled ? `, waitlistEnabled ${d.waitlistEnabled ?? 'unset'} -> true` : '') +
      (APPLY ? '' : '  (dry run)')
    );
    if (APPLY) await doc.ref.update(caps);
  }
  console.log(APPLY ? 'Done.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
