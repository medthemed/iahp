import type { ArtifactRef, StateObject, VerifiedFact } from "./schema.js";

export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface FieldChange {
  field: string;
  kind: ChangeKind;
  from?: unknown;
  to?: unknown;
}

export interface ListChange {
  added: string[];
  removed: string[];
}

export interface StateDiff {
  /** True when no semantic differences were found. */
  equal: boolean;
  goal: FieldChange | null;
  handoff_from: FieldChange | null;
  handoff_to: FieldChange | null;
  schema_version: FieldChange | null;
  constraints: ListChange;
  /** Matched by claim text. */
  verified_facts: {
    added: VerifiedFact[];
    removed: VerifiedFact[];
    changed: Array<{ claim: string; from: VerifiedFact; to: VerifiedFact }>;
  };
  /** Matched by artifact id. */
  artifacts: {
    added: ArtifactRef[];
    removed: ArtifactRef[];
    changed: Array<{ id: string; from: ArtifactRef; to: ArtifactRef }>;
  };
  /** Provenance is append-only; report the new tail after a shared prefix. */
  provenance_added: StateObject["provenance"];
  /** Human-readable one-line change, suitable for CLI / logs. */
  summary: string;
}

function fieldChange(field: string, from: unknown, to: unknown): FieldChange | null {
  if (from === to) return null;
  return { field, kind: "changed", from, to };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function listChange(from: string[], to: string[]): ListChange {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  return {
    added: [...toSet].filter((x) => !fromSet.has(x)),
    removed: [...fromSet].filter((x) => !toSet.has(x)),
  };
}

/**
 * Semantic diff of two State Objects.
 *
 * Lists are compared by stable identity:
 * - constraints: exact string
 * - verified_facts: claim text
 * - artifacts: artifact id
 * - provenance: append-only log (only the new tail is reported)
 *
 * Checksums are ignored on purpose — they always differ when anything
 * else does, and would drown the useful signal.
 */
export function diffStates(from: StateObject, to: StateObject): StateDiff {
  const goal = fieldChange("goal", from.goal, to.goal);
  const handoff_from = fieldChange("handoff_from", from.handoff_from, to.handoff_from);
  const handoff_to = fieldChange("handoff_to", from.handoff_to, to.handoff_to);
  const schema_version = fieldChange("schema_version", from.schema_version, to.schema_version);

  const constraints = listChange(from.constraints, to.constraints);

  const fromFacts = new Map(from.verified_facts.map((f) => [f.claim, f]));
  const toFacts = new Map(to.verified_facts.map((f) => [f.claim, f]));
  const factsAdded: VerifiedFact[] = [];
  const factsRemoved: VerifiedFact[] = [];
  const factsChanged: StateDiff["verified_facts"]["changed"] = [];
  for (const [claim, fact] of toFacts) {
    const prev = fromFacts.get(claim);
    if (!prev) factsAdded.push(fact);
    else if (!deepEqual(prev, fact)) factsChanged.push({ claim, from: prev, to: fact });
  }
  for (const [claim, fact] of fromFacts) {
    if (!toFacts.has(claim)) factsRemoved.push(fact);
  }

  const fromArts = new Map(from.artifacts.map((a) => [a.id, a]));
  const toArts = new Map(to.artifacts.map((a) => [a.id, a]));
  const artsAdded: ArtifactRef[] = [];
  const artsRemoved: ArtifactRef[] = [];
  const artsChanged: StateDiff["artifacts"]["changed"] = [];
  for (const [id, art] of toArts) {
    const prev = fromArts.get(id);
    if (!prev) artsAdded.push(art);
    else if (!deepEqual(prev, art)) artsChanged.push({ id, from: prev, to: art });
  }
  for (const [id, art] of fromArts) {
    if (!toArts.has(id)) artsRemoved.push(art);
  }

  // Provenance is an append-only log. Report entries in `to` after the
  // longest shared prefix of identical entries.
  let prefix = 0;
  const maxPrefix = Math.min(from.provenance.length, to.provenance.length);
  while (prefix < maxPrefix && deepEqual(from.provenance[prefix], to.provenance[prefix])) {
    prefix++;
  }
  const provenanceTail = to.provenance.slice(prefix);

  const equal =
    !goal &&
    !handoff_from &&
    !handoff_to &&
    !schema_version &&
    constraints.added.length === 0 &&
    constraints.removed.length === 0 &&
    factsAdded.length === 0 &&
    factsRemoved.length === 0 &&
    factsChanged.length === 0 &&
    artsAdded.length === 0 &&
    artsRemoved.length === 0 &&
    artsChanged.length === 0 &&
    provenanceTail.length === 0;

  const summary = equal
    ? "no semantic differences"
    : [
        goal ? "goal changed" : null,
        handoff_from || handoff_to ? "handoff changed" : null,
        schema_version ? "schema_version changed" : null,
        constraints.added.length || constraints.removed.length
          ? `constraints +${constraints.added.length}/-${constraints.removed.length}`
          : null,
        factsAdded.length || factsRemoved.length || factsChanged.length
          ? `facts +${factsAdded.length}/~${factsChanged.length}/-${factsRemoved.length}`
          : null,
        artsAdded.length || artsRemoved.length || artsChanged.length
          ? `artifacts +${artsAdded.length}/~${artsChanged.length}/-${artsRemoved.length}`
          : null,
        provenanceTail.length ? `provenance +${provenanceTail.length}` : null,
      ]
        .filter(Boolean)
        .join(", ");

  return {
    equal,
    goal,
    handoff_from,
    handoff_to,
    schema_version,
    constraints,
    verified_facts: { added: factsAdded, removed: factsRemoved, changed: factsChanged },
    artifacts: { added: artsAdded, removed: artsRemoved, changed: artsChanged },
    provenance_added: provenanceTail,
    summary,
  };
}

/** Accepts either a bare State Object or an Envelope wrapping one. */
export function extractState(value: unknown): StateObject | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (obj.state && typeof obj.state === "object") {
    return obj.state as StateObject;
  }
  if (typeof obj.goal === "string" && Array.isArray(obj.constraints)) {
    return value as StateObject;
  }
  return null;
}

/** Render a StateDiff as plain text for the CLI. */
export function formatDiff(diff: StateDiff): string {
  if (diff.equal) return "no semantic differences";
  const lines: string[] = [];

  const pushField = (fc: FieldChange | null): void => {
    if (!fc) return;
    lines.push(`~ ${fc.field}`);
    lines.push(`    - ${JSON.stringify(fc.from)}`);
    lines.push(`    + ${JSON.stringify(fc.to)}`);
  };

  pushField(diff.goal);
  pushField(diff.handoff_from);
  pushField(diff.handoff_to);
  pushField(diff.schema_version);

  for (const c of diff.constraints.added) lines.push(`+ constraint ${JSON.stringify(c)}`);
  for (const c of diff.constraints.removed) lines.push(`- constraint ${JSON.stringify(c)}`);

  for (const f of diff.verified_facts.added) {
    lines.push(`+ fact ${JSON.stringify(f.claim)}`);
  }
  for (const f of diff.verified_facts.removed) {
    lines.push(`- fact ${JSON.stringify(f.claim)}`);
  }
  for (const ch of diff.verified_facts.changed) {
    lines.push(`~ fact ${JSON.stringify(ch.claim)}`);
    lines.push(
      `    - confidence=${ch.from.confidence} method=${JSON.stringify(ch.from.method)}`,
    );
    lines.push(
      `    + confidence=${ch.to.confidence} method=${JSON.stringify(ch.to.method)}`,
    );
  }

  for (const a of diff.artifacts.added) lines.push(`+ artifact ${a.id} (${a.name})`);
  for (const a of diff.artifacts.removed) lines.push(`- artifact ${a.id} (${a.name})`);
  for (const ch of diff.artifacts.changed) {
    lines.push(`~ artifact ${ch.id}`);
    lines.push(`    - ${JSON.stringify(ch.from)}`);
    lines.push(`    + ${JSON.stringify(ch.to)}`);
  }

  for (const p of diff.provenance_added) {
    lines.push(`+ provenance ${p.actor} ${p.action}`);
  }

  lines.push("");
  lines.push(diff.summary);
  return lines.join("\n");
}
