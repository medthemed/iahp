/**
 * Watch mode: continuous revalidation of State Objects.
 *
 * Two drivers share the batch classifier (`classifyStateData`):
 *
 *  - Directory polling: `snapshotDirectory` fingerprints every `*.json`
 *    file (mtime + size); `runWatch` re-validates the directory only
 *    when the fingerprint changes, so embedders and tests can drive the
 *    loop without spawning the CLI.
 *  - Stdin NDJSON: each line is either a path to a state file or a
 *    state document itself; `evaluateWatchLine` classifies it and the
 *    caller emits one result per line until EOF.
 */

import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  classifyStateData,
  listStateFiles,
  validateBatch,
  type BatchFileResult,
  type BatchResult,
} from "./batch.js";
import { DEFAULT_CONFIG, type IahpConfig } from "./config.js";

/** Default polling interval for `iahp watch` (milliseconds). */
export const DEFAULT_WATCH_INTERVAL_MS = 2000;

/** Fingerprint of one file: what `sdd`-style polling compares. */
export interface FileFingerprint {
  mtimeMs: number;
  size: number;
}

/** Map of basename -> fingerprint for every state file in a directory. */
export type WatchSnapshot = Map<string, FileFingerprint>;

/**
 * Fingerprint every `*.json` State Object in `dir` (non-recursive).
 * Throws (like `listStateFiles`) when the directory cannot be read.
 */
export function snapshotDirectory(dir: string): WatchSnapshot {
  const abs = resolve(dir);
  const snapshot: WatchSnapshot = new Map();
  for (const name of listStateFiles(abs)) {
    const st = statSync(join(abs, name));
    snapshot.set(name, { mtimeMs: st.mtimeMs, size: st.size });
  }
  return snapshot;
}

export interface WatchChanges {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Compare two snapshots; all lists are sorted by file name. */
export function diffSnapshots(
  previous: WatchSnapshot,
  next: WatchSnapshot,
): WatchChanges {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [name, fp] of next) {
    const before = previous.get(name);
    if (!before) {
      added.push(name);
    } else if (before.mtimeMs !== fp.mtimeMs || before.size !== fp.size) {
      changed.push(name);
    }
  }
  for (const name of previous.keys()) {
    if (!next.has(name)) removed.push(name);
  }
  added.sort();
  removed.sort();
  changed.sort();
  return { added, removed, changed };
}

export function hasWatchChanges(changes: WatchChanges): boolean {
  return (
    changes.added.length > 0 ||
    changes.removed.length > 0 ||
    changes.changed.length > 0
  );
}

/** One revalidation of the watched directory, triggered by a change. */
export interface WatchScanEvent {
  /** ISO timestamp of the scan. */
  at: string;
  dir: string;
  /** True for the first scan, which always runs. */
  initial: boolean;
  changes: WatchChanges;
  result: BatchResult;
}

export interface WatchRunOptions {
  /** Poll interval in ms (default: DEFAULT_WATCH_INTERVAL_MS). */
  intervalMs?: number;
  config?: IahpConfig;
  /** Stop after this many polling scans (tests / embedders). */
  maxScans?: number;
  /** Abort to stop the loop cleanly (e.g. from a SIGINT handler). */
  signal?: AbortSignal;
  onEvent?: (event: WatchScanEvent) => void;
}

export interface WatchRunSummary {
  /** Number of polling scans performed. */
  scans: number;
  /** Number of scans that emitted an event (initial + changed scans). */
  events: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise) => {
    if (signal?.aborted) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolvePromise();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Poll `dir` and re-validate it whenever its fingerprint changes.
 * The first scan always emits an event. Resolves when `maxScans` is
 * reached or `signal` aborts; without either it runs until aborted.
 */
export async function runWatch(
  dir: string,
  options: WatchRunOptions = {},
): Promise<WatchRunSummary> {
  const intervalMs = options.intervalMs ?? DEFAULT_WATCH_INTERVAL_MS;
  const config = options.config ?? DEFAULT_CONFIG;
  let previous: WatchSnapshot | null = null;
  let scans = 0;
  let events = 0;

  for (;;) {
    if (options.signal?.aborted) break;
    const snapshot = snapshotDirectory(dir);
    const initial = previous === null;
    const changes: WatchChanges =
      previous === null
        ? { added: [...snapshot.keys()].sort(), removed: [], changed: [] }
        : diffSnapshots(previous, snapshot);

    if (initial || hasWatchChanges(changes)) {
      const event: WatchScanEvent = {
        at: new Date().toISOString(),
        dir,
        initial,
        changes,
        result: validateBatch(dir, config),
      };
      events++;
      options.onEvent?.(event);
    }
    previous = snapshot;
    scans++;
    if (options.maxScans !== undefined && scans >= options.maxScans) break;
    if (options.signal?.aborted) break;
    await sleep(intervalMs, options.signal);
  }
  return { scans, events };
}

const STATUS_LABEL: Record<BatchFileResult["status"], string> = {
  ok: "OK",
  schema_invalid: "SCHEMA INVALID",
  config_invalid: "CONFIG INVALID",
  integrity_failed: "INTEGRITY FAILED",
  unreadable: "UNREADABLE",
};

function describeChanges(changes: WatchChanges, initial: boolean): string {
  if (initial) return "initial scan";
  const parts: string[] = [
    ...changes.added.map((f) => `${f} (added)`),
    ...changes.changed.map((f) => `${f} (modified)`),
    ...changes.removed.map((f) => `${f} (removed)`),
  ];
  return parts.length > 0 ? `changed: ${parts.join(", ")}` : "no changes";
}

/** Compact one-line status for a watch scan event. */
export function formatWatchScan(event: WatchScanEvent): string {
  const s = event.result.summary;
  return (
    `[${event.at}] watch: ${s.total} file(s) — ${s.ok} ok, ` +
    `${s.schema_invalid} schema-invalid, ${s.config_invalid} config-invalid, ` +
    `${s.integrity_failed} integrity-failed, ${s.unreadable} unreadable · ` +
    describeChanges(event.changes, event.initial)
  );
}

// ---------------------------------------------------------------------------
// Stdin NDJSON mode
// ---------------------------------------------------------------------------

/** One parsed stdin line: a file path, a state document, or neither. */
export type WatchLineInput =
  | { kind: "empty" }
  | { kind: "path"; path: string }
  | { kind: "document"; value: unknown }
  | { kind: "invalid"; message: string };

/**
 * Parse one NDJSON line. Lines starting with `{` or `[` are parsed as a
 * state document; a JSON string literal is a path; anything else is a
 * plain path. Blank lines are `empty`.
 */
export function parseWatchLine(line: string): WatchLineInput {
  const trimmed = line.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { kind: "document", value: JSON.parse(trimmed) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "invalid", message: `not valid JSON: ${msg}` };
    }
  }
  if (trimmed.startsWith('"')) {
    try {
      const v: unknown = JSON.parse(trimmed);
      if (typeof v === "string") return { kind: "path", path: v };
    } catch {
      // fall through: treat the raw text as a path
    }
  }
  return { kind: "path", path: trimmed };
}

export interface WatchLineResult {
  /** 1-based line number in the stdin stream. */
  line: number;
  source: "path" | "document";
  file: string;
  status: BatchFileResult["status"];
  issues: BatchFileResult["issues"];
  message?: string;
}

/**
 * Evaluate one stdin line. Returns null for blank lines.
 * Paths are read relative to the current working directory; unreadable
 * files and non-JSON contents classify as `unreadable`, matching
 * `validateBatch`.
 */
export function evaluateWatchLine(
  line: string,
  lineNumber: number,
  config: IahpConfig = DEFAULT_CONFIG,
): WatchLineResult | null {
  const input = parseWatchLine(line);
  if (input.kind === "empty") return null;
  if (input.kind === "invalid") {
    return {
      line: lineNumber,
      source: "document",
      file: "<stdin>",
      status: "unreadable",
      issues: [],
      message: input.message,
    };
  }
  if (input.kind === "document") {
    const r = classifyStateData("<stdin>", input.value, config);
    return { line: lineNumber, source: "document", ...r };
  }
  // path
  let raw: string;
  try {
    raw = readFileSync(resolve(input.path), "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      line: lineNumber,
      source: "path",
      file: input.path,
      status: "unreadable",
      issues: [],
      message: msg,
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      line: lineNumber,
      source: "path",
      file: input.path,
      status: "unreadable",
      issues: [],
      message: `not valid JSON: ${msg}`,
    };
  }
  const r = classifyStateData(input.path, data, config);
  return { line: lineNumber, source: "path", ...r };
}

/** Evaluate many stdin lines (blank lines are skipped). */
export function evaluateWatchLines(
  lines: Iterable<string>,
  config: IahpConfig = DEFAULT_CONFIG,
): WatchLineResult[] {
  const results: WatchLineResult[] = [];
  let n = 0;
  for (const line of lines) {
    n++;
    const r = evaluateWatchLine(line, n, config);
    if (r) results.push(r);
  }
  return results;
}

/** Compact one-line status for a stdin result. */
export function formatWatchLineResult(result: WatchLineResult): string {
  const label = STATUS_LABEL[result.status].padEnd(16);
  const where =
    result.source === "document" ? `<stdin> line ${result.line}` : result.file;
  const detail = result.message ? ` — ${result.message}` : "";
  return `${label} ${where}${detail}`;
}
