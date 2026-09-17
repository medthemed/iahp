#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeChecksum } from "./checksum.js";
import {
  CONFIG_FILENAME,
  ConfigError,
  checkRequiredFields,
  loadConfig,
  loadConfigFromDir,
  type IahpConfig,
} from "./config.js";
import { diffStates, extractState, formatDiff } from "./diff.js";
import { createEnvelope, summarizeEnvelope, verifyState } from "./envelope.js";
import { exampleStateJson } from "./example.js";
import { scaffoldConfigJson, scaffoldStateJson } from "./init.js";
import { formatIssues, validateState } from "./validate.js";

const USAGE = `iahp — Inter-Agent Handshake Protocol

Usage:
  iahp validate <state.json>   Validate structure (and checksum if present)
  iahp checksum <state.json>   Print SHA-256 checksum of canonical state
  iahp example                 Print an example sealed state object
  iahp seal <state.json>       Print state with a fresh checksum
  iahp summarize <state.json>  One-line log summary
  iahp diff <a.json> <b.json>  Semantic differences between two states [--json]
  iahp init [state.json]       Scaffold a sealed State Object [--goal TEXT]
                               [--from AGENT] [--to AGENT] [--config]
                               [--write-config]

Options:
  --config <path>              Use a specific iahp.config.json
  -h, --help                   Show this help

Config (optional iahp.config.json in the working directory):
  {
    "schema_version": "1.0.0",
    "required_fields": ["goal", "constraints", "verified_facts"]
  }
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

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = "";

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (a === "--json" || a === "--write-config") {
      flags[a.slice(2)] = true;
    } else if (a === "--goal" || a === "--from" || a === "--to" || a === "--config") {
      const v = argv[++i];
      if (v === undefined) fail(`error: ${a} requires a value`);
      flags[a.slice(2)] = v;
    } else if (!command) {
      command = a;
    } else {
      positionals.push(a);
    }
  }
  return { command, positionals, flags };
}

function resolveConfig(explicitPath: string | undefined): IahpConfig {
  try {
    if (typeof explicitPath === "string") {
      return loadConfig(resolve(process.cwd(), explicitPath));
    }
    return loadConfigFromDir(process.cwd());
  } catch (err) {
    if (err instanceof ConfigError) fail(`error: ${err.message}`);
    throw err;
  }
}

function main(argv: string[]): void {
  const { command, positionals, flags } = parseArgs(argv);

  if (!command || command === "help") {
    process.stdout.write(USAGE);
    return;
  }

  switch (command) {
    case "validate": {
      const file = positionals[0];
      if (!file) fail("error: validate requires a file path");
      const data = readJson(file);
      const result = validateState(data);
      if (!result.ok) {
        process.stderr.write(`INVALID\n${formatIssues(result.issues)}\n`);
        process.exit(1);
      }
      const config = resolveConfig(
        typeof flags.config === "string" ? flags.config : undefined,
      );
      const requiredIssues = checkRequiredFields(
        data as Record<string, unknown>,
        config,
      );
      if (requiredIssues.length > 0) {
        process.stderr.write(
          `INVALID (config)\n${formatIssues(requiredIssues)}\n`,
        );
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
      const file = positionals[0];
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
      const file = positionals[0];
      if (!file) fail("error: seal requires a file path");
      const data = readJson(file) as Record<string, unknown>;
      const { checksum: _drop, ...payload } = data;
      const sealed = createEnvelope(payload as never);
      process.stdout.write(`${JSON.stringify(sealed.state, null, 2)}\n`);
      return;
    }
    case "summarize": {
      const file = positionals[0];
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
    case "diff": {
      const args = positionals.filter((a) => a !== "--json");
      const asJson = positionals.includes("--json") || flags.json === true;
      const [fileA, fileB] = args;
      if (!fileA || !fileB) {
        fail("error: diff requires two file paths");
      }
      const rawA = readJson(fileA);
      const rawB = readJson(fileB);
      const stateA = extractState(rawA);
      const stateB = extractState(rawB);
      if (!stateA) fail(`error: ${fileA} does not look like a State Object or Envelope`);
      if (!stateB) fail(`error: ${fileB} does not look like a State Object or Envelope`);
      const diff = diffStates(stateA, stateB);
      if (asJson) {
        process.stdout.write(`${JSON.stringify(diff, null, 2)}\n`);
      } else {
        process.stdout.write(`${formatDiff(diff)}\n`);
      }
      return;
    }
    case "init": {
      const outFile = positionals[0] ?? "state.json";
      const config = resolveConfig(
        typeof flags.config === "string" ? flags.config : undefined,
      );
      const options = {
        ...(typeof flags.goal === "string" ? { goal: flags.goal } : {}),
        ...(typeof flags.from === "string" ? { handoff_from: flags.from } : {}),
        ...(typeof flags.to === "string" ? { handoff_to: flags.to } : {}),
        schema_version: config.schema_version,
      };

      if (flags["write-config"] === true) {
        const configPath = resolve(process.cwd(), CONFIG_FILENAME);
        writeFileSync(configPath, `${scaffoldConfigJson(config)}\n`, "utf8");
        process.stderr.write(`wrote ${CONFIG_FILENAME}\n`);
      }

      const stateJson = scaffoldStateJson(options);
      if (outFile === "-") {
        process.stdout.write(`${stateJson}\n`);
        return;
      }
      const abs = resolve(process.cwd(), outFile);
      writeFileSync(abs, `${stateJson}\n`, "utf8");
      process.stderr.write(`wrote ${outFile}\n`);
      return;
    }
    default:
      fail(`error: unknown command "${command}"\n\n${USAGE}`);
  }
}

main(process.argv.slice(2));
