/**
 * CommonJS stand-in for `uuid`, whose v12+ builds are ESM-only and cannot be loaded by Jest's
 * CommonJS runtime ("Unexpected token 'export'"). Implements exactly the API `src/` uses — v4 and
 * v5 (with the RFC 4122 namespaces) — and produces the same ids as the real package, which matters
 * because Qdrant point ids are derived from uuidv5.
 *
 * jest.config.js maps `^uuid$` here, so every suite gets this automatically — no per-suite wiring.
 * A suite that declares its own `jest.mock('uuid', ...)` overrides the mapper and opts out, so its
 * factory must supply everything the import graph touches (v5 and v5.URL included, not just v4):
 *   jest.mock('uuid', () => ({ ...jest.requireActual('../helpers/uuidCjs'), v4: () => 'fixed-id' }));
 */
import { createHash, randomUUID } from 'crypto';

function parse(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new TypeError(`Invalid UUID: ${uuid}`);
  return Buffer.from(hex, 'hex');
}

function stringify(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function v4(): string {
  return randomUUID();
}

/** RFC 4122 §4.3 name-based UUID using SHA-1. */
export function v5(name: string | Uint8Array, namespace: string | Uint8Array): string {
  const ns = typeof namespace === 'string' ? parse(namespace) : Buffer.from(namespace);
  const nameBytes = typeof name === 'string' ? Buffer.from(name, 'utf8') : Buffer.from(name);
  const bytes = Buffer.from(createHash('sha1').update(ns).update(nameBytes).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return stringify(bytes);
}
v5.DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
v5.URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
