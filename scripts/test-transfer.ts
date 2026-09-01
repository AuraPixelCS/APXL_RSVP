/**
 * Delegate transfers — lib/integration.ts partitionTransfer + the transfer flag.
 *   node --experimental-strip-types scripts/test-transfer.ts
 */
import { normalizeRegisterPayload, partitionTransfer } from "../lib/integration.ts";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

console.log("\npartitionTransfer");
const old = { id: "a", email: "old@x.co", status: "allocated" };
const gone = { id: "b", email: "prev@x.co", status: "cancelled" };
const mine = { id: "c", email: "new@x.co", status: "allocated" };

let r = partitionTransfer([old], "new@x.co");
check("active other-email record is voided", r.existing === null && r.toCancel.length === 1 && r.toCancel[0].id === "a");
r = partitionTransfer([old, gone], "new@x.co");
check("already-cancelled records are left alone", r.toCancel.length === 1 && r.toCancel[0].id === "a");
r = partitionTransfer([old, mine], "new@x.co");
check("new email's own record found, old still voided", r.existing?.id === "c" && r.toCancel.length === 1);
r = partitionTransfer([mine], "NEW@X.CO");
check("email match is case-insensitive", r.existing?.id === "c" && r.toCancel.length === 0);
r = partitionTransfer([], "new@x.co");
check("no matches → nothing", r.existing === null && r.toCancel.length === 0);
const mineCancelled = { id: "d", email: "new@x.co", status: "cancelled" };
r = partitionTransfer([mineCancelled], "new@x.co");
check("cancelled record OWNED by the new email is surfaced for revival, not voided", r.existing?.id === "d" && r.toCancel.length === 0);

console.log("\nnormalizeRegisterPayload — transfer flag");
const base = { submission_id: "BD-9", name: "B", email: "b@x.co" };
const t1 = normalizeRegisterPayload({ ...base, transfer: true });
check("transfer: true accepted", t1.ok && t1.value.transfer === true);
const t2 = normalizeRegisterPayload({ ...base, transfer: "yes" });
check("transfer: 'yes' accepted", t2.ok && t2.value.transfer === true);
const t3 = normalizeRegisterPayload(base);
check("absent → false", t3.ok && t3.value.transfer === false);
const t4 = normalizeRegisterPayload({ ...base, transfer: false });
check("explicit false → false", t4.ok && t4.value.transfer === false);
const t5 = normalizeRegisterPayload({ ...base, is_transfer: true });
check("is_transfer alias", t5.ok && t5.value.transfer === true);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
