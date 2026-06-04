/**
 * One-off: swap two guests' email addresses in Firestore.
 *
 * Usage:
 *   node scripts/fix-emails.js          # dry run — finds + prints, writes nothing
 *   node scripts/fix-emails.js --apply  # performs the updates
 *
 * Matches by EXACT current email across every event's rsvps subcollection.
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const APPLY = process.argv.includes('--apply');

// Email changes: { from: exact current email, to: new email }
const CHANGES = [
  { from: 'limkj@gmail.com', to: 'kjlim288@gmail.com' },
  { from: 'limkj288@gmail.com', to: 'kjlim@gmail.com' },
];

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
  // Build a lookup of every rsvp doc keyed by exact email.
  const events = await db.collection('events').get();
  const byEmail = new Map(); // email -> array of {ref, name, company, eventTitle}
  for (const ev of events.docs) {
    const rsvps = await ev.ref.collection('rsvps').get();
    for (const r of rsvps.docs) {
      const d = r.data();
      const email = (d.email ?? '').trim();
      if (!email) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push({
        ref: r.ref,
        name: d.name ?? '(no name)',
        company: d.company ?? '',
        eventTitle: ev.data().title ?? ev.id,
      });
    }
  }

  // Resolve every change to exactly one doc BEFORE writing anything.
  const resolved = [];
  let fatal = false;
  for (const c of CHANGES) {
    const hits = byEmail.get(c.from) ?? [];
    if (hits.length === 0) {
      console.error(`✗ No guest found with email "${c.from}".`);
      fatal = true;
    } else if (hits.length > 1) {
      console.error(`✗ ${hits.length} guests share email "${c.from}" — refusing to guess:`);
      hits.forEach((h) => console.error(`    ${h.name} (${h.company}) — ${h.eventTitle}`));
      fatal = true;
    } else {
      resolved.push({ ...c, doc: hits[0] });
    }
  }
  if (fatal) {
    console.error('\nAborted — nothing written.');
    process.exit(1);
  }

  console.log(APPLY ? '── APPLYING ──' : '── DRY RUN (no writes) ──');
  for (const r of resolved) {
    console.log(
      `  ${r.doc.name} (${r.doc.company}) — ${r.doc.eventTitle}\n` +
        `    ${r.from}  →  ${r.to}`
    );
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply to write these changes.');
    return;
  }

  for (const r of resolved) {
    await r.doc.ref.update({ email: r.to, updatedAt: new Date().toISOString() });
    console.log(`✓ Updated ${r.doc.name}: ${r.to}`);
  }
  console.log('\nDone.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
