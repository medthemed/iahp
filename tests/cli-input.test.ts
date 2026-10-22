import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildExampleState } from "../src/example.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");

let dir: string;
let nullFile: string;
let arrayFile: string;
let scalarFile: string;
let emptyObjectFile: string;
let goodFile: string;

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "iahp-cli-input-"));
  const write = (name: string, text: string): string => {
    const p = join(dir, name);
    writeFileSync(p, text, "utf8");
    return p;
  };
  nullFile = write("null.json", "null");
  arrayFile = write("array.json", "[1, 2, 3]");
  scalarFile = write("scalar.json", '"hello"');
  emptyObjectFile = write("empty.json", "{}");
  goodFile = write("good.json", JSON.stringify(buildExampleState({ goal: "cli input" })));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Regression: checksum/seal/summarize used to feed a top-level non-object
// straight into the checksum/envelope code. `null` crashed all three with
// an uncaught TypeError; arrays/scalars were silently "sealed" or
// checksummed as if their index keys were a State Object (exit 0).
describe("CLI rejects top-level non-object JSON cleanly", () => {
  it.each(["checksum", "seal", "summarize"])(
    "%s exits 1 with a clear error on null",
    (cmd) => {
      const { stdout, stderr, status } = runCli([cmd, nullFile]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/does not contain a JSON object/);
      expect(stderr).not.toMatch(/TypeError/);
      expect(stdout).toBe("");
    },
  );

  it.each(["checksum", "seal", "summarize"])(
    "%s exits 1 with a clear error on an array",
    (cmd) => {
      const { stderr, status } = runCli([cmd, arrayFile]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/does not contain a JSON object/);
      expect(stderr).not.toMatch(/TypeError/);
    },
  );

  it.each(["checksum", "seal"])("%s exits 1 on a scalar", (cmd) => {
    const { stderr, status } = runCli([cmd, scalarFile]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/does not contain a JSON object/);
    expect(stderr).not.toMatch(/TypeError/);
  });

  it("summarize exits 1 with validation issues on a non-state object", () => {
    const { stderr, status } = runCli(["summarize", emptyObjectFile]);
    expect(status).toBe(1);
    expect(stderr).toContain("INVALID");
    expect(stderr).not.toMatch(/TypeError/);
  });

  it("still checksums, seals, and summarizes a real state", () => {
    expect(runCli(["checksum", goodFile]).status).toBe(0);
    const sealed = runCli(["seal", goodFile]);
    expect(sealed.status).toBe(0);
    expect(JSON.parse(sealed.stdout).checksum).toMatch(/^[0-9a-f]{64}$/);
    const summary = runCli(["summarize", goodFile]);
    expect(summary.status).toBe(0);
    expect(summary.stdout).toContain("goal=");
  });
});
