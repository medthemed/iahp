#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeChecksum } from "./checksum.js";
import { createEnvelope, summarizeEnvelope, verifyState } from "./envelope.js";
import { exampleStateJson } from "./example.js";
import { formatIssues, validateState } from "./validate.js";

const USAGE = `iahp — Inter-Agent Handshake Protocol

Usage:
  iahp validate <state.json>   Validate structure (and checksum if present)
  iahp checksum <state.json>   Print SHA-256 checksum of canonical state
  iahp example                 Print an example sealed state object
  iahp seal <state.json>       Print state with a fresh checksum
  iahp summarize <state.json>  One-line log summary

Options:
  -h, --help                   Show this help
`;

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readJson(path: string): unknown {
  const abs = resolve(process.cwd(), path);
  let raw: string;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`error: cannot read file ${path}: ${msg}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`error: ${path} is not valid JSON: ${msg}`);
  }
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(USAGE);
    return;
  }

  switch (cmd) {
    case "validate": {
      const file = rest[0];
      if (!file) fail("error: validate requires a file path");
      const data = readJson(file);
      const result = validateState(data);
      if (!result.ok) {
        process.stderr.write(`INVALID\n${formatIssues(result.issues)}\n`);
        process.exit(1);
      }
      const integrity = verifyState(data);
      if (!integrity.ok) {
        process.stderr.write(`SCHEMA OK — INTEGRITY FAILED\n${integrity.message}\n`);
        process.exit(2);
      }
      process.stdout.write("OK\n");
      return;
    }
    case "checksum": {
      const file = rest[0];
      if (!file) fail("error: checksum requires a file path");
      const data = readJson(file);
      const result = validateState(data);
      if (!result.ok) {
        process.stderr.write(
          `warning: state failed schema validation; computing checksum anyway\n${formatIssues(result.issues)}\n`,
        );
      }
      process.stdout.write(`${computeChecksum(data as never)}\n`);
      return;
    }
    case "example": {
      process.stdout.write(`${exampleStateJson()}\n`);
      return;
    }
    case "seal": {
      const file = rest[0];
      if (!file) fail("error: seal requires a file path");
      const data = readJson(file) as Record<string, unknown>;
      const { checksum: _drop, ...payload } = data;
      const sealed = createEnvelope(payload as never);
      process.stdout.write(`${JSON.stringify(sealed.state, null, 2)}\n`);
      return;
    }
    case "summarize": {
      const file = rest[0];
      if (!file) fail("error: summarize requires a file path");
      const data = readJson(file) as Record<string, unknown>;
      // Accept either a bare state or an envelope.
      const stateish = (data.state as unknown) ?? data;
      const env = createEnvelope(stateish as never, {
        created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      });
      process.stdout.write(`${summarizeEnvelope(env)}\n`);
      return;
    }
    default:
      fail(`error: unknown command "${cmd}"\n\n${USAGE}`);
  }
}

main(process.argv.slice(2));
