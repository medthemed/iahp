/**
 * Optional project config: `iahp.config.json`.
 *
 * Loaded from the working directory (or a path passed to the CLI).
 * Supplies defaults for schema_version and which fields a State Object
 * must include before validation will accept it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";

/** Fields a config may require to be non-empty on a State Object. */
export const REQUIRABLE_FIELDS = [
  "goal",
  "constraints",
  "verified_facts",
  "artifacts",
  "provenance",
] as const;

export type RequirableField = (typeof REQUIRABLE_FIELDS)[number];

export interface IahpConfig {
  /** Default schema_version applied by `iahp init`. */
  schema_version: string;
  /** Fields that must be present and non-empty. */
  required_fields: RequirableField[];
}

export const DEFAULT_CONFIG: IahpConfig = Object.freeze({
  schema_version: SCHEMA_VERSION,
  required_fields: Object.freeze([]) as unknown as RequirableField[],
});

export const CONFIG_FILENAME = "iahp.config.json";

export class ConfigError extends Error {
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(message);
    this.name = "ConfigError";
    this.path = path;
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse and validate a raw config object.
 * Unknown keys are ignored; invalid known keys throw ConfigError.
 */
export function parseConfig(
  raw: unknown,
  sourcePath?: string,
): IahpConfig {
  if (!isRecord(raw)) {
    throw new ConfigError("config must be a JSON object", sourcePath);
  }

  const schema_version =
    raw.schema_version === undefined
      ? DEFAULT_CONFIG.schema_version
      : raw.schema_version;

  if (typeof schema_version !== "string" || schema_version.trim() === "") {
    throw new ConfigError(
      "schema_version must be a non-empty string",
      sourcePath,
    );
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schema_version)) {
    throw new ConfigError(
      `unsupported schema_version "${schema_version}"; supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      sourcePath,
    );
  }

  let required_fields: RequirableField[] = [];
  if (raw.required_fields !== undefined) {
    if (!Array.isArray(raw.required_fields)) {
      throw new ConfigError("required_fields must be an array", sourcePath);
    }
    const allowed = new Set<string>(REQUIRABLE_FIELDS);
    for (const item of raw.required_fields) {
      if (typeof item !== "string" || !allowed.has(item)) {
        throw new ConfigError(
          `required_fields contains unknown field ${JSON.stringify(item)}; allowed: ${REQUIRABLE_FIELDS.join(", ")}`,
          sourcePath,
        );
      }
      if (!required_fields.includes(item as RequirableField)) {
        required_fields.push(item as RequirableField);
      }
    }
  }

  return { schema_version, required_fields };
}

/**
 * Load config from an absolute path. Missing file → defaults.
 */
export function loadConfig(path: string): IahpConfig {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ...DEFAULT_CONFIG, required_fields: [] };
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`cannot read config: ${msg}`, abs);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`config is not valid JSON: ${msg}`, abs);
  }
  return parseConfig(parsed, abs);
}

/**
 * Load config from a directory, looking for `iahp.config.json`.
 * Falls back to defaults when the file is absent.
 */
export function loadConfigFromDir(dir: string): IahpConfig {
  return loadConfig(resolve(dir, CONFIG_FILENAME));
}

/**
 * Apply config-required field checks on top of structural validation
 * issues. Returns additional issues (does not replace existing ones).
 */
export function checkRequiredFields(
  state: Record<string, unknown>,
  config: IahpConfig,
): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  for (const field of config.required_fields) {
    const value = state[field];
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      issues.push({
        path: field,
        message: `required by iahp.config.json but missing or empty`,
      });
    }
  }
  return issues;
}

/** Serialize a config to pretty JSON (for `iahp init` output). */
export function configToJson(config: IahpConfig): string {
  return JSON.stringify(
    {
      schema_version: config.schema_version,
      required_fields: config.required_fields,
    },
    null,
    2,
  );
}
