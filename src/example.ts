import { SCHEMA_VERSION } from "./schema.js";
import type { StateObject, StateChecksumPayload } from "./schema.js";
import { sealChecksum } from "./checksum.js";

/**
 * Build a ready-to-use example State Object (checksum sealed).
 */
export function buildExampleState(
  overrides: Partial<StateChecksumPayload> = {},
): StateObject {
  const base: StateChecksumPayload = {
    schema_version: SCHEMA_VERSION,
    id: "st_example_001",
    goal: "Summarize Q3 customer feedback themes and propose three product fixes.",
    constraints: [
      "Do not include PII in artifacts",
      "Prefer sources newer than 2025-01-01",
      "Stay within the existing pricing model",
    ],
    verified_facts: [
      {
        claim: "NPS dropped 6 points between Q2 and Q3",
        method: "warehouse query nps_quarterly",
        verified_at: "2025-10-02T14:11:00.000Z",
        confidence: 0.95,
      },
      {
        claim: "Top complaint category is onboarding friction",
        method: "manual sample of 200 tickets",
        verified_at: "2025-10-03T09:40:00.000Z",
        confidence: 0.8,
      },
    ],
    artifacts: [
      {
        id: "art_feedback_csv",
        name: "q3-feedback-export.csv",
        media_type: "text/csv",
        uri: "s3://feedback/q3-feedback-export.csv",
        content_hash: "sha256:placeholder",
      },
    ],
    provenance: [
      {
        actor: "agent-researcher",
        at: "2025-10-02T14:11:00.000Z",
        action: "collected NPS trend",
        ref: "warehouse://nps_quarterly",
      },
      {
        actor: "agent-researcher",
        at: "2025-10-03T09:45:00.000Z",
        action: "handed off to synthesis agent",
      },
    ],
    handoff_from: "agent-researcher",
    handoff_to: "agent-synthesis",
    ...overrides,
  };
  return sealChecksum(base);
}

/** Pretty-printed JSON of the example state. */
export function exampleStateJson(): string {
  return JSON.stringify(buildExampleState(), null, 2);
}
