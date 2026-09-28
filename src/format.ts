/**
 * Stable machine-readable output contract for the iahp CLI.
 *
 * Every `--format json` payload is wrapped in a small envelope:
 *   { schema_version, ok, command, ...payload }
 *
 * `schema_version` is currently `"1"`. Additive fields may appear in
 * later versions; existing fields will not be renamed or removed
 * within the same major schema_version.
 */

import type { ValidationIssue } from "./validate.js";
import type { StateDiff } from "./diff.js";

/** Current JSON output schema version (string, bumped on breaking change). */
export const OUTPUT_SCHEMA_VERSION = "1" as const;

export type OutputFormat = "text" | "json";

/** Status codes shared by validate and validate-batch JSON output. */
export type ValidateStatus =
  | "ok"
  | "schema_invalid"
  | "config_invalid"
  | "integrity_failed";

export interface ValidateJson {
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  ok: boolean;
  command: "validate";
  file: string;
  status: ValidateStatus;
  issues: ValidationIssue[];
  message?: string;
}

export interface ChecksumJson {
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  ok: boolean;
  command: "checksum";
  file: string;
  /** SHA-256 hex of the canonical payload (always present). */
  checksum: string;
  /** True when structural validation passed. */
  schema_ok: boolean;
  issues: ValidationIssue[];
}

export interface DiffJson {
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  ok: boolean;
  command: "diff";
  file_a: string;
  file_b: string;
  /** True when no semantic differences were found. */
  equal: boolean;
  diff: StateDiff;
}

export interface ValidateBatchJson {
  schema_version: typeof OUTPUT_SCHEMA_VERSION;
  ok: boolean;
  command: "validate-batch";
  dir: string;
  files: Array<{
    file: string;
    status: ValidateStatus | "unreadable";
    issues: ValidationIssue[];
    message?: string;
  }>;
  summary: {
    total: number;
    ok: number;
    schema_invalid: number;
    config_invalid: number;
    integrity_failed: number;
    unreadable: number;
  };
}

export type CliJsonOutput =
  | ValidateJson
  | ChecksumJson
  | DiffJson
  | ValidateBatchJson;

/** Serialize any CLI JSON payload with the stable envelope fields. */
export function toJsonLine(payload: CliJsonOutput): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a `--format` flag value. Returns undefined for missing/empty.
 * Throws on unknown values so the CLI can fail with a clear message.
 */
export function parseOutputFormat(value: string | undefined): OutputFormat | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "json") return "json";
  if (v === "text") return "text";
  throw new Error(`unknown --format "${value}"; expected json or text`);
}
