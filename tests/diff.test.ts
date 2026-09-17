import { describe, expect, it } from "vitest";
import { diffStates, extractState, formatDiff } from "../src/diff.js";
import { buildExampleState } from "../src/example.js";
import { createEnvelope } from "../src/envelope.js";
import { sealChecksum } from "../src/checksum.js";
import type { StateObject, StateChecksumPayload } from "../src/schema.js";
import { clone } from "./helpers.js";

function mutate(fn: (s: StateChecksumPayload) => void): StateObject {
  const base = clone(buildExampleState()) as StateObject;
  const { checksum: _drop, ...payload } = base;
  fn(payload);
  return sealChecksum(payload);
}

describe("diffStates", () => {
  it("reports equal for identical states", () => {
    const a = buildExampleState();
    const b = clone(a);
    const diff = diffStates(a, b);
    expect(diff.equal).toBe(true);
    expect(diff.summary).toBe("no semantic differences");
  });

  it("detects a goal change", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      s.goal = "Draft the Q4 pricing RFC";
    });
    const diff = diffStates(a, b);
    expect(diff.equal).toBe(false);
    expect(diff.goal?.kind).toBe("changed");
    expect(diff.goal?.from).toBe(a.goal);
    expect(diff.goal?.to).toBe("Draft the Q4 pricing RFC");
    expect(diff.summary).toContain("goal changed");
  });

  it("detects added and removed constraints", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      s.constraints = [
        "Do not include PII in artifacts",
        "No paid data sources",
      ];
    });
    const diff = diffStates(a, b);
    expect(diff.constraints.added).toEqual(["No paid data sources"]);
    expect(diff.constraints.removed).toContain("Prefer sources newer than 2025-01-01");
    expect(diff.constraints.removed).toContain("Stay within the existing pricing model");
    expect(diff.summary).toMatch(/constraints \+1\/-2/);
  });

  it("detects new, removed, and changed facts by claim", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      // change confidence on the first fact
      s.verified_facts[0]!.confidence = 0.7;
      // drop the second fact
      s.verified_facts = [s.verified_facts[0]!, {
        claim: "Support tickets peaked in week 32",
        method: "zendesk export",
        verified_at: "2025-10-04T12:00:00.000Z",
        confidence: 0.88,
      }];
    });
    const diff = diffStates(a, b);
    expect(diff.verified_facts.changed).toHaveLength(1);
    expect(diff.verified_facts.changed[0]?.claim).toContain("NPS dropped");
    expect(diff.verified_facts.changed[0]?.to.confidence).toBe(0.7);
    expect(diff.verified_facts.removed).toHaveLength(1);
    expect(diff.verified_facts.added).toHaveLength(1);
    expect(diff.verified_facts.added[0]?.claim).toContain("Support tickets");
  });

  it("detects artifact add by id", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      s.artifacts = [
        ...s.artifacts,
        {
          id: "art_summary_md",
          name: "summary.md",
          media_type: "text/markdown",
          uri: "s3://feedback/summary.md",
        },
      ];
    });
    const diff = diffStates(a, b);
    expect(diff.artifacts.added.map((x) => x.id)).toEqual(["art_summary_md"]);
    expect(diff.artifacts.removed).toHaveLength(0);
  });

  it("reports provenance tail only when history is appended", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      s.provenance = [
        ...s.provenance,
        {
          actor: "agent-synthesis",
          at: "2025-10-04T10:00:00.000Z",
          action: "accepted handoff",
        },
      ];
    });
    const diff = diffStates(a, b);
    expect(diff.provenance_added).toHaveLength(1);
    expect(diff.provenance_added[0]?.actor).toBe("agent-synthesis");
    expect(diff.summary).toContain("provenance +1");
  });

  it("ignores checksum-only differences", () => {
    const a = buildExampleState();
    const b = clone(a);
    b.checksum = "0".repeat(64);
    expect(diffStates(a, b).equal).toBe(true);
  });
});

describe("extractState", () => {
  it("unwraps envelopes", () => {
    const env = createEnvelope(buildExampleState());
    const state = extractState(env);
    expect(state?.id).toBe("st_example_001");
  });

  it("accepts bare state objects", () => {
    const state = extractState(buildExampleState());
    expect(state?.goal).toBeTruthy();
  });

  it("rejects unrelated objects", () => {
    expect(extractState({ hello: "world" })).toBeNull();
    expect(extractState(null)).toBeNull();
  });
});

describe("formatDiff", () => {
  it("prints a compact summary line", () => {
    const a = buildExampleState();
    const b = mutate((s) => {
      s.goal = "Ship the RFC";
    });
    const text = formatDiff(diffStates(a, b));
    expect(text).toContain("~ goal");
    expect(text).toContain("goal changed");
  });

  it("prints no-op for equal states", () => {
    const a = buildExampleState();
    expect(formatDiff(diffStates(a, clone(a)))).toBe("no semantic differences");
  });
});
