import type { ValidationIssue } from "./validate.js";

/**
 * Typed errors for the public iahp API.
 *
 * Call sites can `instanceof` these classes instead of string-matching
 * messages, which keeps operator tooling stable across minor releases.
 */

export class ValidationError extends Error {
  /** Path-qualified schema problems. */
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
    // Restore prototype chain for older TS / downlevel targets.
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ChecksumError extends Error {
  /** Recomputed SHA-256 hex (when known). */
  readonly expected?: string;
  /** Stored checksum on the state (when known). */
  readonly actual?: string;

  constructor(
    message: string,
    opts: { expected?: string; actual?: string } = {},
  ) {
    super(message);
    this.name = "ChecksumError";
    this.expected = opts.expected;
    this.actual = opts.actual;
    Object.setPrototypeOf(this, ChecksumError.prototype);
  }
}

/** Narrow any thrown value to ValidationError. */
export function isValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}

/** Narrow any thrown value to ChecksumError. */
export function isChecksumError(err: unknown): err is ChecksumError {
  return err instanceof ChecksumError;
}
