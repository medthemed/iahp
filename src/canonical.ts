/**
 * Canonical JSON serialization.
 *
 * Checksums must be stable across key insertion order, engines, and
 * pretty-printing. We emit:
 *   - object keys sorted lexicographically (code-unit order)
 *   - no insignificant whitespace
 *   - standard JSON number/string escaping
 *   - undefined object properties omitted
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Cannot canonicalize non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === undefined) continue;
      out[key] = canonicalizeValue(v);
    }
    return out;
  }
  throw new TypeError(
    `Cannot canonicalize value of type ${Object.prototype.toString.call(value)}`,
  );
}

/**
 * Serialize `value` to canonical JSON string.
 * Objects have keys sorted; arrays preserve order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * Deep clone with sorted keys — useful for diffing or storage.
 */
export function canonicalize<T>(value: T): T {
  return canonicalizeValue(value) as T;
}
