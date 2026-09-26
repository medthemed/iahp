# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-26

### Added

- `iahp validate-batch <dir>` — validate every `*.json` State Object in a directory
- Per-file status: ok / schema-invalid / config-invalid / integrity-failed / unreadable
- Summary counts printed after the per-file report
- Library exports: `validateBatch`, `classifyStateData`, `listStateFiles`, `formatBatchReport`

### Changed

- README documents batch validation and the library entry points

## [0.3.0] - 2026-09-23

### Added

- Optional `iahp.config.json` for default `schema_version` and `required_fields`
- `iahp validate` enforces config-required fields
- `iahp init` scaffolds a sealed State Object (`--goal`, `--from`, `--to`, `--write-config`)
- Library exports: `parseConfig`, `loadConfig`, `loadConfigFromDir`, `checkRequiredFields`, `ConfigError`, `scaffoldState`, `scaffoldConfig`

### Changed

- README documents config format and the `init` command

## [0.2.0] - 2026-09-20

### Added

- Typed `ValidationError` (path-qualified `issues`) and `ChecksumError` (`expected` / `actual` digests)
- `isValidationError` / `isChecksumError` narrow helpers
- Throwing accept path: `assertValidState`, `assertSealedState`, `assertValidEnvelope`
- Frozen public export catalog: `PUBLIC_API`, `PUBLIC_API_NAMES`
- Integration suite covering the full seal → validate → accept path

### Changed

- README library section documents typed errors and the frozen export surface

## [0.1.1] - 2026-09-17

### Added

- `iahp diff <a.json> <b.json>` — semantic differences between two State Objects
  (goal, constraints, verified facts, artifacts, handoff fields, provenance tail)
- `--json` output for `diff`
- Library exports: `diffStates`, `extractState`, `formatDiff`
- README handoff sequence diagram, CI badge, and diff usage

### Changed

- README CLI section documents the new `diff` command

## [0.1.0] - 2026-01-15

### Added

- Typed State Object schema (`schema_version`, goal, constraints, verified facts, artifacts, provenance, handoff fields, checksum)
- Canonical JSON serializer with stable key ordering
- SHA-256 checksum helpers (`computeChecksum`, `sealChecksum`, `verifyChecksum`)
- Structural validators with path-qualified error messages
- Envelope create / integrity verify / log summarize
- `iahp` CLI: `validate`, `checksum`, `example`, `seal`, `summarize`
- Example state under `examples/`
- Vitest suite covering validation, checksum stability, and round-trips
