# iahp — Inter-Agent Handshake Protocol

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
iahp validate <state.json>   # structure + checksum
iahp checksum <state.json>   # print SHA-256 of canonical state
iahp example                 # emit a sealed example state
iahp seal <state.json>       # recompute and attach checksum
iahp summarize <state.json>  # one-line handoff log summary
```

Exit codes for `validate`: `0` ok, `1` schema invalid, `2` schema ok but
checksum mismatch.

## Library

```ts
import {
  buildExampleState,
  createEnvelope,
  verifyEnvelope,
  validateState,
} from "iahp";

const state = buildExampleState({ goal: "Draft the RFC" });
const env = createEnvelope(state, { note: "research → design" });
const result = verifyEnvelope(env);
if (!result.ok) throw new Error(result.message);
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
decisions.

## License

MIT
