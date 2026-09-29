import { v4, v5, validate, version } from 'uuid';

// `uuid` resolves to tests/shims/uuid.ts under Jest. Qdrant point ids are uuid v5, so the shim
// must match the real package byte for byte.
describe('uuid test shim', () => {
  it('computes RFC 4122 v5 ids exactly', () => {
    expect(v5('www.example.com', v5.DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(v5('http://example.com/hello', v5.URL)).toBe('3bbcee75-cecc-5b56-8031-b6641c1ed1f1');
  });

  it('produces valid v4 and v5 ids', () => {
    const a = v4();
    expect(validate(a)).toBe(true);
    expect(version(a)).toBe(4);
    expect(v4()).not.toBe(a);
    expect(version(v5('x', v5.DNS))).toBe(5);
  });
});
