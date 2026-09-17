/**
 * Scaffold helpers for `iahp init`.
 *
 * Produce a fresh, sealed State Object (and optionally a project config)
 * so a new handoff pipeline can start without hand-copying the schema.
 */

import { SCHEMA_VERSION } from "./schema.js";
import type { StateObject, StateChecksumPayload } from "./schema.js";
import { sealChecksum } from "./checksum.js";
import { configToJson, type IahpConfig, DEFAULT_CONFIG } from "./config.js";

export interface InitOptions {
  /** Stable id for the scaffolded state. Defaults to a generated one. */
  id?: string;
  /** Initial goal text. */
  goal?: string;
  /** Agent handing off. */
  handoff_from?: string | null;
  /** Agent expected to receive. */
  handoff_to?: string | null;
  /** Override schema_version (must be supported). */
  schema_version?: string;
}

function generateId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `st_${stamp}_${rand}`;
}

/**
 * Build a minimal, sealed State Object ready to edit and hand off.
 */
export function scaffoldState(options: InitOptions = {}): StateObject {
  const now = new Date().toISOString();
  const payload: StateChecksumPayload = {
    schema_version: (options.schema_version ?? SCHEMA_VERSION) as StateObject["schema_version"],
    id: options.id ?? generateId(),
    goal: options.goal ?? "Describe the goal for the receiving agent.",
    constraints: [],
    verified_facts: [],
    artifacts: [],
    provenance: [
      {
        actor: options.handoff_from ?? "local",
        at: now,
        action: "scaffolded via iahp init",
      },
    ],
    handoff_from: options.handoff_from ?? null,
    handoff_to: options.handoff_to ?? null,
  };
  return sealChecksum(payload);
}

/** Pretty-printed JSON of a scaffolded state. */
export function scaffoldStateJson(options: InitOptions = {}): string {
  return JSON.stringify(scaffoldState(options), null, 2);
}

/**
 * Default project config written by `iahp init --config`.
 */
export function scaffoldConfig(overrides: Partial<IahpConfig> = {}): IahpConfig {
  return {
    schema_version: overrides.schema_version ?? DEFAULT_CONFIG.schema_version,
    required_fields: overrides.required_fields ?? [],
  };
}

export function scaffoldConfigJson(overrides: Partial<IahpConfig> = {}): string {
  return configToJson(scaffoldConfig(overrides));
}
