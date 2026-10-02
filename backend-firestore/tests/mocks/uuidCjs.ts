/**
 * Test-only CommonJS stand-in for `uuid` (v14 ships ESM only, which ts-jest's CommonJS runtime
 * cannot load). Mapped in jest.config.js. Real RFC 4122 algorithms, so ids derived in tests match
 * the ones production derives — v5 in particular, which Qdrant point ids depend on.
 */
import * as crypto from 'crypto';

const hexToBytes = (uuid: string) => Buffer.from(uuid.replace(/-/g, ''), 'hex');
const format = (b: Buffer) => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

export function v4(): string {
  return crypto.randomUUID();
}

export function v5(name: string, namespace: string): string {
  const hash = crypto.createHash('sha1').update(Buffer.concat([hexToBytes(namespace), Buffer.from(name, 'utf8')])).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(b);
}
v5.URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
v5.DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function validate(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
