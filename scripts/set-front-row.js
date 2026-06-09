/**
 * One-off: set (or unset) seatingConfig.frontRowTablesPerSide on an event.
 * Makes the banquet / banquet-runway seat map render a smaller FIRST row,
 * dropping the inner tables nearest the aisle to widen the front of the room.
 *
 * Usage:
 *   node scripts/set-front-row.js <titleSubstring> <perSide|unset>
 *
 * Examples:
 *   node scripts/set-front-row.js peoplelogy 3      # front row = 3+3 = 6 tables
 *   node scripts/set-front-row.js peoplelogy unset  # revert to uniform rows
 *
 * Reversible. Touches only the named event's seatingConfig. Does NOT move any
 * guest — seat numbers are unchanged.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

const [, , titleArg, valueArg] = process.argv;
if (!titleArg || !valueArg) {
  console.error('Usage: node scripts/set-front-row.js <titleSubstring> <perSide|unset>');
  process.exit(1);
}
const unset = valueArg.toLowerCase() === 'unset';
const perSide = unset ? null : Number(valueArg);
if (!unset && (!Number.isInteger(perSide) || perSide < 1 || perSide > 6)) {
  console.error('perSide must be an integer 1-6, or "unset".');
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
  const cfg = doc.data().seatingConfig ?? {};
  const before = cfg.frontRowTablesPerSide ?? '(unset)';
  const tps = cfg.tablesPerSide ?? '(unset)';

  if (unset) {
    await doc.ref.update({
      'seatingConfig.frontRowTablesPerSide': admin.firestore.FieldValue.delete(),
      updatedAt: new Date().toISOString(),
    });
  } else {
    await doc.ref.update({
      'seatingConfig.frontRowTablesPerSide': perSide,
      updatedAt: new Date().toISOString(),
    });
  }

  console.log(`Event: ${doc.id} :: ${doc.data().title}`);
  console.log(`tablesPerSide (per row, unchanged): ${tps}`);
  console.log(`frontRowTablesPerSide: ${before} -> ${unset ? '(unset)' : perSide}`);
  if (!unset) {
    console.log(`Front row will now show ${perSide * 2} tables; other rows ${tps !== '(unset)' ? tps * 2 : '?'}.`);
  }
  process.exit(0);
})();
