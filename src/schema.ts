/**
 * IAHP State Object schema and shared types.
 *
 * A State Object is the portable unit handed between agents. It carries
 * goal, constraints, verified facts, artifacts, and provenance so a
 * receiving agent can resume work without scraping raw chat text.
 */

export const SCHEMA_VERSION = "1.0.0" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

/** Versions this library can validate. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ["1.0.0"];

export interface ProvenanceEntry {
  /** Agent or system that produced this entry. */
  actor: string;
  /** ISO-8601 timestamp. */
  at: string;
  /** Short description of what happened. */
  action: string;
  /** Optional reference to a source document, tool result, or URL. */
  ref?: string;
}

export interface ArtifactRef {
  /** Stable identifier for the artifact. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Media type or kind, e.g. application/json, text/markdown. */
  media_type: string;
  /** Location — path, URL, or inline pointer. */
  uri: string;
  /** Optional integrity hash of the artifact contents. */
  content_hash?: string;
}

export interface VerifiedFact {
  /** The claim that was verified. */
  claim: string;
  /** How it was verified (tool, human review, test run, …). */
  method: string;
  /** When it was verified (ISO-8601). */
  verified_at: string;
  /** Confidence 0–1. */
  confidence: number;
}

export interface StateObject {
  schema_version: SchemaVersion;
  /** Stable id for this state instance. */
  id: string;
  /** What the receiving agent should accomplish. */
  goal: string;
  /** Hard boundaries the receiver must respect. */
  constraints: string[];
  /** Facts the sender has already verified. */
  verified_facts: VerifiedFact[];
  /** Artifacts produced or referenced so far. */
  artifacts: ArtifactRef[];
  /** Chain of custody / history. */
  provenance: ProvenanceEntry[];
  /** Agent id that is handing off. Null for an initial state. */
  handoff_from: string | null;
  /** Agent id expected to receive this state. Null if open. */
  handoff_to: string | null;
  /** SHA-256 hex of the canonical JSON of this state (excluding checksum). */
  checksum: string;
}

/** Payload used to compute checksum — StateObject without the checksum field. */
export type StateChecksumPayload = Omit<StateObject, "checksum">;

export interface Envelope {
  /** Envelope format version. */
  envelope_version: "1";
  /** When the handoff was packaged (ISO-8601). */
  created_at: string;
  /** The portable state. */
  state: StateObject;
  /** Optional free-form note for operators/logs. */
  note?: string;
}
