import { sealChecksum, verifyChecksum } from "./checksum.js";
import { computeChecksum } from "./checksum.js";
import { ChecksumError, ValidationError } from "./errors.js";
import type { Envelope, StateObject, StateChecksumPayload } from "./schema.js";
import { formatIssues, validateEnvelope, validateState } from "./validate.js";

export interface CreateEnvelopeOptions {
  /** ISO timestamp; defaults to now. */
  created_at?: string;
  note?: string;
}

/**
 * Create a sealed envelope around a state payload.
 * Computes and attaches the checksum if missing or stale.
 */
export function createEnvelope(
  state: StateObject | StateChecksumPayload,
  options: CreateEnvelopeOptions = {},
): Envelope {
  const sealed = sealChecksum(state as StateChecksumPayload);
  return {
    envelope_version: "1",
    created_at: options.created_at ?? new Date().toISOString(),
    state: sealed,
    ...(options.note !== undefined ? { note: options.note } : {}),
  };
}

export interface EnvelopeIntegrityResult {
  ok: boolean;
  /** Schema problems (structure). */
  schema_issues: ReturnType<typeof validateEnvelope>["issues"];
  /** Integrity problems (checksum mismatch). */
  integrity_ok: boolean;
  expected_checksum?: string;
  actual_checksum?: string;
  message: string;
}

/**
 * Verify structure + checksum integrity of an envelope.
 */
export function verifyEnvelope(value: unknown): EnvelopeIntegrityResult {
  const schema = validateEnvelope(value);
  if (!schema.ok || !schema.envelope) {
    return {
      ok: false,
      schema_issues: schema.issues,
      integrity_ok: false,
      message: `schema invalid:\n${formatIssues(schema.issues)}`,
    };
  }

  const state = schema.envelope.state;
  const expected = computeChecksum(state);
  const integrity_ok = verifyChecksum(state);

  if (!integrity_ok) {
    return {
      ok: false,
      schema_issues: [],
      integrity_ok: false,
      expected_checksum: expected,
      actual_checksum: state.checksum,
      message: `checksum mismatch: expected ${expected}, got ${state.checksum}`,
    };
  }

  return {
    ok: true,
    schema_issues: [],
    integrity_ok: true,
    expected_checksum: expected,
    actual_checksum: state.checksum,
    message: "ok",
  };
}

/**
 * Compact one-line summary suitable for operator logs.
 */
export function summarizeEnvelope(envelope: Envelope): string {
  const s = envelope.state;
  const facts = s.verified_facts.length;
  const arts = s.artifacts.length;
  const constraints = s.constraints.length;
  const hop =
    s.handoff_from && s.handoff_to
      ? `${s.handoff_from} → ${s.handoff_to}`
      : s.handoff_from
        ? `${s.handoff_from} → *`
        : s.handoff_to
          ? `* → ${s.handoff_to}`
          : `* → *`;
  const goal =
    s.goal.length > 60 ? `${s.goal.slice(0, 57)}…` : s.goal;
  return (
    `[iahp ${envelope.created_at}] ${hop} | id=${s.id} | ` +
    `goal="${goal}" | facts=${facts} artifacts=${arts} constraints=${constraints} | ` +
    `checksum=${s.checksum.slice(0, 12)}…`
  );
}

/**
 * Verify a bare state object (structure + checksum).
 */
export function verifyState(value: unknown): {
  ok: boolean;
  message: string;
  state?: StateObject;
} {
  const schema = validateState(value);
  if (!schema.ok) {
    return {
      ok: false,
      message: `schema invalid:\n${formatIssues(schema.issues)}`,
    };
  }
  const state = schema.state;
  if (!verifyChecksum(state)) {
    return {
      ok: false,
      message: `checksum mismatch: expected ${computeChecksum(state)}, got ${state.checksum}`,
      state,
    };
  }
  return { ok: true, message: "ok", state };
}

/**
 * Validate and return the typed state, or throw ValidationError.
 * Does not check checksum integrity — use `assertSealedState` for that.
 */
export function assertValidState(value: unknown): StateObject {
  const result = validateState(value);
  if (!result.ok) {
    throw new ValidationError(
      `state failed validation:\n${formatIssues(result.issues)}`,
      result.issues,
    );
  }
  return result.state;
}

/**
 * Full accept path: schema + checksum. Throws typed errors on failure.
 */
export function assertSealedState(value: unknown): StateObject {
  const state = assertValidState(value);
  const expected = computeChecksum(state);
  if (!verifyChecksum(state)) {
    throw new ChecksumError(
      `checksum mismatch: expected ${expected}, got ${state.checksum}`,
      { expected, actual: state.checksum },
    );
  }
  return state;
}

/**
 * Validate and return a typed envelope, or throw ValidationError.
 */
export function assertValidEnvelope(value: unknown): Envelope {
  const result = validateEnvelope(value);
  if (!result.ok) {
    throw new ValidationError(
      `envelope failed validation:\n${formatIssues(result.issues)}`,
      result.issues,
    );
  }
  return result.envelope;
}
