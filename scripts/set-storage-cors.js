/**
 * One-off: set CORS configuration on the Firebase Storage bucket so the
 * browser at https://www.aurapixel.live / https://apxl-rsvp.vercel.app can
 * upload via the client Storage SDK without preflight rejections.
 *
 * Usage:
 *   node scripts/set-storage-cors.js          # apply
 *   node scripts/set-storage-cors.js --show   # print current config and exit
 *
 * Reads bucket name from NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in .env.local.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ── Minimal .env.local loader ────────────────────────────────────────────────
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

const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  console.error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is missing from env');
  process.exit(1);
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY is missing from env');
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(sa),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: bucketName,
});

const bucket = admin.storage().bucket();

const CORS = [
  {
    origin: [
      'https://www.aurapixel.live',
      'https://aurapixel.live',
      'https://apxl-rsvp.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'x-goog-resumable',
      'x-firebase-storage-version',
      'x-firebase-gmpid',
    ],
    maxAgeSeconds: 3600,
  },
];

(async () => {
  if (process.argv.includes('--show')) {
    const [meta] = await bucket.getMetadata();
    console.log('Current CORS for', bucketName + ':');
    console.log(JSON.stringify(meta.cors ?? [], null, 2));
    return;
  }

  await bucket.setCorsConfiguration(CORS);
  console.log('CORS applied to bucket:', bucketName);
  console.log(JSON.stringify(CORS, null, 2));
})()
  .catch((err) => {
    console.error('Failed to set CORS:', err);
    process.exit(1);
  });
