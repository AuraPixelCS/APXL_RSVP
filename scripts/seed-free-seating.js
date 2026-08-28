#!/usr/bin/env node
/**
 * Free-seating wiring for the Summit (E3) — Phase 4.
 *
 *   node scripts/seed-free-seating.js            # dry run
 *   node scripts/seed-free-seating.js --apply    # writes to Firestore
 *
 * 1. Flips E3 to `assignmentMode: "free"` so registrations coming from the
 *    client's complimentary-pass form get a QR pass at once, no allocation.
 * 2. Creates (or refreshes) a twin event with code "E3-TEST" — same fields,
 *    title suffixed "— TEST". The staging deployment sets
 *    INTEGRATION_EVENT_SUFFIX=-TEST, so the client's UAT submissions land here
 *    and never in the real guest list. Delete the twin after go-live.
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
const TWIN = 'E3-TEST';

// Fields copied from E3 into the twin. Everything else (RSVPs, custom email
// copy an admin adds later) stays per-event.
const COPY = [
  'title', 'date', 'endDate', 'time', 'days', 'timezone', 'venue', 'address',
  'description', 'totalSeats', 'seatingConfig', 'assignmentMode', 'capacityLimit',
  'waitlistEnabled', 'senderName', 'senderEmail', 'replyToEmail', 'dressCode',
];

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

  // 1. E3 → free seating
  if (srcData.assignmentMode === 'free') {
    console.log(`  = ${SOURCE} ${srcData.title} — already free seating (${src.id})`);
  } else {
    console.log(`  ~ ${SOURCE} ${srcData.title} — assignmentMode ${srcData.assignmentMode ?? 'seat'} → free (${src.id})`);
    if (APPLY) await src.ref.update({ assignmentMode: 'free', updatedAt: now });
  }

  // 2. Twin for staging
  const twinPayload = { code: TWIN, isActive: false, pinned: false };
  for (const k of COPY) if (srcData[k] !== undefined) twinPayload[k] = srcData[k];
  twinPayload.assignmentMode = 'free';
  twinPayload.title = `${srcData.title} — TEST`;
  twinPayload.description = `Staging twin of ${SOURCE}. Receives the client's UAT form submissions via INTEGRATION_EVENT_SUFFIX=-TEST. Safe to delete after go-live.`;

  const twin = await one(TWIN);
  if (twin) {
    console.log(`  ~ ${TWIN} — refresh ${twin.id} from ${SOURCE}`);
    if (APPLY) await twin.ref.update({ ...twinPayload, updatedAt: now });
  } else {
    console.log(`  + ${TWIN} "${twinPayload.title}" — create`);
    if (APPLY) {
      const ref = await db.collection('events').add({ ...twinPayload, createdAt: now, updatedAt: now });
      console.log(`      created ${ref.id}`);
    }
  }

  if (!APPLY) console.log('\nNothing written. Re-run with --apply.');
}

main().catch((e) => { console.error(e); process.exit(1); });
