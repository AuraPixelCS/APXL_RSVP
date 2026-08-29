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
  resolveKeyKind,
  targetEventCode,
  ticketRule,
  TEST_EVENT_SUFFIX,
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

console.log("\nresolveKeyKind");
const KEYS = { production: "prod-key-1", test: "test-key-1" };
check("production key → production", resolveKeyKind("prod-key-1", KEYS) === "production");
check("test key → test", resolveKeyKind("test-key-1", KEYS) === "test");
check("unknown key → null", resolveKeyKind("nope", KEYS) === null);
check("test key unset → only production matches", resolveKeyKind("test-key-1", { production: "prod-key-1" }) === null);
check("missing header → null", resolveKeyKind(undefined, KEYS) === null);

console.log("\nticketRule — Build Brief v3 codes");
const eventsOf = (t: string) => JSON.stringify(ticketRule(t)?.events ?? null);
check("complimentary → F3, E3 only, enabled", ticketRule("complimentary")?.code === "F3" && eventsOf("complimentary") === '["E3"]' && ticketRule("complimentary")?.enabled === true);
check("case + whitespace insensitive", ticketRule("  Pass-Complimentary ")?.code === "F3");
check("F3 accepted by its own code", ticketRule("F3")?.code === "F3");
check("F12 → E3, 12 Nov only", ticketRule("F12")?.code === "F12" && JSON.stringify(ticketRule("f12")?.days) === '["2026-11-12"]');
check("F13 → 13 Nov", JSON.stringify(ticketRule("F13")?.days) === '["2026-11-13"]');
check("F14 → 14 Nov", JSON.stringify(ticketRule("F14")?.days) === '["2026-11-14"]');
check("F3 has no day restriction", ticketRule("F3")?.days === undefined);
check("old F19/F20/F21 are gone (renamed, not remapped)", ticketRule("F19") === null && ticketRule("f20") === null && ticketRule("F21") === null);
check("P1 → E1 + E3, enabled", eventsOf("P1") === '["E1","E3"]' && ticketRule("p1")?.enabled === true);
check("P1 primary event is E1", ticketRule("P1")?.events[0] === "E1");
check("P2 → E1 + E2 + E3", eventsOf("P2") === '["E1","E2","E3"]');
check("partner alias standard-delegate → P1", ticketRule("standard-delegate")?.code === "P1");
check("partner alias baft_conference_usd → P1-INT", ticketRule("baft_conference_usd")?.code === "P1-INT" && eventsOf("baft_conference_usd") === '["E1","E3"]');
check("partner alias baft_gala_usd → P2-INT", ticketRule("baft_gala_usd")?.code === "P2-INT" && eventsOf("baft_gala_usd") === '["E1","E2","E3"]');
check("all-inclusive → P2", ticketRule("all-inclusive")?.code === "P2");
check("V-SP / V-PT / V-MD → E1 + E3 (Gala pending Q05)", eventsOf("V-SP") === '["E1","E3"]' && ticketRule("v-pt")?.code === "V-PT" && ticketRule("media")?.code === "V-MD");
check("every rule has a label", Object.values(["p1","p2","f3","f12","v-sp"]).every((t) => !!ticketRule(t)?.label));
check("unknown ticket → null", ticketRule("vip-lounge") === null);

console.log("\ntargetEventCode");
check("no suffix → unchanged", targetEventCode("E3", undefined) === "E3");
check("empty suffix → unchanged", targetEventCode("E3", "  ") === "E3");
check("test suffix appended", targetEventCode("E3", TEST_EVENT_SUFFIX) === "E3-TEST");

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
  days: ["2026-11-12", "2026-11-13"],
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
  check("days kept as sent", JSON.stringify(v.days) === JSON.stringify(["2026-11-12", "2026-11-13"]));
  check("consent 'yes' → true", v.consent === true);
  check("no explicit event", v.event === null);
}

console.log("\nnormalizeRegisterPayload — our contract shape");
const ours = normalizeRegisterPayload({
  externalRef: "ORD-77",
  ticketType: "F3",
  event: "E3",
  attendee: { fullName: "Ben Lee", email: "ben@x.io", phone: "0123", company: "X", jobTitle: "CTO" },
  days: "12 Nov, 13 Nov",
  consent: true,
});
check("accepted", ours.ok, ours);
if (ours.ok) {
  check("nested attendee read", ours.value.attendee.name === "Ben Lee" && ours.value.attendee.jobTitle === "CTO");
  check("explicit event kept", ours.value.event === "E3");
  check("comma-separated days split", JSON.stringify(ours.value.days) === JSON.stringify(["12 Nov", "13 Nov"]));
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
