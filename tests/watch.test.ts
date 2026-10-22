import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { buildExampleState } from "../src/example.js";
import {
  diffSnapshots,
  evaluateWatchLine,
  evaluateWatchLines,
  formatWatchLineResult,
  formatWatchScan,
  hasWatchChanges,
  parseWatchLine,
  runWatch,
  snapshotDirectory,
  type WatchSnapshot,
} from "../src/watch.js";
import { clone } from "./helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");

let dir: string;
let goodFile: string;

function writeState(name: string, state: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(state, null, 2), "utf8");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "iahp-watch-"));
  writeState("a-good.json", buildExampleState({ goal: "Watch me" }));
  writeFileSync(join(dir, "iahp.config.json"), "{}", "utf8");
  writeFileSync(join(dir, "notes.txt"), "not a state", "utf8");
  goodFile = join(dir, "a-good.json");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("snapshotDirectory", () => {
  it("fingerprints every state file with mtime + size", () => {
    const snap = snapshotDirectory(dir);
    expect([...snap.keys()]).toEqual(["a-good.json"]);
    const fp = snap.get("a-good.json")!;
    expect(fp.size).toBeGreaterThan(0);
    expect(fp.mtimeMs).toBeGreaterThan(0);
  });

  it("throws for a missing directory", () => {
    expect(() => snapshotDirectory(join(dir, "missing"))).toThrow(
      /cannot read directory/,
    );
  });
});

describe("diffSnapshots", () => {
  const fp = (mtimeMs: number, size: number) => ({ mtimeMs, size });

  it("reports added, removed, and changed files", () => {
    const before: WatchSnapshot = new Map([
      ["a.json", fp(100, 10)],
      ["b.json", fp(100, 10)],
      ["c.json", fp(100, 10)],
    ]);
    const after: WatchSnapshot = new Map([
      ["a.json", fp(100, 10)],
      ["b.json", fp(200, 10)], // mtime changed
      ["d.json", fp(100, 5)], // added; c.json removed
    ]);
    const changes = diffSnapshots(before, after);
    expect(changes).toEqual({
      added: ["d.json"],
      removed: ["c.json"],
      changed: ["b.json"],
    });
    expect(hasWatchChanges(changes)).toBe(true);
  });

  it("detects a size-only change and no change at all", () => {
    const before: WatchSnapshot = new Map([["a.json", fp(100, 10)]]);
    const resized: WatchSnapshot = new Map([["a.json", fp(100, 11)]]);
    expect(diffSnapshots(before, resized).changed).toEqual(["a.json"]);
    const same: WatchSnapshot = new Map([["a.json", fp(100, 10)]]);
    const none = diffSnapshots(before, same);
    expect(none).toEqual({ added: [], removed: [], changed: [] });
    expect(hasWatchChanges(none)).toBe(false);
  });
});

describe("runWatch", () => {
  it("emits an initial scan event and stops at maxScans", async () => {
    const events: string[] = [];
    const summary = await runWatch(dir, {
      intervalMs: 5,
      maxScans: 3,
      onEvent: (e) => events.push(formatWatchScan(e)),
    });
    expect(summary.scans).toBe(3);
    expect(summary.events).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("initial scan");
    expect(events[0]).toContain("1 ok");
  });

  it("re-validates and reports when a file changes", async () => {
    const watchDir = mkdtempSync(join(tmpdir(), "iahp-watch-change-"));
    try {
      writeFileSync(
        join(watchDir, "s.json"),
        JSON.stringify(buildExampleState({ goal: "before" })),
        "utf8",
      );
      const seen: string[] = [];
      const summary = await runWatch(watchDir, {
        intervalMs: 5,
        maxScans: 10,
        onEvent: (e) => {
          seen.push(formatWatchScan(e));
          if (e.initial) {
            // Tamper after the initial scan: goal text changes the
            // content (and size), which the next poll must pick up.
            const tampered = buildExampleState({
              goal: "after — tampered content with a longer goal",
            });
            writeFileSync(
              join(watchDir, "s.json"),
              JSON.stringify(tampered),
              "utf8",
            );
          }
        },
      });
      expect(summary.events).toBeGreaterThanOrEqual(2);
      expect(seen[1]).toContain("s.json (modified)");
    } finally {
      rmSync(watchDir, { recursive: true, force: true });
    }
  });

  it("stops immediately on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const summary = await runWatch(dir, { signal: controller.signal });
    expect(summary).toEqual({ scans: 0, events: 0 });
  });
});

describe("parseWatchLine", () => {
  it("classifies blank lines as empty", () => {
    expect(parseWatchLine("")).toEqual({ kind: "empty" });
    expect(parseWatchLine("   ")).toEqual({ kind: "empty" });
  });

  it("treats plain text as a path", () => {
    expect(parseWatchLine("states/a.json")).toEqual({
      kind: "path",
      path: "states/a.json",
    });
  });

  it("treats a JSON string literal as a path", () => {
    expect(parseWatchLine('"states/a.json"')).toEqual({
      kind: "path",
      path: "states/a.json",
    });
  });

  it("parses object lines as state documents", () => {
    const doc = { goal: "x" };
    expect(parseWatchLine(JSON.stringify(doc))).toEqual({
      kind: "document",
      value: doc,
    });
  });

  it("reports invalid JSON documents", () => {
    const parsed = parseWatchLine("{ not json");
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.message).toMatch(/not valid JSON/);
    }
  });
});

describe("evaluateWatchLines (stdin NDJSON)", () => {
  it("validates path lines, skipping blanks", () => {
    const results = evaluateWatchLines(["", goodFile, "  "]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      line: 2,
      source: "path",
      file: goodFile,
      status: "ok",
    });
  });

  it("validates inline state documents", () => {
    const doc = JSON.stringify(buildExampleState({ goal: "inline" }));
    const results = evaluateWatchLines([doc]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      line: 1,
      source: "document",
      file: "<stdin>",
      status: "ok",
    });
  });

  it("classifies schema-invalid documents and tampered documents", () => {
    const bad = JSON.stringify({ goal: "missing everything" });
    const tamperedState = clone(buildExampleState({ goal: "g" })) as Record<
      string,
      unknown
    >;
    tamperedState.goal = "changed after seal - longer";
    const results = evaluateWatchLines([bad, JSON.stringify(tamperedState)]);
    expect(results.map((r) => r.status)).toEqual([
      "schema_invalid",
      "integrity_failed",
    ]);
  });

  it("classifies missing paths and invalid JSON lines as unreadable", () => {
    const results = evaluateWatchLines([
      join(dir, "nope.json"),
      "{ not json",
    ]);
    expect(results.map((r) => r.status)).toEqual(["unreadable", "unreadable"]);
    expect(results[0]?.line).toBe(1);
    expect(results[1]?.line).toBe(2);
  });

  it("applies config required-fields to documents", () => {
    const state = clone(buildExampleState({ goal: "g" })) as Record<
      string,
      unknown
    >;
    state.constraints = [];
    const cfg = parseConfig({ required_fields: ["constraints"] });
    const r = evaluateWatchLine(JSON.stringify(state), 1, cfg);
    expect(r?.status).toBe("config_invalid");
  });

  it("formats compact status lines", () => {
    const [r] = evaluateWatchLines([goodFile]);
    expect(formatWatchLineResult(r!)).toContain("OK");
    expect(formatWatchLineResult(r!)).toContain(goodFile);
  });
});

describe("iahp watch - (CLI stdin mode)", () => {
  function runStdin(
    args: string[],
    input: string,
  ): { stdout: string; stderr: string; status: number } {
    const res = spawnSync(process.execPath, [cli, ...args], {
      input,
      encoding: "utf8",
      cwd: root,
    });
    return {
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      status: res.status ?? 1,
    };
  }

  it("emits one result per line and exits 0 when all ok", () => {
    const doc = JSON.stringify(buildExampleState({ goal: "inline ok" }));
    const { stdout, status } = runStdin(
      ["watch", "-"],
      `${goodFile}\n\n${doc}\n`,
    );
    expect(status).toBe(0);
    expect(stdout).toContain("OK");
    expect(stdout).toContain("<stdin> line 3");
  });

  it("exits 1 when any line is not ok", () => {
    const { status } = runStdin(["watch", "-"], `${JSON.stringify({ nope: 1 })}\n`);
    expect(status).toBe(1);
  });

  it("supports --format json envelopes", () => {
    const { stdout, status } = runStdin(
      ["watch", "--stdin", "--format", "json"],
      `${goodFile}\n`,
    );
    expect(status).toBe(0);
    expect(stdout).toContain('"command": "watch"');
    expect(stdout).toContain('"event": "line"');
    expect(stdout).toContain('"status": "ok"');
  });

  it("exits 1 with a clear error on empty stdin", () => {
    const { stderr, status } = runStdin(["watch", "-"], "");
    expect(status).toBe(1);
    expect(stderr).toMatch(/no input received on stdin/);
  });
});

describe("iahp watch <dir> (CLI)", () => {
  it("prints the initial scan and exits cleanly on SIGINT", async () => {
    const child = spawn(process.execPath, [cli, "watch", dir, "--interval", "50"], {
      cwd: root,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const exited = new Promise<number | null>((resolveExit) =>
      child.on("exit", (code) => resolveExit(code)),
    );
    // Wait for the initial scan line, then interrupt like Ctrl-C.
    const deadline = Date.now() + 15000;
    while (!stdout.includes("initial scan")) {
      if (Date.now() > deadline) throw new Error(`no initial scan; got: ${stdout} / ${stderr}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    child.kill("SIGINT");
    const code = await exited;
    expect(code).toBe(0);
    expect(stdout).toContain("1 ok");
    expect(stderr).toContain("watch stopped");
  });
});
