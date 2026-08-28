import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function withExtension(abs) {
  if (path.extname(abs) && existsSync(abs)) return abs;
  for (const ext of EXTS) if (existsSync(abs + ext)) return abs + ext;
  for (const ext of EXTS) if (existsSync(path.join(abs, "index" + ext))) return path.join(abs, "index" + ext);
  return null;
}

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) {
    target = withExtension(path.join(ROOT, specifier.slice(2)));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    target = withExtension(abs);
  }
  if (target) return next(pathToFileURL(target).href, context);
  return next(specifier, context);
}
