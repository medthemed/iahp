import { SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
import type {
  ArtifactRef,
  Envelope,
  ProvenanceEntry,
  StateObject,
  VerifiedFact,
} from "./schema.js";

export interface ValidationIssue {
  /** JSON-path-like location, e.g. `verified_facts[0].claim`. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; issues: []; state: StateObject }
  | { ok: false; issues: ValidationIssue[]; state?: undefined };

export type EnvelopeValidationResult =
  | { ok: true; issues: []; envelope: Envelope }
  | { ok: false; issues: ValidationIssue[]; envelope?: undefined };

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isIsoish(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 10) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function checkStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  opts: { minLength?: number } = {},
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array of strings"));
    return;
  }
  value.forEach((item, i) => {
    if (!isNonEmptyString(item)) {
      issues.push(issue(`${path}[${i}]`, "expected a non-empty string"));
    }
  });
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    issues.push(
      issue(path, `expected at least ${opts.minLength} entr${opts.minLength === 1 ? "y" : "ies"}`),
    );
  }
}

function checkVerifiedFacts(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array of verified facts"));
    return;
  }
  value.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      issues.push(issue(p, "expected an object"));
      return;
    }
    const fact = item as Partial<VerifiedFact>;
    if (!isNonEmptyString(fact.claim)) {
      issues.push(issue(`${p}.claim`, "expected a non-empty string"));
    }
    if (!isNonEmptyString(fact.method)) {
      issues.push(issue(`${p}.method`, "expected a non-empty string"));
    }
    if (!isIsoish(fact.verified_at)) {
      issues.push(
        issue(`${p}.verified_at`, "expected an ISO-8601 timestamp"),
      );
    }
    if (
      typeof fact.confidence !== "number" ||
      !Number.isFinite(fact.confidence) ||
      fact.confidence < 0 ||
      fact.confidence > 1
    ) {
      issues.push(
        issue(`${p}.confidence`, "expected a number between 0 and 1"),
      );
    }
  });
}

function checkArtifacts(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array of artifacts"));
    return;
  }
  value.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      issues.push(issue(p, "expected an object"));
      return;
    }
    const art = item as Partial<ArtifactRef>;
    if (!isNonEmptyString(art.id)) {
      issues.push(issue(`${p}.id`, "expected a non-empty string"));
    }
    if (!isNonEmptyString(art.name)) {
      issues.push(issue(`${p}.name`, "expected a non-empty string"));
    }
    if (!isNonEmptyString(art.media_type)) {
      issues.push(issue(`${p}.media_type`, "expected a non-empty string"));
    }
    if (!isNonEmptyString(art.uri)) {
      issues.push(issue(`${p}.uri`, "expected a non-empty string"));
    }
    if (
      art.content_hash !== undefined &&
      !isNonEmptyString(art.content_hash)
    ) {
      issues.push(issue(`${p}.content_hash`, "expected a non-empty string"));
    }
  });
}

function checkProvenance(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "expected an array of provenance entries"));
    return;
  }
  value.forEach((item, i) => {
    const p = `${path}[${i}]`;
    if (!isRecord(item)) {
      issues.push(issue(p, "expected an object"));
      return;
    }
    const entry = item as Partial<ProvenanceEntry>;
    if (!isNonEmptyString(entry.actor)) {
      issues.push(issue(`${p}.actor`, "expected a non-empty string"));
    }
    if (!isIsoish(entry.at)) {
      issues.push(issue(`${p}.at`, "expected an ISO-8601 timestamp"));
    }
    if (!isNonEmptyString(entry.action)) {
      issues.push(issue(`${p}.action`, "expected a non-empty string"));
    }
    if (entry.ref !== undefined && !isNonEmptyString(entry.ref)) {
      issues.push(issue(`${p}.ref`, "expected a non-empty string"));
    }
  });
}

function checkNullableAgentId(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === null) return;
  if (!isNonEmptyString(value)) {
    issues.push(
      issue(path, "expected a non-empty string or null"),
    );
  }
}

/**
 * Validate an unknown value as a StateObject.
 * Does not verify the checksum — use `verifyChecksum` for integrity.
 */
export function validateState(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [issue("$", "state must be a JSON object")],
    };
  }

  const s = value as Partial<StateObject> & Record<string, unknown>;

  if (!isNonEmptyString(s.schema_version)) {
    issues.push(issue("schema_version", "expected a non-empty string"));
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(s.schema_version)) {
    issues.push(
      issue(
        "schema_version",
        `unsupported schema_version "${s.schema_version}"; supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
      ),
    );
  }

  if (!isNonEmptyString(s.id)) {
    issues.push(issue("id", "expected a non-empty string"));
  }

  if (!isNonEmptyString(s.goal)) {
    issues.push(issue("goal", "expected a non-empty string"));
  }

  checkStringArray(s.constraints, "constraints", issues);
  checkVerifiedFacts(s.verified_facts, "verified_facts", issues);
  checkArtifacts(s.artifacts, "artifacts", issues);
  checkProvenance(s.provenance, "provenance", issues);
  checkNullableAgentId(s.handoff_from, "handoff_from", issues);
  checkNullableAgentId(s.handoff_to, "handoff_to", issues);

  if (!isNonEmptyString(s.checksum)) {
    issues.push(
      issue("checksum", "expected a non-empty SHA-256 hex string"),
    );
  } else if (!/^[0-9a-f]{64}$/.test(s.checksum)) {
    issues.push(
      issue("checksum", "expected 64 lowercase hex characters (SHA-256)"),
    );
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, issues: [], state: value as unknown as StateObject };
}

/**
 * Validate an A2A envelope wrapping a state.
 */
export function validateEnvelope(value: unknown): EnvelopeValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [issue("$", "envelope must be a JSON object")],
    };
  }

  const e = value as Partial<Envelope> & Record<string, unknown>;

  if (e.envelope_version !== "1") {
    issues.push(
      issue("envelope_version", 'expected the string "1"'),
    );
  }

  if (!isIsoish(e.created_at)) {
    issues.push(
      issue("created_at", "expected an ISO-8601 timestamp"),
    );
  }

  if (e.state === undefined) {
    issues.push(issue("state", "expected a state object"));
  } else {
    const inner = validateState(e.state);
    for (const i of inner.issues) {
      issues.push(issue(`state.${i.path === "$" ? "" : i.path}`.replace(/\.$/, "") || "state", i.message));
    }
  }

  if (e.note !== undefined && typeof e.note !== "string") {
    issues.push(issue("note", "expected a string"));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, issues: [], envelope: value as unknown as Envelope };
}

/** Format issues as a multi-line human-readable string. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n");
}
