# Architecture

## Why IAHP exists

Multi-agent systems pass context as chat text. That loses structure:
constraints get paraphrased, verified facts get re-checked, artifacts
disappear, and nobody can prove the payload was not edited mid-flight.

IAHP defines a **State Object** — a typed, checksummed JSON document that
travels between agents — and an **Envelope** for transport/logging.

## Module map

```
src/
  schema.ts     Types + SUPPORTED_SCHEMA_VERSIONS
  canonical.ts  Stable key-order JSON (checksum input)
  checksum.ts   SHA-256 over canonical JSON; seal/verify
  validate.ts   Hand-rolled structural validators with path-qualified errors
  envelope.ts   create / verify / summarize A2A handoff packages
  example.ts    In-memory example state builder
  cli.ts        `iahp` bin (validate, checksum, example, seal, summarize)
  index.ts      Public library surface
```

## Checksum pipeline

1. Take the State Object and **drop** the `checksum` property.
2. Canonicalize: recursively sort object keys, omit `undefined`, reject
   non-finite numbers, keep array order.
3. Serialize with `JSON.stringify` (no whitespace).
4. SHA-256 the UTF-8 bytes → 64-char lowercase hex.

Key insertion order, pretty-printing, and key renames that only affect
ordering cannot change the digest. Any semantic mutation does.

## Validation

Validators are hand-rolled (no runtime schema dependency). Each issue
carries a JSON-path-like location (`verified_facts[0].confidence`) so CLI
and library users can jump straight to the problem.

Schema validation and checksum verification are **separate**:

- `validateState` — structure only
- `verifyChecksum` / `verifyState` — integrity
- `verifyEnvelope` — both, with distinct error channels

## Envelope

```json
{
  "envelope_version": "1",
  "created_at": "2026-01-15T18:06:00.000Z",
  "state": { "...StateObject..." },
  "note": "optional operator note"
}
```

`createEnvelope` seals the payload (recomputes checksum). `summarizeEnvelope`
emits a single log line for handoff audit trails.

## Versioning

`schema_version` is explicit. Unsupported versions fail validation with a
clear message rather than silently coercing. Bump `SUPPORTED_SCHEMA_VERSIONS`
only after adding migration or dual-read support.

## Non-goals (MVP)

- No network transport (HTTP/A2A wire protocol)
- No encryption or signatures (checksum is integrity, not authenticity)
- No schema migration tooling yet
