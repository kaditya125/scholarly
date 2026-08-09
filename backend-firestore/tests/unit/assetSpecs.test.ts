import { RICH_ASSET_SPECS, zodValidator, AssetSpec } from '../../src/services/assetSpecs';

const byType = (t: string) => RICH_ASSET_SPECS.find(s => s.type === t)!;

describe('RICH_ASSET_SPECS', () => {
  it('defines the six rich asset types with prompts', () => {
    const types = RICH_ASSET_SPECS.map(s => s.type).sort();
    expect(types).toEqual(
      ['COMMON_MISTAKES', 'EXAM_TIPS', 'HIGH_YIELD_FACTS', 'KEY_FORMULAE', 'LEARNING_OBJECTIVES', 'REVISION_NOTES', 'DOCUMENTARY_ARTICLE'].sort()
    );
    for (const s of RICH_ASSET_SPECS) {
      expect(typeof s.prompt('sample text')).toBe('string');
      expect(s.prompt('SAMPLE_TEXT')).toContain('SAMPLE_TEXT');
    }
  });

  it('json specs carry a schema + contentKey; prose specs do not', () => {
    for (const s of RICH_ASSET_SPECS as AssetSpec[]) {
      if (s.kind === 'json') {
        expect((s as any).contentKey).toBeTruthy();
        expect((s as any).schema).toBeDefined();
      } else {
        expect(s.kind).toBe('prose');
      }
    }
  });
});

describe('zodValidator + schemas', () => {
  it('accepts a valid string-list asset (LEARNING_OBJECTIVES)', () => {
    const spec = byType('LEARNING_OBJECTIVES') as any;
    const v = zodValidator(spec.schema);
    expect(v(['understand forces', 'apply Newton laws']).ok).toBe(true);
  });

  it('accepts an empty array (e.g. no formulae) — emptiness handled by the generator, not validation', () => {
    const spec = byType('KEY_FORMULAE') as any;
    const v = zodValidator(spec.schema);
    expect(v([]).ok).toBe(true);
  });

  it('accepts valid formulae objects and rejects malformed ones', () => {
    const spec = byType('KEY_FORMULAE') as any;
    const v = zodValidator(spec.schema);
    expect(v([{ formula: 'F=ma', meaning: 'force' }]).ok).toBe(true);
    expect(v([{ formula: 'F=ma' }]).ok).toBe(false); // missing meaning
    expect(v('not an array').ok).toBe(false);
  });

  it('rejects a string list containing empty strings', () => {
    const spec = byType('HIGH_YIELD_FACTS') as any;
    const v = zodValidator(spec.schema);
    expect(v(['ok', '']).ok).toBe(false);
  });
});
