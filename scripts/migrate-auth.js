/**
 * Migrate Firebase Auth users between projects, PRESERVING UIDS (and, when the
 * source project's password-hash parameters are supplied, PRESERVING PASSWORDS).
 *
 * WHY UIDS MATTER: Firestore users/{uid} docs and rsvps.allocatedBy.uid key off
 * the Auth uid. Re-creating accounts with fresh uids would orphan every role doc
 * and every "allocated by" attribution.
 *
 * WHY THE HASH PARAMS: Firebase stores passwords as project-scoped SCRYPT hashes.
 * listUsers() returns each user's passwordHash/passwordSalt, but importing them
 * into a DIFFERENT project also needs that project's signer key + salt separator.
 * Get them from the OLD project's console:
 *   Authentication → Users → ⋮ (top-right) → "Password hash parameters"
 * Pass --hash-key and --salt-separator (both base64). Omit them and users are
 * imported WITHOUT a password — each then uses "Forgot password" to set one.
 * Custom claims (role) are preserved either way.
 *
 * Usage:
 *   node scripts/migrate-auth.js --source-key=./old-sa.json --target-key=./new-sa.json \
 *     --hash-key=BASE64_SIGNER_KEY --salt-separator=BASE64_SALT_SEP [--rounds=8] [--mem-cost=14] [--dry-run]
 *
 * Safe to re-run: importUsers upserts by uid.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const getArg = (n) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };

const sourceKeyPath = getArg('source-key');
const targetKeyPath = getArg('target-key');
const hashKeyB64 = getArg('hash-key');
const saltSepB64 = getArg('salt-separator');
const rounds = parseInt(getArg('rounds') || '8', 10);
const memoryCost = parseInt(getArg('mem-cost') || '14', 10);

if (!sourceKeyPath || !targetKeyPath) {
  console.error('Usage: node scripts/migrate-auth.js --source-key=./old-sa.json --target-key=./new-sa.json [--hash-key=… --salt-separator=…] [--dry-run]');
  process.exit(1);
}

function loadKey(p, label) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) { console.error(`✗ ${label} key not found: ${abs}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

const srcSA = loadKey(sourceKeyPath, 'Source');
const dstSA = loadKey(targetKeyPath, 'Target');
if (srcSA.project_id === dstSA.project_id) {
  console.error(`✗ Source and target are the SAME project (${srcSA.project_id}). Refusing to run.`);
  process.exit(1);
}

const preservePasswords = !!(hashKeyB64 && saltSepB64);

const srcApp = admin.initializeApp({ credential: admin.credential.cert(srcSA), projectId: srcSA.project_id }, 'src');
const dstApp = admin.initializeApp({ credential: admin.credential.cert(dstSA), projectId: dstSA.project_id }, 'dst');

(async () => {
  console.log(`\nAuth migration${DRY_RUN ? '  (DRY RUN)' : ''}`);
  console.log(`   source: ${srcSA.project_id}`);
  console.log(`   target: ${dstSA.project_id}`);
  console.log(`   passwords: ${preservePasswords ? 'PRESERVED (hash params supplied)' : 'NOT preserved — users must reset'}\n`);

  // Collect all source users (paginated).
  const users = [];
  let token;
  do {
    const page = await srcApp.auth().listUsers(1000, token);
    users.push(...page.users);
    token = page.pageToken;
  } while (token);

  console.log(`Found ${users.length} user(s):`);
  const importRecords = users.map((u) => {
    console.log(`   - ${u.email}  (uid ${u.uid})  claims=${JSON.stringify(u.customClaims || {})}`);
    const rec = {
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName,
      disabled: u.disabled,
      photoURL: u.photoURL,
      customClaims: u.customClaims || undefined,
      // Only federated links belong in providerData. The email/password provider
      // is represented by email + passwordHash, and importUsers rejects a
      // providerData entry with providerId "password".
      providerData: u.providerData
        .filter((p) => p.providerId !== 'password' && p.providerId !== 'firebase')
        .map((p) => ({ uid: p.uid, email: p.email, displayName: p.displayName, photoURL: p.photoURL, providerId: p.providerId })),
    };
    if (rec.providerData.length === 0) delete rec.providerData;
    if (preservePasswords && u.passwordHash && u.passwordSalt) {
      rec.passwordHash = Buffer.from(u.passwordHash, 'base64');
      rec.passwordSalt = Buffer.from(u.passwordSalt, 'base64');
    }
    return rec;
  });

  if (DRY_RUN) { console.log('\nDry run only — nothing written.'); process.exit(0); }

  const opts = preservePasswords
    ? { hash: { algorithm: 'SCRYPT', key: Buffer.from(hashKeyB64, 'base64'), saltSeparator: Buffer.from(saltSepB64, 'base64'), rounds, memoryCost } }
    : undefined;

  const result = await dstApp.auth().importUsers(importRecords, opts);
  console.log(`\n✓ Imported: ${result.successCount}   ✗ Failed: ${result.failureCount}`);
  if (result.failureCount > 0) {
    for (const e of result.errors) console.log(`   ✗ index ${e.index}: ${e.error.message}`);
    process.exit(1);
  }
  console.log(preservePasswords
    ? '\nDone — users keep their existing passwords.'
    : '\nDone — UIDs + roles preserved. Users must use "Forgot password" to set a password.');
  process.exit(0);
})().catch((e) => { console.error('\n✗ Auth migration failed:', e); process.exit(1); });
