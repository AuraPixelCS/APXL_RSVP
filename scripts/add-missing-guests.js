/**
 * One-off: add guests who missed RSVP (internal error) to the PEOPLElogy event.
 * Adds them as PENDING + attending so they appear in the allocator for seating
 * and notification. Skips any email that already exists (safe to re-run).
 *
 * Usage:
 *   node scripts/add-missing-guests.js            # writes
 *   node scripts/add-missing-guests.js --dry-run  # preview only
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Minimal .env.local loader (project has no dotenv dep) ────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env.local');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

// Normalise a Malaysian mobile to E.164 (+60…). Leaves already-+ numbers as-is.
function toE164(raw) {
  const digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0')) return '+60' + digits.slice(1);
  if (digits.startsWith('60')) return '+' + digits;
  return '+60' + digits;
}

const GUESTS = [
  {
    name: 'Arvin',
    email: 'vmaastudio@gmail.com',
    phone: '', // not provided
    company: '-',
    jobTitle: '-',
  },
];

(async () => {
  const snap = await db.collection('events').get();
  const matches = snap.docs.filter((d) =>
    (d.data().title ?? '').toLowerCase().includes('peoplelogy')
  );
  if (matches.length !== 1) {
    console.error(`Expected exactly 1 PEOPLElogy event, found ${matches.length}.`);
    matches.forEach((d) => console.error(`  - ${d.id} :: ${d.data().title}`));
    process.exit(1);
  }
  const eventDoc = matches[0];
  const eventId = eventDoc.id;
  console.log(`Event: ${eventDoc.data().title} [${eventId}]${DRY_RUN ? '  (DRY RUN)' : ''}\n`);

  const rsvpsRef = db.collection('events').doc(eventId).collection('rsvps');
  const now = new Date().toISOString();

  for (const g of GUESTS) {
    const existing = await rsvpsRef.where('email', '==', g.email).limit(1).get();
    if (!existing.empty) {
      console.log(`↷ SKIP (already exists): ${g.name} <${g.email}>`);
      continue;
    }

    const doc = {
      eventId,
      name: g.name,
      email: g.email,
      phone: g.phone,
      attending: true,
      plusOne: false,
      partOf: 'Guest',
      company: g.company,
      jobTitle: g.jobTitle,
      status: 'pending',
      seatNumber: null,
      qrToken: null,
      qrIssuedAt: null,
      whatsappConfirmSent: false,
      whatsappQRSent: false,
      notifiedAt: null,
      submittedAt: now,
      updatedAt: now,
    };

    if (DRY_RUN) {
      console.log(`+ WOULD ADD: ${g.name} <${g.email}> ${g.phone} · ${g.company} / ${g.jobTitle}`);
    } else {
      const ref = await rsvpsRef.add(doc);
      console.log(`✓ ADDED: ${g.name} <${g.email}> ${g.phone} · ${g.company} / ${g.jobTitle}  [${ref.id}]`);
    }
  }
  console.log('\nDone.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
