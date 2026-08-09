import { z } from 'zod';

/**
 * Zod schema for the figures/diagrams captioned from a chapter PDF (Part 10). Kept in a pure
 * module (zod-only, no I/O) so it can be reused by the captioning service and unit-tested without
 * loading Firebase/AI providers.
 */
export const FigureSchema = z.object({
  page: z.coerce.number().default(0),
  caption: z.string().min(1),
  labels: z.array(z.string()).default([]),
  diagramType: z.string().default('other'),
});

export const FiguresSchema = z.array(FigureSchema);

export type Figure = z.infer<typeof FigureSchema>;
