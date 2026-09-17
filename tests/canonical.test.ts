import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalize } from "../src/canonical.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    const a = { b: 1, a: { d: 2, c: 3 } };
    const b = { a: { c: 3, d: 2 }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined properties", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/non-finite/);
  });

  it("is stable under key shuffle of nested structures", () => {
    const a = { z: [{ y: 1, x: 2 }], m: "hi" };
    const b = { m: "hi", z: [{ x: 2, y: 1 }] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe("canonicalize", () => {
  it("returns a sorted deep copy", () => {
    const input = { b: 2, a: { z: 1, y: 2 } };
    const out = canonicalize(input);
    expect(Object.keys(out)).toEqual(["a", "b"]);
    expect(Object.keys(out.a)).toEqual(["y", "z"]);
    expect(out).toEqual(input);
  });
});
