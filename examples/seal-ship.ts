import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sealChecksum } from "../src/checksum.js";

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "state.ship.json");
const raw = JSON.parse(readFileSync(path, "utf8"));
const sealed = sealChecksum(raw);
process.stdout.write(JSON.stringify(sealed, null, 2) + "\n");
