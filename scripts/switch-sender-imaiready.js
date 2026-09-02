#!/usr/bin/env node
/**
 * Switch every NAIRW event's pass-email sender to the client's subdomain:
 *   PEOPLElogy Events <passes@events.imaiready.asia>
 *
 * RUN ONLY AFTER, in this order:
 *   1. PEOPLElogy has added the three DNS records (scripts/add-sending-domain.sh --show)
 *   2. The domain shows "verified" in Resend
 *   3. The Vercel env allows the new domain, then redeploy:
 *        npx vercel env add RESEND_ALLOWED_DOMAINS production --scope aurapixelcs-projects --token $VERCEL_TOKEN
 *        (value: aurapixel.live,events.imaiready.asia)
 *
 * Until step 3 is live, lib/eventSender.ts rejects the new domain and safely
 * falls back to events@aurapixel.live — so running this early sends nothing
 * from an unverified domain, it just has no effect.
 *
 *   node scripts/switch-sender-imaiready.js           # dry run
 *   node scripts/switch-sender-imaiready.js --apply
 *   node scripts/switch-sender-imaiready.js --revert --apply   # back to events@aurapixel.live
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const SENDER = REVERT ? 'events@aurapixel.live' : 'passes@events.imaiready.asia';

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
    if (!String(d.code || '').startsWith('E')) continue;
    if (d.senderEmail === SENDER) {
      console.log(`${d.code}: already ${SENDER}`);
      continue;
    }
    console.log(`${d.code}: "${d.senderEmail || ''}" -> "${SENDER}"${APPLY ? '' : '  (dry run)'}`);
    if (APPLY) await doc.ref.update({ senderName: 'PEOPLElogy Events', senderEmail: SENDER });
  }
  console.log(APPLY ? 'Done.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
