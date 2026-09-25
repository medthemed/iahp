/**
 * Batch validation of State Objects stored as JSON files in a directory.
 *
 * Pure per-file classification is separated from filesystem I/O so tests
 * and library callers can classify values without touching disk.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkRequiredFields, DEFAULT_CONFIG, type IahpConfig } from "./config.js";
import { computeChecksum, verifyChecksum } from "./checksum.js";
import type { ValidationIssue } from "./validate.js";
import { formatIssues, validateState } from "./validate.js";

/** Per-file outcome of a batch validate run. */
export type BatchFileStatus =
  | "ok"
  | "schema_invalid"
  | "config_invalid"
  | "integrity_failed"
  | "unreadable";

export interface BatchFileResult {
  /** File name relative to the batch directory (basename). */
  file: string;
  status: BatchFileStatus;
  issues: ValidationIssue[];
  /** Extra human-readable detail (e.g. checksum mismatch). */
  message?: string;
}

export interface BatchSummary {
  total: number;
  ok: number;
  schema_invalid: number;
  config_invalid: number;
  integrity_failed: number;
  unreadable: number;
}

export interface BatchResult {
  dir: string;
  files: BatchFileResult[];
  summary: BatchSummary;
  /** True when every file ended as `ok`. */
  ok: boolean;
}

/** Config files that should not be treated as State Objects. */
const SKIP_BASENAMES = new Set(["iahp.config.json", "package.json", "package-lock.json"]);

/**
 * List `*.json` files in a directory (non-recursive), sorted by name.
 * Skips known non-state config files.
 */
export function listStateFiles(dir: string): string[] {
  const abs = resolve(dir);
  let names: string[];
  try {
    names = readdirSync(abs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot read directory ${dir}: ${msg}`);
  }

  const files: string[] = [];
  for (const name of names) {
    if (SKIP_BASENAMES.has(name)) continue;
    if (!name.toLowerCase().endsWith(".json")) continue;
    const full = join(abs, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    files.push(name);
  }
  files.sort();
  return files;
}

/**
 * Classify a single parsed JSON value as a State Object under `config`.
 * No filesystem access — pure.
 */
export function classifyStateData(
  file: string,
  data: unknown,
  config: IahpConfig = DEFAULT_CONFIG,
): BatchFileResult {
  const schema = validateState(data);
  if (!schema.ok) {
    return {
      file,
      status: "schema_invalid",
      issues: schema.issues,
    };
  }

  const requiredIssues = checkRequiredFields(
    data as Record<string, unknown>,
    config,
  );
  if (requiredIssues.length > 0) {
    return {
      file,
      status: "config_invalid",
      issues: requiredIssues,
    };
  }

  const state = schema.state;
  if (!verifyChecksum(state)) {
    return {
      file,
      status: "integrity_failed",
      issues: [],
      message: `checksum mismatch: expected ${computeChecksum(state)}, got ${state.checksum}`,
    };
  }

  return { file, status: "ok", issues: [] };
}

function emptySummary(): BatchSummary {
  return {
    total: 0,
    ok: 0,
    schema_invalid: 0,
    config_invalid: 0,
    integrity_failed: 0,
    unreadable: 0,
  };
}

/**
 * Validate every `*.json` file in `dir` (non-recursive).
 * Unreadable or non-JSON files are reported as `unreadable` rather than
 * aborting the batch.
 */
export function validateBatch(
  dir: string,
  config: IahpConfig = DEFAULT_CONFIG,
): BatchResult {
  const abs = resolve(dir);
  let names: string[];
  try {
    names = listStateFiles(abs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }

  const files: BatchFileResult[] = [];
  const summary = emptySummary();

  for (const name of names) {
    const full = join(abs, name);
    let raw: string;
    try {
      raw = readFileSync(full, "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      files.push({
        file: name,
        status: "unreadable",
        issues: [],
        message: msg,
      });
      summary.unreadable++;
      summary.total++;
      continue;
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      files.push({
        file: name,
        status: "unreadable",
        issues: [],
        message: `not valid JSON: ${msg}`,
      });
      summary.unreadable++;
      summary.total++;
      continue;
    }

    const result = classifyStateData(name, data, config);
    files.push(result);
    summary.total++;
    summary[result.status]++;
  }

  return {
    dir,
    files,
    summary,
    ok: summary.total > 0 && summary.ok === summary.total,
  };
}

const STATUS_LABEL: Record<BatchFileStatus, string> = {
  ok: "OK",
  schema_invalid: "SCHEMA INVALID",
  config_invalid: "CONFIG INVALID",
  integrity_failed: "INTEGRITY FAILED",
  unreadable: "UNREADABLE",
};

/** Human-readable multi-line report for a batch run. */
export function formatBatchReport(result: BatchResult): string {
  const lines: string[] = [];
  lines.push(`batch validate: ${result.dir}`);
  for (const f of result.files) {
    lines.push(`  ${STATUS_LABEL[f.status].padEnd(16)} ${f.file}`);
    if (f.issues.length > 0) {
      lines.push(formatIssues(f.issues));
    }
    if (f.message) {
      lines.push(`    ${f.message}`);
    }
  }
  const s = result.summary;
  lines.push("");
  lines.push(
    `summary: ${s.total} file(s) — ${s.ok} ok, ${s.schema_invalid} schema-invalid, ` +
      `${s.config_invalid} config-invalid, ${s.integrity_failed} integrity-failed, ` +
      `${s.unreadable} unreadable`,
  );
  return lines.join("\n");
}
