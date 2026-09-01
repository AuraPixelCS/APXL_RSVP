/* Read-only: event titles + LCL2-* test registrations (for PEOPLElogy reply). */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const ROOT = path.resolve(__dirname, "..");
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
sa.private_key = sa.private_key.replace(/\\n/g, "\n");
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}
const db = admin.firestore();

(async () => {
  const events = await db.collection("events").get();
  console.log("=== EVENTS ===");
  for (const doc of events.docs) {
    const d = doc.data();
    console.log(`${doc.id} | code=${d.code} | title="${d.title}"`);
  }

  console.log("\n=== registrations in ALL E* events ===");
  let total = 0;
  for (const doc of events.docs) {
    const d = doc.data();
    if (!String(d.code || "").startsWith("E")) continue;
    const rsvps = await db.collection("events").doc(doc.id).collection("rsvps").get();
    for (const r of rsvps.docs) {
      const v = r.data();
      const ref = v.externalRef || "";
      const isLcl2 = String(ref).includes("LCL2") || String(v.name || "").includes("LCL2");
      console.log(
        `${d.code} | ${r.id} | ${v.email} | name="${v.name}" | ref="${ref}" | status=${v.status} | at=${v.submittedAt || v.createdAt || ""} | src=${v.source || ""}${isLcl2 ? " | LCL2" : ""}`
      );
      if (isLcl2) total += 1;
    }
  }
  console.log(`\nLCL2-tagged: ${total}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
