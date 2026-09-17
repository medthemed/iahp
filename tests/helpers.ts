import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadExampleFile(name: string): unknown {
  const path = join(__dirname, "..", "examples", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
