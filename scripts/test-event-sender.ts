/**
 * Tests for per-event sender resolution.
 *
 *   node --experimental-strip-types scripts/test-event-sender.ts
 *
 * The critical property: an admin typing an address on an UNVERIFIED domain
 * must not break sending. Resend rejects such a `from`, so the resolver falls
 * back to the known-good global identity instead of failing delivery.
 */

process.env.RESEND_FROM = "PEOPLElogy Anniversary RSVP <events@aurapixel.live>";
process.env.RESEND_REPLY_TO = "hello@aurapixel.live";

const { resolveEventSender, isPlausibleEmail, isSenderDomainAllowed } =
  await import("../lib/eventSender.ts");

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); }
}

console.log("\nisPlausibleEmail");
check("accepts a normal address", isPlausibleEmail("a@b.co"), true);
check("rejects a bare word", isPlausibleEmail("nope"), false);
check("rejects a display-name form", isPlausibleEmail("Name <a@b.co>"), false);
check("rejects embedded spaces", isPlausibleEmail("a b@c.co"), false);

console.log("\nisSenderDomainAllowed (inferred from RESEND_FROM)");
check("same domain allowed", isSenderDomainAllowed("events@aurapixel.live"), true);
check("subdomain allowed", isSenderDomainAllowed("x@mail.aurapixel.live"), true);
check("other domain rejected", isSenderDomainAllowed("x@gmail.com"), false);

console.log("\nresolveEventSender");
check("unset event → global identity", resolveEventSender({}), {
  from: "PEOPLElogy Anniversary RSVP <events@aurapixel.live>",
  replyTo: "hello@aurapixel.live",
});
check("name only → rewraps the global address", resolveEventSender({ senderName: "Acme Gala" }), {
  from: "Acme Gala <events@aurapixel.live>",
  replyTo: "hello@aurapixel.live",
});
check("name + verified address", resolveEventSender({ senderName: "Acme Gala", senderEmail: "gala@aurapixel.live" }), {
  from: "Acme Gala <gala@aurapixel.live>",
  replyTo: "hello@aurapixel.live",
});
check("address only → bare address", resolveEventSender({ senderEmail: "gala@aurapixel.live" }), {
  from: "gala@aurapixel.live",
  replyTo: "hello@aurapixel.live",
});
check("custom reply-to honoured", resolveEventSender({ replyToEmail: "team@client.com" }).replyTo, "team@client.com");
check("invalid reply-to falls back", resolveEventSender({ replyToEmail: "oops" }).replyTo, "hello@aurapixel.live");

const unverified = resolveEventSender({ senderName: "Acme", senderEmail: "gala@notverified.com" });
check("unverified domain falls back to global from", unverified.from, "PEOPLElogy Anniversary RSVP <events@aurapixel.live>");
check("unverified domain warns", typeof unverified.warning === "string" && unverified.warning.includes("not verified"), true);

const malformed = resolveEventSender({ senderEmail: "not-an-email" });
check("malformed address falls back", malformed.from, "PEOPLElogy Anniversary RSVP <events@aurapixel.live>");
check("malformed address warns", typeof malformed.warning === "string", true);

check("valid config produces no warning", resolveEventSender({ senderEmail: "gala@aurapixel.live" }).warning, undefined);
check("null event is safe", resolveEventSender(null).from, "PEOPLElogy Anniversary RSVP <events@aurapixel.live>");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
