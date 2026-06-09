/**
 * READ-ONLY: inspect an event's seating config + allocation breakdown.
 *
 * Usage:
 *   node scripts/inspect-seating.js <titleSubstring>
 *   node scripts/inspect-seating.js peoplelogy
 *
 * Writes nothing. Used to decide whether a seat-number remap is needed before
 * reshaping the seat-map front row.
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

const [, , titleArg] = process.argv;
if (!titleArg) {
  console.error('Usage: node scripts/inspect-seating.js <titleSubstring>');
  process.exit(1);
}

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

(async () => {
  const snap = await db.collection('events').get();
  const matches = snap.docs.filter((d) =>
    (d.data().title ?? '').toLowerCase().includes(titleArg.toLowerCase())
  );
  if (matches.length === 0) {
    console.error(`No events matched "${titleArg}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Multiple events matched "${titleArg}":`);
    matches.forEach((d) => console.error(`  - ${d.id} :: ${d.data().title}`));
    process.exit(1);
  }

  const doc = matches[0];
  const ev = doc.data();
  const cfg = ev.seatingConfig ?? {};
  const spt = cfg.seatsPerTable ?? 10;
  const totalSeats = ev.totalSeats ?? 0;
  console.log('\n=== EVENT ===');
  console.log('id           :', doc.id);
  console.log('title        :', ev.title);
  console.log('totalSeats   :', totalSeats, '(standard)');
  console.log('seatingConfig:', JSON.stringify(cfg));
  console.log('assignMode   :', ev.assignmentMode ?? '(unset)');
  const tableCount = Math.ceil(totalSeats / spt);
  console.log('=> standard tables:', tableCount, `(${spt} seats each)`);

  const rsvpSnap = await doc.ref.collection('rsvps').get();
  const seated = rsvpSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.seatNumber != null && (r.status === 'allocated' || r.status === 'checked_in'));

  console.log('\n=== ALLOCATION ===');
  console.log('rsvps total           :', rsvpSnap.size);
  console.log('seated (alloc/checkin):', seated.length);

  // Breakdown by table
  const byTable = new Map();
  let vipCount = 0;
  for (const r of seated) {
    if (r.seatNumber > totalSeats) { vipCount++; continue; }
    const t = Math.ceil(r.seatNumber / spt);
    byTable.set(t, (byTable.get(t) ?? 0) + 1);
  }
  console.log('seated on VIP seats   :', vipCount);
  const occupiedTables = [...byTable.keys()].sort((a, b) => a - b);
  console.log('occupied std tables   :', occupiedTables.length ? occupiedTables.join(', ') : '(none)');

  // The two tables the client pulled from the front (old T4, T5 = seats 31..50)
  const t4 = byTable.get(4) ?? 0;
  const t5 = byTable.get(5) ?? 0;
  console.log('\n=== FRONT-CENTER TABLES (the ones being moved) ===');
  console.log('Table 4 (seats 31-40) guests:', t4);
  console.log('Table 5 (seats 41-50) guests:', t5);
  console.log('Tables 6-30 (seats 51+) guests:', occupiedTables.filter((t) => t >= 6).reduce((s, t) => s + byTable.get(t), 0));
  console.log('Tables 1-3 (unchanged) guests:', [1, 2, 3].reduce((s, t) => s + (byTable.get(t) ?? 0), 0));

  console.log('\n=== VERDICT ===');
  if (seated.length === 0) {
    console.log('No one is seated yet → renderer reshape alone is enough. No migration needed.');
  } else {
    console.log('Guests are seated. A seat-number remap is needed to relocate tables 4-30 while keeping groups intact.');
  }
  process.exit(0);
})();
