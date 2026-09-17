# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
