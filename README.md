# iahp — Inter-Agent Handshake Protocol

[![CI](https://github.com/medthemed/iahp/actions/workflows/ci.yml/badge.svg)](https://github.com/medthemed/iahp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/badge/version-0.1.1-blue.svg)](https://github.com/medthemed/iahp/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Portable, checksummed **State Objects** for agent-to-agent hand-offs.

Agent swarms lose context when they pass raw text. IAHP replaces that with a
typed JSON state: goal, constraints, verified facts, artifacts, provenance,
and a SHA-256 checksum over canonical JSON so the receiver can prove nothing
was edited in transit.

## Architecture

```mermaid
flowchart LR
    A[Agent A] --> B[State Object]
    B --> C[Canonical JSON]
    C --> D[Checksum]
    D --> E[Handoff Envelope]
    E --> F[Validate]
    F --> G[Agent B]
    F --> H[Reject]
```

## Handoff sequence

A typical research → synthesis hand-off, and which CLI step runs where:

```mermaid
sequenceDiagram
    participant A as Agent A (researcher)
    participant CLI as iahp CLI
    participant Bus as Handoff bus
    participant B as Agent B (synthesis)

    A->>A: Collect facts, artifacts, constraints
    A->>CLI: iahp seal draft.json
    CLI-->>A: sealed state.json (checksum attached)
    A->>CLI: iahp validate state.json
    CLI-->>A: OK (exit 0)
    A->>Bus: publish envelope { state, created_at, note }
    Bus->>B: deliver envelope
    B->>CLI: iahp validate envelope.json
    alt checksum intact
        CLI-->>B: OK
        B->>CLI: iahp summarize envelope.json
        CLI-->>B: one-line log for the operator
        B->>B: resume work from goal + facts
    else tampered or schema-broken
        CLI-->>B: INVALID / exit 1 or 2
        B->>Bus: reject hand-off, request re-seal
    end
    Note over A,B: Later, either side can compare revisions:<br/>iahp diff before.json after.json
```

## Install

```bash
npm install
npm run build
```

Local CLI after build:

```bash
node dist/cli.js example
```

Or via `npx tsx` during development:

```bash
npm run cli -- example
```

## CLI

```text
iahp validate <state.json>        # structure + checksum
iahp checksum <state.json>        # print SHA-256 of canonical state
iahp example                      # emit a sealed example state
iahp seal <state.json>            # recompute and attach checksum
iahp summarize <state.json>       # one-line handoff log summary
iahp diff <a.json> <b.json>       # semantic differences [--json]
```

Exit codes for `validate`: `0` ok, `1` schema invalid, `2` schema ok but
checksum mismatch.

### Diffing two states

```bash
# human-readable change list
node dist/cli.js diff before.json after.json

# machine-readable
node dist/cli.js diff before.json after.json --json
```

Diff accepts either bare State Objects or envelopes. Checksums are ignored
on purpose so only semantic changes surface.

## Library

```ts
import {
  buildExampleState,
  createEnvelope,
  verifyEnvelope,
  validateState,
  diffStates,
} from "iahp";

const state = buildExampleState({ goal: "Draft the RFC" });
const env = createEnvelope(state, { note: "research → design" });
const result = verifyEnvelope(env);
if (!result.ok) throw new Error(result.message);

const later = buildExampleState({ goal: "Ship the RFC" });
const diff = diffStates(state, later);
console.log(diff.summary); // "goal changed"
```

## State Object shape

```json
{
  "schema_version": "1.0.0",
  "id": "st_example_001",
  "goal": "…",
  "constraints": ["…"],
  "verified_facts": [
    { "claim": "…", "method": "…", "verified_at": "…", "confidence": 0.9 }
  ],
  "artifacts": [
    { "id": "…", "name": "…", "media_type": "…", "uri": "…" }
  ],
  "provenance": [
    { "actor": "…", "at": "…", "action": "…", "ref": "…" }
  ],
  "handoff_from": "agent-a",
  "handoff_to": "agent-b",
  "checksum": "<sha256 hex of canonical payload>"
}
```

## Checksum rules

Checksum is SHA-256 of the state **without** the `checksum` field, after
canonicalization (object keys sorted recursively, no whitespace). Key order
and pretty-printing never change the digest; semantic edits always do.

## Development

```bash
npm test
npm run typecheck
npm run build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module layout and design
decisions. Releases are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

MIT
