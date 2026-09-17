import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";
import type { StateChecksumPayload, StateObject } from "./schema.js";

/**
 * SHA-256 hex digest of canonical JSON.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Compute the IAHP checksum for a state (or a checksum payload).
 * The `checksum` field itself is excluded from the digest.
 */
export function computeChecksum(
  state: StateObject | StateChecksumPayload,
): string {
  const { checksum: _ignored, ...rest } = state as StateObject & {
    checksum?: string;
  };
  return sha256Hex(canonicalJson(rest));
}

/**
 * Constant-time-ish compare of two hex checksums (length + content).
 */
export function checksumsEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True when the state's stored checksum matches a recomputed digest.
 */
export function verifyChecksum(state: StateObject): boolean {
  if (typeof state.checksum !== "string" || state.checksum.length === 0) {
    return false;
  }
  return checksumsEqual(state.checksum, computeChecksum(state));
}

/**
 * Return a copy of `state` with a freshly computed checksum.
 */
export function sealChecksum<T extends StateChecksumPayload>(
  state: T,
): T & { checksum: string } {
  return { ...state, checksum: computeChecksum(state) };
}
