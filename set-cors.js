const fs = require('fs');
const admin = require('firebase-admin');

// 1. Read .env.local manually to get the key
const envFile = fs.readFileSync('.env.local', 'utf8');
let serviceAccountKeyStr = '';
let bucketName = '';

for (const line of envFile.split('\n')) {
  if (line.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY=')) {
    serviceAccountKeyStr = line.substring('FIREBASE_SERVICE_ACCOUNT_KEY='.length);
  }
  if (line.startsWith('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=')) {
    bucketName = line.substring('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='.length).trim();
  }
}

if (!serviceAccountKeyStr || !bucketName) {
  console.error("Missing config in .env.local");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountKeyStr);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketName
});

const bucket = admin.storage().bucket();

const corsConfiguration = [
  {
    origin: ['*'], // Or specifically 'http://localhost:3000'
    method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
    maxAgeSeconds: 3600,
  },
];

async function setCors() {
  try {
    await bucket.setCorsConfiguration(corsConfiguration);
    console.log('Successfully updated CORS configuration for bucket:', bucketName);
  } catch (error) {
    console.error('Error setting CORS config:', error);
  }
}

setCors();
