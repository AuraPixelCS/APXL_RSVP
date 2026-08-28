// Resolver for `npm test`: lets node's --experimental-strip-types runner load
// lib modules that import each other the way Next does — via the "@/" alias
// and without a file extension. Nothing here touches production code.
//
//   node --experimental-strip-types --import ./scripts/test-register.mjs scripts/test-x.ts
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./test-resolver.mjs", pathToFileURL(new URL(".", import.meta.url).pathname + "/"));
