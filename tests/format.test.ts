import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OUTPUT_SCHEMA_VERSION,
  parseOutputFormat,
  toJsonLine,
} from "../src/format.js";
import { buildExampleState } from "../src/example.js";
import { clone } from "./helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");

let dir: string;
let goodFile: string;
let badFile: string;
let tamperedFile: string;

function runCli(args: string[], cwd = root): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", status: e.status ?? 1 };
  }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "iahp-format-"));
  const good = buildExampleState({ goal: "format contract" });
  goodFile = join(dir, "good.json");
  writeFileSync(goodFile, JSON.stringify(good, null, 2), "utf8");

  const bad = clone(good) as Record<string, unknown>;
  bad.goal = "";
  badFile = join(dir, "bad.json");
  writeFileSync(badFile, JSON.stringify(bad, null, 2), "utf8");

  const tampered = clone(good) as Record<string, unknown>;
  tampered.goal = "changed after seal";
  tamperedFile = join(dir, "tampered.json");
  writeFileSync(tamperedFile, JSON.stringify(tampered, null, 2), "utf8");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("parseOutputFormat", () => {
  it("accepts json and text", () => {
    expect(parseOutputFormat("json")).toBe("json");
    expect(parseOutputFormat("JSON")).toBe("json");
    expect(parseOutputFormat("text")).toBe("text");
  });

  it("returns undefined for missing/empty", () => {
    expect(parseOutputFormat(undefined)).toBeUndefined();
    expect(parseOutputFormat("")).toBeUndefined();
  });

  it("throws on unknown values", () => {
    expect(() => parseOutputFormat("yaml")).toThrow(/unknown --format/);
  });
});

describe("validate --format json", () => {
  it("emits a stable ok envelope", () => {
    const { stdout, status } = runCli(["validate", goodFile, "--format", "json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as {
      schema_version: string;
      ok: boolean;
      command: string;
      status: string;
      issues: unknown[];
    };
    expect(parsed.schema_version).toBe(OUTPUT_SCHEMA_VERSION);
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("validate");
    expect(parsed.status).toBe("ok");
    expect(parsed.issues).toEqual([]);
  });

  it("emits schema_invalid with issues and exit 1", () => {
    const { stdout, status } = runCli(["validate", badFile, "--format", "json"]);
    expect(status).toBe(1);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      status: string;
      issues: { path: string }[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe("schema_invalid");
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("emits integrity_failed with exit 2", () => {
    const { stdout, status } = runCli(["validate", tamperedFile, "--format", "json"]);
    expect(status).toBe(2);
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      status: string;
      message?: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.status).toBe("integrity_failed");
    expect(parsed.message).toMatch(/checksum mismatch/);
  });

  it("--json is a shorthand for --format json", () => {
    const a = runCli(["validate", goodFile, "--format", "json"]);
    const b = runCli(["validate", goodFile, "--json"]);
    expect(a.stdout).toBe(b.stdout);
  });
});

describe("checksum --format json", () => {
  it("emits checksum with schema_ok", () => {
    const { stdout, status } = runCli(["checksum", goodFile, "--format", "json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as {
      schema_version: string;
      command: string;
      checksum: string;
      schema_ok: boolean;
      issues: unknown[];
    };
    expect(parsed.schema_version).toBe(OUTPUT_SCHEMA_VERSION);
    expect(parsed.command).toBe("checksum");
    expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.schema_ok).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it("still emits a checksum when schema fails, with issues", () => {
    const { stdout, status } = runCli(["checksum", badFile, "--format", "json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as {
      checksum: string;
      schema_ok: boolean;
      issues: unknown[];
    };
    expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.schema_ok).toBe(false);
    expect(parsed.issues.length).toBeGreaterThan(0);
  });
});

describe("diff --format json", () => {
  it("wraps the StateDiff in a stable envelope", () => {
    const { stdout, status } = runCli([
      "diff",
      goodFile,
      tamperedFile,
      "--format",
      "json",
    ]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as {
      schema_version: string;
      command: string;
      equal: boolean;
      diff: { equal: boolean; summary: string };
      file_a: string;
      file_b: string;
    };
    expect(parsed.schema_version).toBe(OUTPUT_SCHEMA_VERSION);
    expect(parsed.command).toBe("diff");
    expect(parsed.equal).toBe(false);
    expect(parsed.diff.equal).toBe(false);
    expect(parsed.file_a).toBe(goodFile);
    expect(parsed.file_b).toBe(tamperedFile);
  });

  it("reports equal:true for identical states", () => {
    const { stdout, status } = runCli([
      "diff",
      goodFile,
      goodFile,
      "--format",
      "json",
    ]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout) as { equal: boolean };
    expect(parsed.equal).toBe(true);
  });
});

describe("validate-batch --format json", () => {
  it("emits files array and summary", () => {
    const batchDir = mkdtempSync(join(tmpdir(), "iahp-fmt-batch-"));
    try {
      writeFileSync(
        join(batchDir, "a.json"),
        JSON.stringify(buildExampleState({ goal: "a" })),
        "utf8",
      );
      writeFileSync(
        join(batchDir, "b.json"),
        JSON.stringify({ nope: true }),
        "utf8",
      );
      const { stdout, status } = runCli([
        "validate-batch",
        batchDir,
        "--format",
        "json",
      ]);
      expect(status).toBe(1);
      const parsed = JSON.parse(stdout) as {
        schema_version: string;
        command: string;
        ok: boolean;
        files: { file: string; status: string }[];
        summary: { total: number; ok: number; schema_invalid: number };
      };
      expect(parsed.schema_version).toBe(OUTPUT_SCHEMA_VERSION);
      expect(parsed.command).toBe("validate-batch");
      expect(parsed.ok).toBe(false);
      expect(parsed.summary.total).toBe(2);
      expect(parsed.summary.ok).toBe(1);
      expect(parsed.summary.schema_invalid).toBe(1);
      expect(parsed.files.map((f) => f.file).sort()).toEqual(["a.json", "b.json"]);
    } finally {
      rmSync(batchDir, { recursive: true, force: true });
    }
  });
});

describe("toJsonLine", () => {
  it("serializes with pretty-printing", () => {
    const line = toJsonLine({
      schema_version: OUTPUT_SCHEMA_VERSION,
      ok: true,
      command: "validate",
      file: "x.json",
      status: "ok",
      issues: [],
    });
    expect(line).toContain('"schema_version": "1"');
    expect(JSON.parse(line).ok).toBe(true);
  });
});

describe("rejects unknown --format", () => {
  it("exits 1 with a clear error", () => {
    const { stderr, status } = runCli(["validate", goodFile, "--format", "yaml"]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/unknown --format/);
  });
});
