import { describe, expect, it } from "vitest";
import {
  checksumsEqual,
  computeChecksum,
  sealChecksum,
  verifyChecksum,
} from "../src/checksum.js";
import { buildExampleState } from "../src/example.js";
import { clone } from "./helpers.js";

describe("computeChecksum", () => {
  it("is stable across key insertion order", () => {
    const a = buildExampleState();
    const shuffled = clone(a) as Record<string, unknown>;
    // Rebuild with reversed key order
    const reversed: Record<string, unknown> = {};
    for (const key of Object.keys(shuffled).reverse()) {
      reversed[key] = shuffled[key];
    }
    // Remove and re-add checksum last (already last-ish); force different order
    const { checksum, ...rest } = reversed as { checksum: string };
    const reordered = { ...rest, checksum };
    expect(reordered.checksum).toBe(a.checksum);
    expect(computeChecksum(reordered as never)).toBe(computeChecksum(a));
  });

  it("ignores the checksum field itself", () => {
    const a = buildExampleState();
    expect(computeChecksum(a)).toBe(
      computeChecksum({ ...a, checksum: "ff".repeat(32) } as never),
    );
  });

  it("changes when content changes", () => {
    const a = buildExampleState();
    const b = buildExampleState({ goal: a.goal + "!" });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it("produces 64 hex chars", () => {
    expect(buildExampleState().checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyChecksum", () => {
  it("returns true for a sealed example", () => {
    expect(verifyChecksum(buildExampleState())).toBe(true);
  });

  it("returns false when goal is mutated", () => {
    const s = buildExampleState();
    const mutated = { ...s, goal: "something else" };
    expect(verifyChecksum(mutated)).toBe(false);
  });

  it("returns false when a nested fact confidence changes", () => {
    const s = buildExampleState();
    const facts = clone(s.verified_facts);
    facts[0]!.confidence = 0.1;
    expect(verifyChecksum({ ...s, verified_facts: facts })).toBe(false);
  });
});

describe("checksumsEqual", () => {
  it("matches identical strings", () => {
    const a = "ab".repeat(32);
    expect(checksumsEqual(a, a)).toBe(true);
  });

  it("rejects different lengths", () => {
    expect(checksumsEqual("abc", "abcd")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(checksumsEqual("", "")).toBe(false);
  });
});

describe("sealChecksum", () => {
  it("attaches a valid checksum", () => {
    const sealed = sealChecksum({
      ...buildExampleState(),
      checksum: "stale",
    });
    expect(sealed.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyChecksum(sealed)).toBe(true);
  });
});
