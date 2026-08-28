/**
 * Tests for the partner-form integration rules (lib/integration.ts).
 *
 *   node --experimental-strip-types scripts/test-integration.ts
 *
 * Pins the payload contract the client's backend codes against: which field
 * names are accepted, which tickets are open, and that retries are keyed on
 * their reference — not on anything we invent.
 */

import {
  apiKeyMatches,
  normalizeRegisterPayload,
  targetEventCode,
  ticketRule,
} from "../lib/integration.ts";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

console.log("\napiKeyMatches");
check("matches identical key", apiKeyMatches("abc123", "abc123"));
check("rejects wrong key", !apiKeyMatches("abc124", "abc123"));
check("rejects different length", !apiKeyMatches("abc", "abc123"));
check("rejects missing header", !apiKeyMatches(undefined, "abc123"));
check("rejects when unconfigured", !apiKeyMatches("abc123", undefined));
check("rejects array header", !apiKeyMatches(["abc123"], "abc123"));

console.log("\nticketRule");
check("complimentary → E3 / F3 enabled", ticketRule("complimentary")?.event === "E3" && ticketRule("complimentary")?.enabled === true);
check("case + whitespace insensitive", ticketRule("  Pass-Complimentary ")?.code === "F3");
check("F19 keeps its own code", ticketRule("F19")?.code === "F19");
check("BAFT standard-delegate recognised but disabled", ticketRule("standard-delegate")?.enabled === false);
check("client's baft_gala_usd maps to P2-INT", ticketRule("baft_gala_usd")?.code === "P2-INT");
check("unknown ticket → null", ticketRule("vip-lounge") === null);

console.log("\ntargetEventCode");
check("no suffix → unchanged", targetEventCode("E3", undefined) === "E3");
check("empty suffix → unchanged", targetEventCode("E3", "  ") === "E3");
check("staging suffix appended", targetEventCode("E3", "-TEST") === "E3-TEST");

console.log("\nnormalizeRegisterPayload — client's complimentary form shape");
const theirs = normalizeRegisterPayload({
  submission_id: "CP-000123",
  pass_id: "complimentary",
  name: "  Aisyah Rahman ",
  email: "Aisyah@Example.com",
  phone: "+60123456789",
  organisation: "Example Sdn Bhd",
  job_title: "Head of People",
  industry: "Education",
  days: ["2026-11-19", "2026-11-20"],
  consent: "yes",
});
check("accepted", theirs.ok, theirs);
if (theirs.ok) {
  const v = theirs.value;
  check("externalRef from submission_id", v.externalRef === "CP-000123");
  check("ticketType from pass_id", v.ticketType === "complimentary");
  check("name trimmed", v.attendee.name === "Aisyah Rahman");
  check("email lower-cased", v.attendee.email === "aisyah@example.com");
  check("organisation → company", v.attendee.company === "Example Sdn Bhd");
  check("job_title → jobTitle", v.attendee.jobTitle === "Head of People");
  check("days kept as sent", JSON.stringify(v.days) === JSON.stringify(["2026-11-19", "2026-11-20"]));
  check("consent 'yes' → true", v.consent === true);
  check("no explicit event", v.event === null);
}

console.log("\nnormalizeRegisterPayload — our contract shape");
const ours = normalizeRegisterPayload({
  externalRef: "ORD-77",
  ticketType: "F3",
  event: "E3",
  attendee: { fullName: "Ben Lee", email: "ben@x.io", phone: "0123", company: "X", jobTitle: "CTO" },
  days: "19 Nov, 20 Nov",
  consent: true,
});
check("accepted", ours.ok, ours);
if (ours.ok) {
  check("nested attendee read", ours.value.attendee.name === "Ben Lee" && ours.value.attendee.jobTitle === "CTO");
  check("explicit event kept", ours.value.event === "E3");
  check("comma-separated days split", JSON.stringify(ours.value.days) === JSON.stringify(["19 Nov", "20 Nov"]));
}

console.log("\nnormalizeRegisterPayload — rejections");
const noRef = normalizeRegisterPayload({ name: "A", email: "a@b.co", phone: "1" });
check("missing externalRef rejected", !noRef.ok && noRef.field === "externalRef");
const noName = normalizeRegisterPayload({ externalRef: "1", email: "a@b.co", phone: "1" });
check("missing name rejected", !noName.ok && noName.field === "name");
const badEmail = normalizeRegisterPayload({ externalRef: "1", name: "A", email: "not-an-email", phone: "1" });
check("bad email rejected", !badEmail.ok && badEmail.field === "email");
const noPhone = normalizeRegisterPayload({ externalRef: "1", name: "A", email: "a@b.co" });
check("missing phone rejected", !noPhone.ok && noPhone.field === "phone");
const tooLong = normalizeRegisterPayload({ externalRef: "1", name: "A".repeat(121), email: "a@b.co", phone: "1" });
check("over-long name rejected", !tooLong.ok && tooLong.field === "name");
check("non-object body rejected", !normalizeRegisterPayload("hello").ok);
const defaulted = normalizeRegisterPayload({ externalRef: "1", name: "A", email: "a@b.co", phone: "1" });
check("ticketType defaults to complimentary", defaulted.ok && defaulted.value.ticketType === "complimentary");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
