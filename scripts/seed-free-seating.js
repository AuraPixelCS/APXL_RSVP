#!/usr/bin/env node
/**
 * Free-seating wiring for the Summit (E3) — Phase 4.
 *
 *   node scripts/seed-free-seating.js            # dry run
 *   node scripts/seed-free-seating.js --apply    # writes to Firestore
 *
 * Flips E3 to `assignmentMode: "free"` so registrations coming from the
 * client's complimentary-pass form get a QR pass at once, no allocation.
 * (The E3-TEST staging twin this once created was dropped on 2026-08-28 —
 * the client's form goes straight at the real Summit event.)
 *
 * Idempotent: keyed on `code`.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

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

const SOURCE = 'E3';

async function one(code) {
  const snap = await db.collection('events').where('code', '==', code).get();
  if (snap.size > 1) throw new Error(`${code}: ${snap.size} docs carry this code — resolve by hand`);
  return snap.size ? snap.docs[0] : null;
}

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const src = await one(SOURCE);
  if (!src) throw new Error(`${SOURCE} not found — run scripts/seed-events-iamairready.js --apply first`);
  const srcData = src.data();

  // E3 → free seating
  if (srcData.assignmentMode === 'free') {
    console.log(`  = ${SOURCE} ${srcData.title} — already free seating (${src.id})`);
  } else {
    console.log(`  ~ ${SOURCE} ${srcData.title} — assignmentMode ${srcData.assignmentMode ?? 'seat'} → free (${src.id})`);
    if (APPLY) await src.ref.update({ assignmentMode: 'free', updatedAt: now });
  }

  if (!APPLY) console.log('\nNothing written. Re-run with --apply.');
}

main().catch((e) => { console.error(e); process.exit(1); });
