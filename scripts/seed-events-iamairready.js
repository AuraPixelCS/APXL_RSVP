#!/usr/bin/env node
/**
 * Seed the three November 2026 events (Build Brief v3, 28 Aug 2026).
 *
 *   node scripts/seed-events-iamairready.js                 # dry run — prints, writes nothing
 *   node scripts/seed-events-iamairready.js --apply         # writes E1 / E2 / E3
 *   node scripts/seed-events-iamairready.js --apply --twins # also E1-TEST / E2-TEST / E3-TEST
 *
 * Idempotent: matched on `code`, so re-running updates in place rather than
 * creating duplicates. Only the fields defined here are touched — anything an
 * admin has since edited on another field stays.
 *
 * v3 changes vs v2 (2026-08-30): the Summit moved to 12–14 Nov at The Campus
 * Ampang; BAFT + Gala are at Marriott Petaling Jaya on 17–18 Nov; the free
 * single-day codes are F12/F13/F14 (were F19/F20/F21). BAFT is free seating.
 *
 * `--twins` writes a "-TEST" twin of each event (title suffixed "— TEST",
 * inactive). The partner's test API key registers into the twins, so their
 * QA/UAT traffic never touches a real guest list. Remove with
 * scripts/remove-test-events.js.
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

const TWINS = process.argv.includes('--twins');
const TEST_SUFFIX = '-TEST';

// Venues per Build Brief v3. Capacity is still brief open question 09 — these
// are generous working caps so no paid delegate is ever refused; tighten from
// the event's settings once the client gives real numbers.
const VENUE_BAFT = 'Marriott Petaling Jaya';
const VENUE_SUMMIT = 'The Campus Ampang';
const SEATS = { E1: 500, E2: 300, E3: 1000 };

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
    venue: VENUE_BAFT,
    totalSeats: SEATS.E1,
    // Free seating (2026-08-28): the pass is minted at registration.
    assignmentMode: 'free',
  },
  {
    code: 'E2',
    title: 'Award Gala Dinner',
    date: '2026-11-18',
    endDate: '2026-11-18',
    time: '19:00',
    days: [{ date: '2026-11-18', label: 'Evening', startTime: '19:00' }],
    description: 'Paid add-on, seated with tables. Opened by P2 only; whether the internal passes include it is brief open question 05.',
    venue: VENUE_BAFT,
    totalSeats: SEATS.E2,
    assignmentMode: 'table',
  },
  {
    code: 'E3',
    title: 'Summit (NAIRW)',
    date: '2026-11-12',
    endDate: '2026-11-14',
    time: '09:00',
    days: [
      { date: '2026-11-12', label: 'Day 1', theme: 'SME & Public', startTime: '09:00' },
      { date: '2026-11-13', label: 'Day 2', theme: 'Workforce & Public', startTime: '09:00' },
      { date: '2026-11-14', label: 'Day 3', theme: 'Uni & Youth / Public', startTime: '09:00' },
    ],
    description: 'Free access, themed by day. Opened in full by P1, P2 and F3; single days by F12, F13 and F14. Whether the day themes gate entry or only label it is brief open question 06.',
    venue: VENUE_SUMMIT,
    totalSeats: SEATS.E3,
    // Free seating (2026-08-28): nobody is allocated; the pass is minted at registration.
    assignmentMode: 'free',
  },
];

// Fields every one of the three shares.
const COMMON = {
  timezone: TZ,
  // Sender identity on every pass email. RESEND_FROM still carries the old
  // "PEOPLElogy Anniversary RSVP" display name, which is wrong for November.
  // The address must stay on the Resend-verified aurapixel.live domain.
  senderName: 'PEOPLElogy Events',
  senderEmail: 'events@aurapixel.live',
  // Registration is the client's form calling our endpoint (brief p5), not this
  // app's public page — so nothing here should accept a walk-up RSVP yet.
  isActive: false,
  pinned: false,
};

async function main() {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · project ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}\n`);

  const targets = [...EVENTS];
  if (TWINS) {
    for (const ev of EVENTS) {
      targets.push({
        ...ev,
        code: `${ev.code}${TEST_SUFFIX}`,
        title: `${ev.title} — TEST`,
        description: `Test twin of ${ev.code}. Receives the partner's registrations sent with the TEST API key. Safe to delete after go-live (scripts/remove-test-events.js).`,
      });
    }
  }

  for (const ev of targets) {
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
