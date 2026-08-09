import { isReadyStatus, READY_STATUSES } from '../../src/types';
import { safeJsonParse, repairJsonString, extractJsonString } from '../../src/utils/safeJson';

describe('isReadyStatus', () => {
  it('treats READY and READY_DEGRADED as usable', () => {
    expect(isReadyStatus('READY')).toBe(true);
    expect(isReadyStatus('READY_DEGRADED')).toBe(true);
  });
  it('rejects non-ready statuses', () => {
    expect(isReadyStatus('FAILED')).toBe(false);
    expect(isReadyStatus('EMBEDDING')).toBe(false);
    expect(isReadyStatus(undefined)).toBe(false);
  });
  it('READY_STATUSES contains both ready states', () => {
    expect(READY_STATUSES).toEqual(expect.arrayContaining(['READY', 'READY_DEGRADED']));
  });
});

describe('safeJsonParse', () => {
  it('parses clean JSON without repair', () => {
    const r = safeJsonParse<{ a: number }>('{"a":1}');
    expect(r.ok).toBe(true);
    expect(r.repaired).toBe(false);
    expect(r.data).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    const r = safeJsonParse('```json\n{"a":1}\n```');
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ a: 1 });
  });

  it('repairs trailing commas', () => {
    const r = safeJsonParse('{"a":1,"b":[1,2,],}');
    expect(r.ok).toBe(true);
    expect(r.repaired).toBe(true);
    expect(r.data).toEqual({ a: 1, b: [1, 2] });
  });

  it('salvages a truncated array of objects', () => {
    const truncated = '[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"},{"front":"Q3"';
    const r = safeJsonParse<any[]>(truncated);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
    expect((r.data as any[]).length).toBeGreaterThanOrEqual(2);
  });

  it('closes an unterminated object/string', () => {
    const r = safeJsonParse('{"a":"unterminated');
    expect(r.ok).toBe(true);
    expect((r.data as any).a).toBe('unterminated');
  });

  it('returns ok=false for unrecoverable garbage', () => {
    const r = safeJsonParse('this is not json at all');
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
  });
});

describe('safeJson helpers', () => {
  it('extractJsonString isolates the JSON value', () => {
    expect(extractJsonString('prefix {"a":1} suffix')).toBe('{"a":1}');
  });
  it('repairJsonString balances brackets', () => {
    const repaired = repairJsonString('{"a":[1,2');
    expect(() => JSON.parse(repaired)).not.toThrow();
  });
});
