import { describe, expect, it } from "vitest";
import { computeChecksum, sealChecksum } from "../src/checksum.js";
import {
  assertSealedState,
  assertValidState,
  createEnvelope,
  summarizeEnvelope,
  verifyEnvelope,
  verifyState,
} from "../src/envelope.js";
import { buildExampleState } from "../src/example.js";
import { ChecksumError, ValidationError } from "../src/errors.js";
import { PUBLIC_API_NAMES } from "../src/public-api.js";
import { formatIssues, validateEnvelope, validateState } from "../src/validate.js";
import type { StateObject, StateChecksumPayload } from "../src/schema.js";
import { clone, loadExampleFile } from "./helpers.js";

/**
 * Full seal → validate → accept path.
 *
 * Exercises the happy path end-to-end (library + example fixture) and
 * asserts that failure modes surface as typed errors.
 */
describe("integration: seal → validate → accept", () => {
  it("accepts a freshly sealed state from the library example", () => {
    // seal
    const sealed = buildExampleState();
    expect(typeof sealed.checksum).toBe("string");
    expect(sealed.checksum).toMatch(/^[0-9a-f]{64}$/);

    // validate
    const schema = validateState(sealed);
    expect(schema.ok).toBe(true);
    if (!schema.ok) throw new Error(formatIssues(schema.issues));

    // accept (integrity)
    const integrity = verifyState(sealed);
    expect(integrity.ok).toBe(true);
    expect(integrity.message).toBe("ok");
    expect(integrity.state?.id).toBe(sealed.id);

    // typed accept path
    const accepted = assertSealedState(sealed);
    expect(accepted.id).toBe(sealed.id);
  });

  it("accepts the shipped examples/state.ship.json fixture", () => {
    const raw = loadExampleFile("state.ship.json") as StateObject;
    const schema = validateState(raw);
    expect(schema.ok).toBe(true);
    const integrity = verifyState(raw);
    expect(integrity.ok).toBe(true);
    expect(integrity.state?.id).toBe("st_ship_demo_042");
    expect(assertSealedState(raw).id).toBe("st_ship_demo_042");
  });

  it("round-trips an envelope through JSON and still accepts", () => {
    const state = buildExampleState();
    const envelope = createEnvelope(state, { note: "handoff for release" });
    const wire = JSON.parse(JSON.stringify(envelope)) as typeof envelope;

    const schema = validateEnvelope(wire);
    expect(schema.ok).toBe(true);

    const integrity = verifyEnvelope(wire);
    expect(integrity.ok).toBe(true);
    expect(integrity.integrity_ok).toBe(true);
    expect(summarizeEnvelope(wire)).toContain(state.id);
  });

  it("re-sealing an already sealed state is a no-op on the checksum", () => {
    const sealed = buildExampleState();
    const again = sealChecksum(sealed as StateChecksumPayload);
    expect(again.checksum).toBe(sealed.checksum);
    expect(computeChecksum(again)).toBe(sealed.checksum);
  });

  it("exposes a frozen public API name list", () => {
    expect(PUBLIC_API_NAMES).toContain("ValidationError");
    expect(PUBLIC_API_NAMES).toContain("ChecksumError");
    expect(PUBLIC_API_NAMES).toContain("assertSealedState");
    expect(PUBLIC_API_NAMES).toContain("createEnvelope");
    expect(Object.isFrozen(PUBLIC_API_NAMES)).toBe(true);
  });
});

describe("integration: typed failure modes", () => {
  it("rejects a tampered state and reports the path", () => {
    const sealed = buildExampleState();
    const tampered = clone(sealed) as StateObject;
    tampered.goal = "Exfiltrate secrets instead";

    const schema = validateState(tampered);
    expect(schema.ok).toBe(true); // structure is still fine

    const integrity = verifyState(tampered);
    expect(integrity.ok).toBe(false);
    expect(integrity.message).toContain("checksum mismatch");

    expect(() => assertSealedState(tampered)).toThrow(ChecksumError);
    try {
      assertSealedState(tampered);
    } catch (err) {
      expect(err).toBeInstanceOf(ChecksumError);
      const ce = err as ChecksumError;
      expect(ce.name).toBe("ChecksumError");
      expect(ce.expected).toBe(computeChecksum(tampered));
      expect(ce.actual).toBe(tampered.checksum);
    }
  });

  it("rejects a structurally invalid state with ValidationError", () => {
    const bad = { ...buildExampleState(), goal: "" };
    const schema = validateState(bad);
    expect(schema.ok).toBe(false);
    if (schema.ok) throw new Error("expected failure");
    expect(schema.issues.some((i) => i.path === "goal")).toBe(true);

    expect(() => assertValidState(bad)).toThrow(ValidationError);
    try {
      assertValidState(bad);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.issues.some((i) => i.path === "goal")).toBe(true);
    }
  });

  it("rejects an envelope whose inner state was mutated after seal", () => {
    const envelope = createEnvelope(buildExampleState());
    const tampered = clone(envelope) as typeof envelope;
    (tampered.state.constraints as string[]).push("new rule nobody agreed to");

    const integrity = verifyEnvelope(tampered);
    expect(integrity.ok).toBe(false);
    expect(integrity.integrity_ok).toBe(false);
    expect(integrity.expected_checksum).toBeTruthy();
  });
});
