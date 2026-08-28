#!/usr/bin/env node
/**
 * Seed the three "I Am AI Ready" events (Build Brief v2, section 02).
 *
 *   node scripts/seed-events-iamairready.js            # dry run — prints, writes nothing
 *   node scripts/seed-events-iamairready.js --apply    # writes to Firestore
 *
 * Idempotent: matched on `code` ("E1"/"E2"/"E3"), so re-running updates the
 * three docs in place rather than creating duplicates. Only the fields defined
 * here are touched — anything an admin has since edited on another field stays.
 *
 * Entitlement lives per event AND per day (brief p3): E1 runs two days, E3 runs
 * three with a theme each, and F19/F20/F21 differ from F3 only by which of E3's
 * days they open. Hence `days[]` rather than a start/end pair alone.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

// dotenv isn't a dependency here — parse the few keys we need.
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
sa.private_key = sa.private_key.replace(/\\n/g, '\n');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
const db = admin.firestore();

const TZ = 'Asia/Kuala_Lumpur';

// Venue and capacity set provisionally on 2026-08-21 at Mandy's instruction so the
// three events are usable now — both are still formally open in the brief
// (questions 08 and 10) and expected to change. Start times remain as briefed.
const VENUE = 'Renaissance Hotel, KL';   // same venue string as the PEOPLElogy event
const PROVISIONAL_SEATS = 300;           // placeholder for all three, to be revised

const EVENTS = [
  {
    code: 'E1',
    title: 'BAFT Conference',
    date: '2026-11-17',
    endDate: '2026-11-18',
    time: '09:00',
    days: [
      { date: '2026-11-17', label: 'Day 1', startTime: '09:00' },
      { date: '2026-11-18', label: 'Day 2', startTime: '09:00' },
    ],
    description: 'Paid delegates only. Opened by ticket types P1 and P2, and by the internal Sponsor / Partner / Media passes.',
    assignmentMode: 'seat',
  },
  {
    code: 'E2',
    title: 'Award Gala Dinner',
    date: '2026-11-18',
    endDate: '2026-11-18',
    time: '19:00',
    days: [{ date: '2026-11-18', label: 'Evening', startTime: '19:00' }],
    description: 'Paid add-on, seated with tables. Opened by P2 only; whether the internal passes include it is brief open question 05.',
    assignmentMode: 'table',
  },
  {
    code: 'E3',
    title: 'Summit (NAIRW)',
    date: '2026-11-19',
    endDate: '2026-11-21',
    time: '09:00',
    days: [
      { date: '2026-11-19', label: 'Day 1', theme: 'SME & Public', startTime: '09:00' },
      { date: '2026-11-20', label: 'Day 2', theme: 'Workforce & Public', startTime: '09:00' },
      { date: '2026-11-21', label: 'Day 3', theme: 'Uni & Youth / Public', startTime: '09:00' },
    ],
    description: 'Free access, themed by day. Opened in full by P1, P2 and F3; single days by F19, F20 and F21. Whether the day themes gate entry or only label it is brief open question 06.',
    assignmentMode: 'seat',
  },
];

// Fields every one of the three shares.
const COMMON = {
  timezone: TZ,
  venue: VENUE,
  totalSeats: PROVISIONAL_SEATS,
  // Registration is the client's form calling our endpoint (brief p5), not this
  // app's public page — so nothing here should accept a walk-up RSVP yet.
  isActive: false,
  pinned: false,
};

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);

  for (const ev of EVENTS) {
    const payload = { ...COMMON, ...ev };
    const existing = await db.collection('events').where('code', '==', ev.code).get();

    if (existing.size > 1) {
      console.error(`  !! ${ev.code}: ${existing.size} docs already carry this code — resolve by hand, skipping`);
      continue;
    }

    const days = ev.days.map((d) => d.date.slice(8) + (d.theme ? ` (${d.theme})` : '')).join(', ');

    if (existing.size === 1) {
      const ref = existing.docs[0].ref;
      console.log(`  ~ ${ev.code} ${ev.title} — update ${ref.id} · ${ev.date}→${ev.endDate} · days ${days}`);
      if (APPLY) await ref.update({ ...payload, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      console.log(`  + ${ev.code} ${ev.title} — create · ${ev.date}→${ev.endDate} · days ${days}`);
      if (APPLY) {
        const ref = await db.collection('events').add({
          ...payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`      created ${ref.id}`);
      }
    }
  }

  if (!APPLY) console.log('\nNothing written. Re-run with --apply.');
}

main().catch((e) => { console.error(e); process.exit(1); });
