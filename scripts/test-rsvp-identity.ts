/**
 * Tests for the deterministic RSVP id / duplicate guard.
 *
 *   node --experimental-strip-types scripts/test-rsvp-identity.ts
 *
 * The duplicate guard used to be a check-then-write with a casing bug. Both
 * failure modes are reproduced here against the real helpers.
 */

import {
  normalizeEmail,
  rsvpDocId,
  isAlreadyExistsError,
  rsvpEmailAlreadyExists,
} from "../lib/rsvpIdentity.ts";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
  }
}

console.log("\nnormalizeEmail");
check("lower-cases and trims", normalizeEmail("  Ali@Example.COM "), "ali@example.com");
check("null-safe", normalizeEmail(undefined as unknown as string), "");

console.log("\nrsvpDocId");
const base = rsvpDocId("evt1", "ali@example.com");
check("stable across calls", rsvpDocId("evt1", "ali@example.com"), base);
// THE CASING BUG: the old guard queried the raw address against a stored
// lower-cased one, so a capitalised address never matched and sailed through.
check("case-insensitive — the old casing bug", rsvpDocId("evt1", "ALI@Example.com"), base);
check("whitespace-insensitive", rsvpDocId("evt1", "  ali@example.com  "), base);
check("differs per event", rsvpDocId("evt2", "ali@example.com") !== base, true);
check("differs per guest", rsvpDocId("evt1", "bob@example.com") !== base, true);
check("id is Firestore-safe (32 hex chars, no '/')", /^[0-9a-f]{32}$/.test(base), true);

console.log("\nisAlreadyExistsError");
check("numeric gRPC code 6", isAlreadyExistsError({ code: 6 }), true);
check("string code", isAlreadyExistsError({ code: "already-exists" }), true);
check("message text", isAlreadyExistsError({ message: "5 ALREADY_EXISTS: entity already exists" }), true);
check("unrelated error is not swallowed", isAlreadyExistsError({ code: 7, message: "PERMISSION_DENIED" }), false);
check("null-safe", isAlreadyExistsError(null), false);

// ── rsvpEmailAlreadyExists against a fake collection ────────────────────────
// Models the two ways a guest can already be present: a new deterministic-id
// document, or a legacy random-id document from before this change.
function fakeCollection(docsById: Record<string, unknown>, emails: string[]) {
  return {
    doc: (id: string) => ({ get: async () => ({ exists: id in docsById }) }),
    where: (_f: string, _op: "==", value: string) => ({
      limit: () => ({ get: async () => ({ empty: !emails.includes(value) }) }),
    }),
  };
}

console.log("\nrsvpEmailAlreadyExists");
const detId = rsvpDocId("evt1", "ali@example.com");
check("finds a deterministic-id record",
  await rsvpEmailAlreadyExists(fakeCollection({ [detId]: {} }, []), "evt1", "ali@example.com"), true);
check("finds a legacy random-id record by email",
  await rsvpEmailAlreadyExists(fakeCollection({}, ["ali@example.com"]), "evt1", "ali@example.com"), true);
check("legacy lookup normalises the query value",
  await rsvpEmailAlreadyExists(fakeCollection({}, ["ali@example.com"]), "evt1", "ALI@Example.com "), true);
check("absent guest → false",
  await rsvpEmailAlreadyExists(fakeCollection({}, ["someone@else.com"]), "evt1", "ali@example.com"), false);
check("empty email → false (no lookup)",
  await rsvpEmailAlreadyExists(fakeCollection({}, []), "evt1", "   "), false);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
