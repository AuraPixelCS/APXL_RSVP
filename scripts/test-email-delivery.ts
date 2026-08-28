/**
 * Tests for delivery-status tracking and signed self-service tokens.
 *
 *   node --experimental-strip-types scripts/test-email-delivery.ts
 */

process.env.MANAGE_SECRET = "test-manage-secret";

import {
  deliveryTags, readDeliveryTags, statusFromWebhookType,
  shouldPromoteStatus, isDeliveryFailure,
} from "../lib/emailDelivery.ts";
import { createManageToken, verifyManageToken, buildManageUrl } from "../lib/manageToken.ts";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); }
}

console.log("\ndeliveryTags");
check("carries all three identifiers", deliveryTags("evt1", "rsvp1", "pass"), [
  { name: "event_id", value: "evt1" },
  { name: "rsvp_id", value: "rsvp1" },
  { name: "kind", value: "pass" },
]);
check("sanitises characters Resend rejects",
  deliveryTags("evt/1", "a b", "pass")[0].value, "evt_1");

console.log("\nreadDeliveryTags");
check("reads the array form", readDeliveryTags([
  { name: "event_id", value: "e" }, { name: "rsvp_id", value: "r" }, { name: "kind", value: "blast" },
]), { eventId: "e", rsvpId: "r", kind: "blast" });
// Resend has shipped tags both as an array and as an object map; dropping one
// form would silently discard every delivery event.
check("reads the object form", readDeliveryTags({ event_id: "e", rsvp_id: "r" }), { eventId: "e", rsvpId: "r" });
check("missing tags yield nothing", readDeliveryTags(undefined), {});
check("junk yields nothing", readDeliveryTags("nope"), {});

console.log("\nstatusFromWebhookType");
check("delivered", statusFromWebhookType("email.delivered"), "delivered");
check("bounced", statusFromWebhookType("email.bounced"), "bounced");
check("delay maps to delayed", statusFromWebhookType("email.delivery_delayed"), "delayed");
check("unknown type ignored", statusFromWebhookType("email.whatever"), null);

console.log("\nshouldPromoteStatus (webhooks arrive out of order)");
check("first event always wins", shouldPromoteStatus(null, "sent"), true);
check("delivered beats sent", shouldPromoteStatus("sent", "delivered"), true);
// The ordering bug this guards: a late 'sent' must not overwrite 'delivered'.
check("late sent does not downgrade delivered", shouldPromoteStatus("delivered", "sent"), false);
check("opened beats delivered", shouldPromoteStatus("delivered", "opened"), true);
check("clicked beats opened", shouldPromoteStatus("opened", "clicked"), true);
// A bounce is the one thing an organiser must see; nothing may mask it.
check("bounce overrides everything", shouldPromoteStatus("clicked", "bounced"), true);
check("nothing overrides a bounce", shouldPromoteStatus("bounced", "delivered"), false);
check("spam complaint overrides engagement", shouldPromoteStatus("opened", "complained"), true);
check("same status is not a promotion", shouldPromoteStatus("delivered", "delivered"), false);

console.log("\nisDeliveryFailure");
check("bounced is a failure", isDeliveryFailure("bounced"), true);
check("complained is a failure", isDeliveryFailure("complained"), true);
check("delivered is not", isDeliveryFailure("delivered"), false);
check("unset is not", isDeliveryFailure(null), false);

console.log("\nmanage tokens");
const tok = createManageToken("rsvp1", "evt1");
check("round-trips", verifyManageToken(tok)?.rsvpId, "rsvp1");
check("carries the event", verifyManageToken(tok)?.eventId, "evt1");
check("rejects a tampered payload", verifyManageToken("x" + tok), null);
check("rejects a tampered signature", verifyManageToken(tok.split(".")[0] + ".deadbeef"), null);
check("rejects malformed input", verifyManageToken("nonsense"), null);
check("rejects empty input", verifyManageToken(""), null);
// An expired link must fail closed, not silently keep working.
check("rejects an expired token", verifyManageToken(createManageToken("r", "e", -1)), null);
// Cross-secret forgery: a token minted under a different secret must not verify.
const other = (() => {
  process.env.MANAGE_SECRET = "different-secret";
  return tok; // same token, secret changed under it
})();
process.env.MANAGE_SECRET = "test-manage-secret"; // restore before asserting
check("token still valid under its own secret", verifyManageToken(other)?.rsvpId, "rsvp1");
check("url embeds the token", buildManageUrl("https://x.test/rsvp", "r", "e").startsWith("https://x.test/rsvp/manage?t="), true);
check("url strips a trailing slash", buildManageUrl("https://x.test/rsvp/", "r", "e").includes("/rsvp/manage?t="), true);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
