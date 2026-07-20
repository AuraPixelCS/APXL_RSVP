/**
 * Copy an entire Firestore database from one Firebase project to another,
 * PRESERVING DOCUMENT IDS.
 *
 * WHY IDS MATTER: QR entry-pass tokens are an HMAC over a payload containing
 * { rsvpId, eventId } (lib/qr.ts). If migration mints new document ids, every
 * pass already emailed — and every /pass?t=… link — stops verifying. This script
 * writes with .doc(originalId).set(...) so tokens keep working. WEBHOOK_EVENT_ID
 * also refers to an event document id, so it survives too.
 *
 * It walks every root collection and recurses into subcollections
 * (events/{id}/rsvps/{id}), so nothing has to be hardcoded.
 *
 * Usage:
 *   node scripts/migrate-firestore.js --source-key=./old-sa.json --target-key=./new-sa.json --dry-run
 *   node scripts/migrate-firestore.js --source-key=./old-sa.json --target-key=./new-sa.json
 *
 * Options:
 *   --dry-run          Read + report only. Writes nothing.
 *   --only=a,b         Restrict to these root collections (default: all).
 *   --source-key=PATH  Service-account JSON for the OLD project (required).
 *   --target-key=PATH  Service-account JSON for the NEW project (required).
 *
 * Safe to re-run: writes are set() by id, so a second run overwrites rather
 * than duplicating. It never deletes anything in either project.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const getArg = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const sourceKeyPath = getArg('source-key');
const targetKeyPath = getArg('target-key');
const onlyArg = getArg('only');
const ONLY = onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null;

if (!sourceKeyPath || !targetKeyPath) {
  console.error('Usage: node scripts/migrate-firestore.js --source-key=./old-sa.json --target-key=./new-sa.json [--dry-run] [--only=events,users]');
  process.exit(1);
}

function loadKey(p, label) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    console.error(`✗ ${label} service-account file not found: ${abs}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    console.error(`✗ ${label} service-account file is not valid JSON: ${abs}`);
    process.exit(1);
  }
}

const srcSA = loadKey(sourceKeyPath, 'Source');
const dstSA = loadKey(targetKeyPath, 'Target');

if (!srcSA.project_id || !dstSA.project_id) {
  console.error('✗ Service-account JSON is missing project_id.');
  process.exit(1);
}
if (srcSA.project_id === dstSA.project_id) {
  console.error(`✗ Source and target are the SAME project (${srcSA.project_id}). Refusing to run.`);
  process.exit(1);
}

// ── Init both projects ───────────────────────────────────────────────────────
const srcApp = admin.initializeApp(
  { credential: admin.credential.cert(srcSA), projectId: srcSA.project_id },
  'source',
);
const dstApp = admin.initializeApp(
  { credential: admin.credential.cert(dstSA), projectId: dstSA.project_id },
  'target',
);
const srcDb = srcApp.firestore();
const dstDb = dstApp.firestore();

// Firestore rejects batches over 500 writes.
const BATCH_LIMIT = 400;

const stats = {
  docs: 0,
  collections: 0,
  storageUrls: new Set(),
  docRefFields: new Set(),
  perCollection: {},
};

// ── Value inspection ─────────────────────────────────────────────────────────
// Flag two things that do NOT survive a project move on their own:
//   1. DocumentReference values — they encode the OLD project id.
//   2. Storage download URLs — they point at the OLD bucket and will 404.
function scanValue(value, trail, docPath) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (value.includes('firebasestorage.googleapis.com') || value.includes('.firebasestorage.app')) {
      stats.storageUrls.add(`${docPath} → ${trail}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanValue(v, `${trail}[${i}]`, docPath));
    return;
  }
  if (typeof value === 'object') {
    // admin DocumentReference has .firestore + .path; Timestamp has .toDate.
    if (typeof value.path === 'string' && value.firestore) {
      stats.docRefFields.add(`${docPath} → ${trail}`);
      return;
    }
    if (typeof value.toDate === 'function') return; // Timestamp — copies fine
    if (Buffer.isBuffer(value)) return;
    for (const [k, v] of Object.entries(value)) {
      scanValue(v, trail ? `${trail}.${k}` : k, docPath);
    }
  }
}

// ── Recursive copy ───────────────────────────────────────────────────────────
async function copyCollection(srcCol, dstCol, label) {
  const snap = await srcCol.get();
  if (snap.empty) {
    console.log(`   · ${label} — empty`);
    return;
  }
  stats.collections++;
  stats.perCollection[label] = (stats.perCollection[label] || 0) + snap.size;

  let batch = dstDb.batch();
  let ops = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    scanValue(data, '', `${label}/${doc.id}`);
    if (!DRY_RUN) {
      batch.set(dstCol.doc(doc.id), data);
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = dstDb.batch();
        ops = 0;
      }
    }
    stats.docs++;
  }
  if (!DRY_RUN && ops > 0) await batch.commit();
  console.log(`   ${DRY_RUN ? '·' : '✓'} ${label} — ${snap.size} doc${snap.size === 1 ? '' : 's'}`);

  // Recurse into each document's subcollections (events/{id}/rsvps/...).
  for (const doc of snap.docs) {
    const subs = await srcCol.doc(doc.id).listCollections();
    for (const sub of subs) {
      await copyCollection(sub, dstCol.doc(doc.id).collection(sub.id), `${label}/${doc.id}/${sub.id}`);
    }
  }
}

// ── Verify ───────────────────────────────────────────────────────────────────
async function verify() {
  console.log('\n── Verification (source vs target doc counts) ──');
  let mismatch = false;
  for (const [label, srcCount] of Object.entries(stats.perCollection)) {
    const dstCount = (await dstDb.collection(label).get()).size;
    const ok = dstCount === srcCount;
    if (!ok) mismatch = true;
    console.log(`   ${ok ? '✓' : '✗'} ${label}: source ${srcCount} / target ${dstCount}`);
  }
  return !mismatch;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nFirestore migration${DRY_RUN ? '  (DRY RUN — nothing will be written)' : ''}`);
  console.log(`   source: ${srcSA.project_id}`);
  console.log(`   target: ${dstSA.project_id}\n`);

  let roots = await srcDb.listCollections();
  if (ONLY) roots = roots.filter((c) => ONLY.includes(c.id));
  if (roots.length === 0) {
    console.log('No root collections found in the source project — nothing to do.');
    process.exit(0);
  }
  console.log(`Root collections: ${roots.map((c) => c.id).join(', ')}\n`);

  for (const col of roots) {
    await copyCollection(col, dstDb.collection(col.id), col.id);
  }

  console.log(`\n${DRY_RUN ? 'Would copy' : 'Copied'} ${stats.docs} document(s) across ${stats.collections} collection(s).`);

  if (stats.docRefFields.size > 0) {
    console.log('\n⚠  DocumentReference fields found — these still encode the OLD project id');
    console.log('   and must be repointed by hand:');
    for (const f of stats.docRefFields) console.log(`     - ${f}`);
  }

  if (stats.storageUrls.size > 0) {
    console.log('\n⚠  Storage download URLs found — these point at the OLD bucket and will 404');
    console.log('   once the old project goes away. Re-upload each image in the admin UI');
    console.log('   (Notifications → Template → Email Editor) so the field is rewritten:');
    for (const f of stats.storageUrls) console.log(`     - ${f}`);
  }

  if (!DRY_RUN) {
    const ok = await verify();
    console.log(ok ? '\n✓ Migration complete — counts match.' : '\n✗ Counts do NOT match. Re-run before switching env vars.');
    process.exit(ok ? 0 : 1);
  } else {
    console.log('\nDry run only. Re-run without --dry-run to write.');
  }
})().catch((e) => {
  console.error('\n✗ Migration failed:', e);
  process.exit(1);
});
