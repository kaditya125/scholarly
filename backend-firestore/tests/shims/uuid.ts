/**
 * Jest-only stand-in for the `uuid` package (mapped in jest.config.js).
 *
 * uuid v14 ships ESM only, which Jest's CommonJS runtime cannot load, so every suite that
 * (transitively) imported it failed with "Unexpected token 'export'". The app itself still uses
 * the real package. v4 comes from Node's crypto; v5 is the RFC 4122 name-based UUID computed
 * exactly as uuid does it, because Qdrant point ids (services/rag/qdrantFilter.ts) depend on it.
 */
import { createHash, randomUUID } from 'crypto';

export const NIL = '00000000-0000-0000-0000-000000000000';

const HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validate(id: unknown): boolean {
  return typeof id === 'string' && HEX.test(id);
}

function parse(id: string): Buffer {
  if (!validate(id)) throw new TypeError('Invalid UUID');
  return Buffer.from(id.replace(/-/g, ''), 'hex');
}

function stringify(bytes: Buffer): string {
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function v4(): string {
  return randomUUID();
}

export function v5(name: string | Uint8Array, namespace: string | Uint8Array): string {
  const ns = typeof namespace === 'string' ? parse(namespace) : Buffer.from(namespace);
  const nm = typeof name === 'string' ? Buffer.from(name, 'utf8') : Buffer.from(name);
  const bytes = Buffer.from(createHash('sha1').update(Buffer.concat([ns, nm])).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  return stringify(bytes);
}
v5.DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
v5.URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export function version(id: string): number {
  return parseInt(parse(id).toString('hex')[12], 16);
}
