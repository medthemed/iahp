export {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
} from "./schema.js";
export type {
  ArtifactRef,
  Envelope,
  ProvenanceEntry,
  SchemaVersion,
  StateChecksumPayload,
  StateObject,
  VerifiedFact,
} from "./schema.js";

export { canonicalJson, canonicalize } from "./canonical.js";
export {
  checksumsEqual,
  computeChecksum,
  sealChecksum,
  sha256Hex,
  verifyChecksum,
} from "./checksum.js";
export {
  formatIssues,
  validateEnvelope,
  validateState,
} from "./validate.js";
export type {
  EnvelopeValidationResult,
  ValidationIssue,
  ValidationResult,
} from "./validate.js";
export {
  createEnvelope,
  summarizeEnvelope,
  verifyEnvelope,
  verifyState,
} from "./envelope.js";
export type {
  CreateEnvelopeOptions,
  EnvelopeIntegrityResult,
} from "./envelope.js";
export { buildExampleState, exampleStateJson } from "./example.js";
export { diffStates, extractState, formatDiff } from "./diff.js";
export type { FieldChange, ListChange, StateDiff } from "./diff.js";
