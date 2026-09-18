/**
 * Public API surface for iahp.
 *
 * Everything exported from `index.ts` is listed here. The `PUBLIC_API`
 * object is frozen so accidental runtime mutation of the export table
 * fails fast instead of silently changing what consumers can import.
 */

import { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
import { canonicalJson, canonicalize } from "./canonical.js";
import {
  checksumsEqual,
  computeChecksum,
  sealChecksum,
  sha256Hex,
  verifyChecksum,
} from "./checksum.js";
import { formatIssues, validateEnvelope, validateState } from "./validate.js";
import {
  assertSealedState,
  assertValidEnvelope,
  assertValidState,
  createEnvelope,
  summarizeEnvelope,
  verifyEnvelope,
  verifyState,
} from "./envelope.js";
import { buildExampleState, exampleStateJson } from "./example.js";
import { diffStates, extractState, formatDiff } from "./diff.js";
import {
  ChecksumError,
  ValidationError,
  isChecksumError,
  isValidationError,
} from "./errors.js";

/** Frozen catalog of runtime values in the public API. */
export const PUBLIC_API = Object.freeze({
  // schema
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  // canonical
  canonicalJson,
  canonicalize,
  // checksum
  checksumsEqual,
  computeChecksum,
  sealChecksum,
  sha256Hex,
  verifyChecksum,
  // validate
  formatIssues,
  validateEnvelope,
  validateState,
  // envelope
  assertSealedState,
  assertValidEnvelope,
  assertValidState,
  createEnvelope,
  summarizeEnvelope,
  verifyEnvelope,
  verifyState,
  // example
  buildExampleState,
  exampleStateJson,
  // diff
  diffStates,
  extractState,
  formatDiff,
  // errors
  ChecksumError,
  ValidationError,
  isChecksumError,
  isValidationError,
});

/** Sorted list of public export names (types are compile-time only). */
export const PUBLIC_API_NAMES: readonly string[] = Object.freeze(
  Object.keys(PUBLIC_API).sort(),
);
