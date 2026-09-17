import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical.js";
import { computeChecksum, sealChecksum } from "../src/checksum.js";
import {
  createEnvelope,
  summarizeEnvelope,
  verifyEnvelope,
  verifyState,
} from "../src/envelope.js";
import { buildExampleState } from "../src/example.js";
import { clone } from "./helpers.js";

describe("round-trip", () => {
  it("JSON serialize → parse → same checksum", () => {
    const original = buildExampleState();
    const parsed = JSON.parse(JSON.stringify(original));
    expect(computeChecksum(parsed)).toBe(original.checksum);
    expect(verifyState(parsed).ok).toBe(true);
  });

  it("canonical JSON is identical after key shuffle + re-seal", () => {
    const original = buildExampleState();
    const shuffled = clone(original) as Record<string, unknown>;
    // move goal to the end
    const goal = shuffled.goal;
    delete shuffled.goal;
    shuffled.goal = goal;
    const resealed = sealChecksum(shuffled as never);
    // checksum payload should match original payload
    expect(canonicalJson({ ...resealed, checksum: undefined })).toBe(
      canonicalJson({ ...original, checksum: undefined }),
    );
    expect(resealed.checksum).toBe(original.checksum);
  });
});

describe("verifyEnvelope", () => {
  it("accepts a freshly created envelope", () => {
    const env = createEnvelope(buildExampleState());
    const result = verifyEnvelope(env);
    expect(result.ok).toBe(true);
    expect(result.integrity_ok).toBe(true);
  });

  it("detects tampering with a constraint", () => {
    const env = createEnvelope(buildExampleState());
    const tampered = clone(env) as typeof env;
    tampered.state.constraints = ["no rules"];
    const result = verifyEnvelope(tampered);
    expect(result.ok).toBe(false);
    expect(result.integrity_ok).toBe(false);
    expect(result.expected_checksum).not.toBe(result.actual_checksum);
  });

  it("rejects structurally invalid envelopes", () => {
    const result = verifyEnvelope({ hello: "world" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/schema invalid/);
  });
});

describe("summarizeEnvelope", () => {
  it("includes hop, id, and counts", () => {
    const env = createEnvelope(buildExampleState());
    const line = summarizeEnvelope(env);
    expect(line).toContain("agent-researcher → agent-synthesis");
    expect(line).toContain("st_example_001");
    expect(line).toContain("facts=2");
    expect(line).toContain("artifacts=1");
  });
});

describe("verifyState", () => {
  it("returns ok message for sealed state", () => {
    expect(verifyState(buildExampleState()).message).toBe("ok");
  });
});
