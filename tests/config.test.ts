import { describe, expect, it } from "vitest";
import {
  ConfigError,
  DEFAULT_CONFIG,
  REQUIRABLE_FIELDS,
  checkRequiredFields,
  configToJson,
  parseConfig,
} from "../src/config.js";
import {
  scaffoldConfig,
  scaffoldConfigJson,
  scaffoldState,
  scaffoldStateJson,
} from "../src/init.js";
import { assertSealedState } from "../src/envelope.js";
import { validateState } from "../src/validate.js";

describe("parseConfig", () => {
  it("returns defaults for an empty object", () => {
    const cfg = parseConfig({});
    expect(cfg.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(cfg.required_fields).toEqual([]);
  });

  it("accepts a supported schema_version and required fields", () => {
    const cfg = parseConfig({
      schema_version: "1.0.0",
      required_fields: ["goal", "constraints", "verified_facts"],
    });
    expect(cfg.schema_version).toBe("1.0.0");
    expect(cfg.required_fields).toEqual(["goal", "constraints", "verified_facts"]);
  });

  it("deduplicates required_fields", () => {
    const cfg = parseConfig({ required_fields: ["goal", "goal"] });
    expect(cfg.required_fields).toEqual(["goal"]);
  });

  it("rejects non-object config", () => {
    expect(() => parseConfig("nope")).toThrow(ConfigError);
    expect(() => parseConfig(null)).toThrow(ConfigError);
  });

  it("rejects unsupported schema_version", () => {
    expect(() => parseConfig({ schema_version: "9.9.9" })).toThrow(
      /unsupported schema_version/,
    );
  });

  it("rejects unknown required fields", () => {
    expect(() => parseConfig({ required_fields: ["checksum"] })).toThrow(
      /unknown field/,
    );
  });

  it("lists every requirable field", () => {
    expect(REQUIRABLE_FIELDS).toContain("goal");
    expect(REQUIRABLE_FIELDS).toContain("verified_facts");
    expect(REQUIRABLE_FIELDS).toContain("artifacts");
  });
});

describe("checkRequiredFields", () => {
  it("reports missing or empty required fields", () => {
    const cfg = parseConfig({ required_fields: ["goal", "constraints"] });
    const issues = checkRequiredFields({ goal: "", constraints: [] }, cfg);
    expect(issues.map((i) => i.path).sort()).toEqual(["constraints", "goal"]);
  });

  it("passes when required fields are populated", () => {
    const cfg = parseConfig({ required_fields: ["goal"] });
    const issues = checkRequiredFields({ goal: "ship it" }, cfg);
    expect(issues).toEqual([]);
  });
});

describe("scaffoldState", () => {
  it("produces a sealed, valid state", () => {
    const state = scaffoldState({ goal: "Write the migration plan" });
    const schema = validateState(state);
    expect(schema.ok).toBe(true);
    expect(() => assertSealedState(state)).not.toThrow();
    expect(state.goal).toBe("Write the migration plan");
    expect(state.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honors handoff fields and custom id", () => {
    const state = scaffoldState({
      id: "st_custom_1",
      handoff_from: "agent-a",
      handoff_to: "agent-b",
    });
    expect(state.id).toBe("st_custom_1");
    expect(state.handoff_from).toBe("agent-a");
    expect(state.handoff_to).toBe("agent-b");
  });

  it("records a scaffold provenance entry", () => {
    const state = scaffoldState({ handoff_from: "agent-a" });
    expect(state.provenance[0]?.action).toBe("scaffolded via iahp init");
    expect(state.provenance[0]?.actor).toBe("agent-a");
  });

  it("scaffoldStateJson is parseable and sealed", () => {
    const json = scaffoldStateJson({ goal: "x" });
    const parsed = JSON.parse(json);
    expect(() => assertSealedState(parsed)).not.toThrow();
  });
});

describe("scaffoldConfig", () => {
  it("emits default config JSON", () => {
    const json = scaffoldConfigJson();
    const parsed = JSON.parse(json);
    expect(parsed.schema_version).toBe("1.0.0");
    expect(parsed.required_fields).toEqual([]);
    expect(() => parseConfig(parsed)).not.toThrow();
  });

  it("honors overrides", () => {
    const cfg = scaffoldConfig({ required_fields: ["goal"] });
    expect(cfg.required_fields).toEqual(["goal"]);
    expect(configToJson(cfg)).toContain('"goal"');
  });
});
