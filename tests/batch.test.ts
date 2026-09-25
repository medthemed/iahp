import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  classifyStateData,
  formatBatchReport,
  listStateFiles,
  validateBatch,
} from "../src/batch.js";
import { parseConfig } from "../src/config.js";
import { createEnvelope } from "../src/envelope.js";
import { buildExampleState } from "../src/example.js";
import { clone } from "./helpers.js";

let dir: string;

function writeState(name: string, state: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(state, null, 2), "utf8");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "iahp-batch-"));
  const good = buildExampleState({ goal: "Ship batch" });
  writeState("a-good.json", good);

  const bad = clone(good) as Record<string, unknown>;
  bad.goal = "";
  writeState("b-schema.json", bad);

  const tampered = clone(good) as Record<string, unknown>;
  tampered.goal = "Tampered after seal";
  writeState("c-integrity.json", tampered);

  writeState("d-not-json.txt", "nope");
  writeFileSync(join(dir, "d-not-json.json"), "{ not json", "utf8");
  writeFileSync(join(dir, "iahp.config.json"), "{}", "utf8");
  mkdirSync(join(dir, "nested"));
  writeFileSync(join(dir, "nested", "skip.json"), "{}", "utf8");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("listStateFiles", () => {
  it("lists .json files sorted, skipping config and non-files", () => {
    const files = listStateFiles(dir);
    expect(files).toEqual([
      "a-good.json",
      "b-schema.json",
      "c-integrity.json",
      "d-not-json.json",
    ]);
  });

  it("throws for a missing directory", () => {
    expect(() => listStateFiles(join(dir, "missing"))).toThrow(/cannot read directory/);
  });
});

describe("classifyStateData", () => {
  it("marks a sealed state as ok", () => {
    const state = buildExampleState({ goal: "ok" });
    const r = classifyStateData("x.json", state);
    expect(r.status).toBe("ok");
    expect(r.issues).toEqual([]);
  });

  it("marks a schema-invalid state", () => {
    const r = classifyStateData("x.json", { goal: "missing everything" });
    expect(r.status).toBe("schema_invalid");
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("marks a config-required field miss", () => {
    const state = clone(buildExampleState({ goal: "g" })) as Record<string, unknown>;
    state.constraints = [];
    const cfg = parseConfig({ required_fields: ["constraints"] });
    const r = classifyStateData("x.json", state, cfg);
    expect(r.status).toBe("config_invalid");
    expect(r.issues[0]?.path).toBe("constraints");
  });

  it("marks a checksum mismatch as integrity_failed", () => {
    const state = clone(buildExampleState({ goal: "g" })) as Record<string, unknown>;
    state.goal = "changed after seal";
    const r = classifyStateData("x.json", state);
    expect(r.status).toBe("integrity_failed");
    expect(r.message).toMatch(/checksum mismatch/);
  });

  it("classifies envelopes by unwrapping is out of scope (schema_invalid)", () => {
    const env = createEnvelope(buildExampleState({ goal: "env" }));
    const r = classifyStateData("x.json", env);
    // envelopes are not bare State Objects
    expect(r.status).toBe("schema_invalid");
  });
});

describe("validateBatch", () => {
  it("summarizes a mixed directory", () => {
    const result = validateBatch(dir);
    expect(result.summary.total).toBe(4);
    expect(result.summary.ok).toBe(1);
    expect(result.summary.schema_invalid).toBe(1);
    expect(result.summary.unreadable).toBe(1);
    expect(result.summary.integrity_failed).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("returns ok when every file passes", () => {
    const goodDir = mkdtempSync(join(tmpdir(), "iahp-batch-ok-"));
    try {
      writeFileSync(
        join(goodDir, "only.json"),
        JSON.stringify(buildExampleState({ goal: "only" })),
        "utf8",
      );
      const result = validateBatch(goodDir);
      expect(result.ok).toBe(true);
      expect(result.summary.ok).toBe(1);
    } finally {
      rmSync(goodDir, { recursive: true, force: true });
    }
  });
});

describe("formatBatchReport", () => {
  it("includes status labels and a summary line", () => {
    const result = validateBatch(dir);
    const text = formatBatchReport(result);
    expect(text).toContain("OK");
    expect(text).toContain("SCHEMA INVALID");
    expect(text).toContain("INTEGRITY FAILED");
    expect(text).toContain("UNREADABLE");
    expect(text).toContain("summary:");
    expect(text).toContain("a-good.json");
  });
});
