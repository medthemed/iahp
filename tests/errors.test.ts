import { describe, expect, it } from "vitest";
import {
  ChecksumError,
  ValidationError,
  isChecksumError,
  isValidationError,
} from "../src/errors.js";
import type { ValidationIssue } from "../src/validate.js";

describe("ValidationError", () => {
  it("carries path-qualified issues", () => {
    const issues: ValidationIssue[] = [
      { path: "goal", message: "expected a non-empty string" },
    ];
    const err = new ValidationError("state failed validation", issues);
    expect(err.name).toBe("ValidationError");
    expect(err.message).toBe("state failed validation");
    expect(err.issues).toEqual(issues);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it("defaults issues to empty", () => {
    const err = new ValidationError("boom");
    expect(err.issues).toEqual([]);
  });

  it("is narrowable via isValidationError", () => {
    const err: unknown = new ValidationError("x");
    expect(isValidationError(err)).toBe(true);
    expect(isValidationError(new Error("x"))).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });
});

describe("ChecksumError", () => {
  it("carries expected and actual digests", () => {
    const err = new ChecksumError("checksum mismatch", {
      expected: "aa".repeat(32),
      actual: "bb".repeat(32),
    });
    expect(err.name).toBe("ChecksumError");
    expect(err.expected).toBe("aa".repeat(32));
    expect(err.actual).toBe("bb".repeat(32));
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChecksumError);
  });

  it("omits digests when not provided", () => {
    const err = new ChecksumError("missing checksum");
    expect(err.expected).toBeUndefined();
    expect(err.actual).toBeUndefined();
  });

  it("is narrowable via isChecksumError", () => {
    const err: unknown = new ChecksumError("x");
    expect(isChecksumError(err)).toBe(true);
    expect(isChecksumError(new Error("x"))).toBe(false);
  });
});
