import { FiguresSchema, FigureSchema } from '../../src/utils/figureSchema';

describe('FigureSchema', () => {
  it('accepts a full figure object', () => {
    const r = FigureSchema.safeParse({ page: 5, caption: 'A diagram of the human heart', labels: ['aorta', 'ventricle'], diagramType: 'diagram' });
    expect(r.success).toBe(true);
  });

  it('coerces a string page number and defaults optional fields', () => {
    const r = FigureSchema.safeParse({ page: '3', caption: 'Force diagram' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(3);
      expect(r.data.labels).toEqual([]);
      expect(r.data.diagramType).toBe('other');
    }
  });

  it('rejects a figure with an empty caption', () => {
    expect(FigureSchema.safeParse({ caption: '' }).success).toBe(false);
  });

  it('defaults page to 0 when missing', () => {
    const r = FigureSchema.safeParse({ caption: 'Map of India' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(0);
  });
});

describe('FiguresSchema', () => {
  it('accepts an empty array (no figures)', () => {
    expect(FiguresSchema.safeParse([]).success).toBe(true);
  });

  it('accepts an array of valid figures', () => {
    const r = FiguresSchema.safeParse([
      { page: 1, caption: 'Cell structure', diagramType: 'diagram' },
      { caption: 'Photosynthesis flowchart', labels: ['sunlight', 'CO2'] },
    ]);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toHaveLength(2);
  });

  it('rejects a non-array', () => {
    expect(FiguresSchema.safeParse({ caption: 'x' }).success).toBe(false);
  });
});
