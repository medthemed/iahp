import { describe, expect, it } from "vitest";
import { buildExampleState } from "../src/example.js";
import { validateEnvelope, validateState } from "../src/validate.js";
import { createEnvelope } from "../src/envelope.js";
import { clone } from "./helpers.js";

describe("validateState", () => {
  it("accepts the example state", () => {
    const result = validateState(buildExampleState());
    expect(result.ok).toBe(true);
    expect(result.state?.id).toBe("st_example_001");
  });

  it("rejects non-objects", () => {
    expect(validateState(null).ok).toBe(false);
    expect(validateState("nope").ok).toBe(false);
    expect(validateState([]).ok).toBe(false);
  });

  it("rejects unsupported schema versions", () => {
    const s = clone(buildExampleState()) as Record<string, unknown>;
    s.schema_version = "0.9.0";
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "schema_version")).toBe(true);
    expect(result.issues[0]?.message).toMatch(/unsupported schema_version/);
  });

  it("rejects missing goal", () => {
    const s = clone(buildExampleState()) as Record<string, unknown>;
    delete s.goal;
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "goal")).toBe(true);
  });

  it("rejects out-of-range confidence", () => {
    const s = clone(buildExampleState()) as {
      verified_facts: { confidence: number }[];
    };
    s.verified_facts[0]!.confidence = 1.5;
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.path === "verified_facts[0].confidence"),
    ).toBe(true);
  });

  it("rejects invalid checksum format", () => {
    const s = clone(buildExampleState()) as Record<string, unknown>;
    s.checksum = "not-hex";
    const result = validateState(s);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "checksum")).toBe(true);
  });

  it("allows null handoff fields", () => {
    const s = buildExampleState({ handoff_from: null, handoff_to: null });
    expect(validateState(s).ok).toBe(true);
  });

  it("rejects empty handoff_from string", () => {
    const s = clone(buildExampleState()) as Record<string, unknown>;
    s.handoff_from = "  ";
    expect(validateState(s).ok).toBe(false);
  });
});

describe("validateEnvelope", () => {
  it("accepts a created envelope", () => {
    const env = createEnvelope(buildExampleState());
    const result = validateEnvelope(env);
    expect(result.ok).toBe(true);
  });

  it("rejects wrong envelope_version", () => {
    const env = createEnvelope(buildExampleState()) as Record<string, unknown>;
    env.envelope_version = "2";
    const result = validateEnvelope(env);
    expect(result.ok).toBe(false);
  });

  it("surfaces nested state issues with state prefix", () => {
    const env = createEnvelope(buildExampleState()) as {
      state: Record<string, unknown>;
    };
    delete env.state.goal;
    const result = validateEnvelope(env);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path.includes("goal"))).toBe(true);
  });
});
