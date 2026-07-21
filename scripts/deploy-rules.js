/**
 * Deploy firestore.rules to a project via the Firebase Rules REST API, using a
 * service-account key directly (no firebase-tools login / no serviceusage perms).
 *
 * Usage: node scripts/deploy-rules.js --key=./new-sa.json [--rules=firestore.rules]
 */
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const argv = process.argv.slice(2);
const getArg = (n) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
const keyPath = getArg('key');
const rulesPath = getArg('rules') || 'firestore.rules';
if (!keyPath) { console.error('Usage: node scripts/deploy-rules.js --key=./new-sa.json [--rules=firestore.rules]'); process.exit(1); }

const sa = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), keyPath), 'utf8'));
const project = sa.project_id;
const rules = fs.readFileSync(path.resolve(process.cwd(), rulesPath), 'utf8');

async function main() {
  const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `https://firebaserules.googleapis.com/v1/projects/${project}`;

  console.log(`Deploying ${rulesPath} → ${project} (${rules.split(/\n/).length} lines)`);

  // 1) Create a ruleset from the source.
  const rsRes = await fetch(`${base}/rulesets`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  const rsBody = await rsRes.json();
  if (!rsRes.ok) { console.error('✗ create ruleset failed:', rsRes.status, JSON.stringify(rsBody)); process.exit(1); }
  const rulesetName = rsBody.name;
  console.log('✓ ruleset created:', rulesetName);

  // 2) Point the cloud.firestore release at the new ruleset (PATCH; create on 404).
  const releaseName = `projects/${project}/releases/cloud.firestore`;
  let relRes = await fetch(`${base}/releases/cloud.firestore`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
  });
  if (relRes.status === 404) {
    relRes = await fetch(`${base}/releases`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ name: releaseName, rulesetName }),
    });
  }
  const relBody = await relRes.json();
  if (!relRes.ok) { console.error('✗ release update failed:', relRes.status, JSON.stringify(relBody)); process.exit(1); }
  console.log('✓ released to cloud.firestore');
  console.log('\nRules are live on', project);
}
main().catch((e) => { console.error('✗', e.message); process.exit(1); });
