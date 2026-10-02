/**
 * A Laws of Motion formula chart built by the real Phase 5 composer from verification results
 * shaped like the live run's: formulae across five chapter sections (one matched by its equation
 * number), two statements, and a glossary that includes two units naming the same thing
 * (a and g are both m s⁻²) and three quantities measured in newtons.
 */
import { composeFormulaChart } from '../../../../src/agents/tools/adapters/formulaChart.adapter';

const f = (formula: string, section: string, page: number, meaning?: string, equation?: string) => ({
  formula,
  ...(meaning ? { meaning } : {}),
  sources: ['study_notes'],
  status: 'verified',
  match: equation ? 'equation' : 'exact',
  ...(equation ? { equation } : {}),
  section,
  page,
});

export const CHART = composeFormulaChart({
  chapter: {
    resolved: true,
    notebookId: 'ncert-c11-physics',
    sourceId: 's4',
    bookTitle: 'NCERT Class 11 Physics',
    chapterName: 'Laws of Motion',
    chapterTitle: 'NCERT Class 11 Physics (Part 1) - Chapter 4',
    headings: ['4.5 Newton’s second law of motion', '4.10 Circular motion'],
  },
  verification: {
    verified: [
      f('p = mv', '4.5 Newton’s second law of motion', 5, 'Momentum equals mass times velocity'),
      f('F = ma', '4.5 Newton’s second law of motion', 7, 'Force equals mass times acceleration'),
      f('F = kma', '4.5 Newton’s second law of motion', 6, 'Force is proportional to mass times acceleration'),
      f('F_AB = -F_BA', '4.6 Newton’s third law of motion', 8, 'Force on A by B is equal and opposite to force on B by A'),
      f('p_A′ + p_B′ = p_A + p_B', '4.7 Conservation of momentum', 9, 'Total final momentum equals total initial momentum'),
      f('F = -kx', '4.9 Common forces in mechanics', 12, 'Spring force is proportional to extension'),
      f('f_k = μ_k N', '4.9 Common forces in mechanics', 13, 'Kinetic friction equals coefficient times normal reaction'),
      f('f_c = mv^2/R', '4.10 Circular motion', 15, 'Centripetal force equals mass times velocity squared over radius', '4.16'),
      f('v_o = (Rg tanθ)^1/2', '4.10 Circular motion', 16, 'Optimum speed on a banked road'),
      f('f_s ≤ μ_s N', '4.9 Common forces in mechanics', 12, 'Static friction is at most the limiting value'),
    ],
    rejected: [],
    definitions: [
      { term: 'Newton’s first law of motion', definition: 'Every body continues to be in its state of rest or of uniform motion…', page: 3 },
      { term: 'inertia', definition: 'Inertia means resistance to change.', page: 3 },
    ],
    glossary: [
      { symbol: 'F', name: 'Force', unit: 'newton (N)' },
      { symbol: 'm', name: 'Mass', unit: 'kilogram (kg)' },
      { symbol: 'a', name: 'Acceleration', unit: 'm s⁻²' },
      { symbol: 'g', name: 'Acceleration due to gravity', unit: 'm s⁻² (about 9.8 m s⁻²)' },
      { symbol: 'p', name: 'Linear momentum', unit: 'kg m s⁻¹' },
      { symbol: 'N', name: 'Normal reaction', unit: 'newton (N)' },
      { symbol: 'μ_s, μ_k', name: 'Coefficients of static and kinetic friction', unit: 'no unit' },
    ],
  },
  notes: { assets: [] },
});

export const CHART_SOURCE = { artifactId: 'chart-1', title: CHART.title, spec: CHART };
