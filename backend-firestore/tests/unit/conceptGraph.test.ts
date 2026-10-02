/**
 * Prerequisite graph: resolution must never substring-match, must stay inside the exams it
 * describes, and the root cause must come from the student's evidence — not from list position.
 */
import {
  ConceptGraphService,
  ROOT_CAUSE_ACCURACY_THRESHOLD,
  normalizeConceptText,
  parseSyllabusNodeId,
} from '../../src/services/pedagogy/conceptGraph.service';
import type { TopicBreakdown, WeakTopic } from '../../src/types/quizAttempt.types';

const g = new ConceptGraphService();

const row = (topic: string, correct: number, total: number, extra: Partial<TopicBreakdown> = {}): TopicBreakdown => ({
  topic, correct, incorrect: total - correct, unattempted: 0, total,
  accuracy: Math.round((correct / total) * 100), examId: 'JEE_MAIN', ...extra,
});

const resolvedId = (topic: string, examId = 'JEE_MAIN') => {
  const r = g.resolveConcept({ topic, examId });
  return r.status === 'RESOLVED' ? r.node.id : r.status;
};

describe('concept resolution', () => {
  it.each(['Compound Interest', 'Computer Awareness', 'Combustion', 'Complex Numbers'])(
    '"%s" never resolves to Center of Mass, even inside a supported exam',
    (topic) => {
      expect(resolvedId(topic)).not.toBe('center_of_mass');
      expect(resolvedId(topic, 'NEET_UG')).not.toBe('center_of_mass');
    },
  );

  it('resolves the real concepts', () => {
    expect(resolvedId('Center of Mass')).toBe('center_of_mass');
    expect(resolvedId('Centre of Mass')).toBe('center_of_mass');
    expect(resolvedId('Vectors')).toBe('vectors');
    expect(resolvedId("Newton's Laws")).toBe('newtons_laws');
    expect(resolvedId("Newton's Laws of Motion")).toBe('newtons_laws');
    expect(resolvedId('Rotational Dynamics')).toBe('rotational_dynamics');
    expect(resolvedId('System of Particles and Rotational Motion')).not.toBe('UNRESOLVED');
  });

  it('matches aliases only as whole tokens', () => {
    expect(resolvedId('Surface Tension')).toBe('UNRESOLVED');           // not NLM "tension"
    expect(resolvedId('Equation of Continuity')).toBe('UNRESOLVED');   // not calculus "continuity"
    expect(resolvedId('Resonance Column')).toBe('UNRESOLVED');         // not GOC "resonance"
    expect(resolvedId('Electric Potential Energy')).toBe('electrostatics'); // longest alias wins
  });

  it('treats an equal-length tie between two concepts as ambiguous, not first-registered', () => {
    const r = g.resolveConcept({ topic: 'Electric Dipole Moment of Polar Molecules', examId: 'JEE_MAIN' });
    // "electric dipole" (electrostatics) vs no chemistry alias of the same length here → resolves.
    expect(r.status).toBe('RESOLVED');
    const tie = new ConceptGraphService([
      { id: 'a', name: 'A', subject: 'physics', examCodes: ['JEE_MAIN'], chapter: '', prerequisites: [], aliases: ['alpha beta'], description: '', rootCauseTip: '' },
      { id: 'b', name: 'B', subject: 'physics', examCodes: ['JEE_MAIN'], chapter: '', prerequisites: [], aliases: ['gamma delta'], description: '', rootCauseTip: '' },
    ]).resolveConcept({ topic: 'alpha beta gamma delta', examId: 'JEE_MAIN' });
    expect(tie).toEqual({ status: 'UNRESOLVED', reason: 'ambiguous' });
  });

  it('prefers the canonical syllabus node slug over the display label', () => {
    const r = g.resolveConcept({ topic: 'Chapter 7 practice', syllabusNodeId: 'topic:JEE_MAIN:2026:syl_jee_2026_v1:rotational_motion:abc123def456' });
    expect(r).toMatchObject({ status: 'RESOLVED', examId: 'JEE_MAIN', via: 'syllabus_node' });
    expect(r.status === 'RESOLVED' && r.node.id).toBe('rotational_dynamics');
  });

  it('refuses unsupported exams and rows with no exam', () => {
    expect(g.resolveConcept({ topic: 'Vectors', examId: 'SSC_CGL' })).toEqual({ status: 'NOT_SUPPORTED', reason: 'exam_not_supported' });
    expect(g.resolveConcept({ topic: 'Vectors', examId: 'IBPS_PO' })).toEqual({ status: 'NOT_SUPPORTED', reason: 'exam_not_supported' });
    expect(g.resolveConcept({ topic: 'Vectors' })).toEqual({ status: 'NOT_SUPPORTED', reason: 'no_exam' });
  });

  it('keeps JEE-only maths out of NEET', () => {
    expect(g.resolveConcept({ topic: 'Integration', examId: 'NEET_UG' })).toEqual({ status: 'NOT_SUPPORTED', reason: 'concept_not_in_exam' });
    expect(resolvedId('Integration', 'JEE_MAIN')).toBe('integral_calculus');
  });

  it('normalises possessives and parses node ids', () => {
    expect(normalizeConceptText("Newton's  Laws!")).toBe('newtons laws');
    expect(parseSyllabusNodeId('topic:NEET_UG:2026:syl:work_energy_and_power:ffff')).toEqual({ examId: 'NEET_UG', slug: 'work energy and power' });
    expect(parseSyllabusNodeId('garbage')).toEqual({});
  });
});

describe('root-cause diagnosis', () => {
  it('uses the 50% threshold: 49 is diagnosed, 50 and 51 are not', () => {
    expect(ROOT_CAUSE_ACCURACY_THRESHOLD).toBe(0.5);
    const at = (acc: number) => g.diagnoseAttempt([{ ...row('Rotational Dynamics', 0, 100), correct: acc, incorrect: 100 - acc, accuracy: acc }]);
    expect(at(49)).toHaveLength(1);
    expect(at(50)).toEqual([]);
    expect(at(51)).toEqual([]);
  });

  it('honours an explicitly weak foundational prerequisite (Vectors) instead of a fallback', () => {
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5), row('Vectors', 1, 5)])!;
    expect(d.status).toBe('ROOT_CAUSE_IDENTIFIED');
    expect(d.rootCauseConceptId).toBe('vectors');
    expect(d.prerequisiteChain[0].conceptId).toBe('vectors');
    expect(d.prerequisiteChain[d.prerequisiteChain.length - 1].conceptId).toBe('rotational_dynamics');
    expect(d.prerequisiteChain[0].evidence).toBe('weak');
  });

  it("matches \"Newton's Laws\" with an apostrophe as weak evidence", () => {
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5), row("Newton's Laws", 1, 5), row('Vectors', 5, 5)])!;
    expect(d.rootCauseConceptId).toBe('newtons_laws');
  });

  it('picks the EARLIEST weak prerequisite when several are weak', () => {
    // Kinematics depends on vectors; NLM depends on kinematics. All weak → vectors is the root.
    const ds = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5), row('Kinematics', 1, 5), row("Newton's Laws", 1, 5), row('Vectors', 2, 5)])!;
    expect(ds.find(d => d.targetConceptId === 'rotational_dynamics')!.rootCauseConceptId).toBe('vectors');
  });

  it('uses stored history as evidence for prerequisites not in this test', () => {
    const history: WeakTopic[] = [{ examId: 'JEE_MAIN', topicName: 'Work, Energy and Power', attempts: 2, correct: 2, incorrect: 6, total: 8, accuracy: 25, confidence: 1 }];
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5)], history)!;
    expect(d.status).toBe('ROOT_CAUSE_IDENTIFIED');
    expect(d.rootCauseConceptId).toBe('work_energy_power');
    expect(d.explanation).toContain('earlier tests');
  });

  it('ignores history from another exam', () => {
    const history: WeakTopic[] = [{ examId: 'SSC_CGL', topicName: 'Vectors', attempts: 1, correct: 0, incorrect: 4, total: 4, accuracy: 0, confidence: 0.5 }];
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5)], history)!;
    expect(d.status).toBe('PREREQUISITES_UNASSESSED');
  });

  it('says the prerequisites are unassessed instead of guessing one', () => {
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 5)])!;
    expect(d.status).toBe('PREREQUISITES_UNASSESSED');
    expect(d.rootCauseConceptId).toBeNull();
    expect(d.unassessedPrerequisites).toEqual(expect.arrayContaining(['Torque & Static Equilibrium', 'Center of Mass & Linear Momentum']));
  });

  it('reports a topic-level gap when every direct prerequisite was measured strong', () => {
    const [d] = g.diagnoseAttempt([
      row('Rotational Dynamics', 1, 5), row('Torque', 5, 5), row('Work Energy and Power', 4, 5),
      row('Circular Motion', 5, 5), row('Center of Mass', 4, 5),
    ])!;
    expect(d.status).toBe('TOPIC_LEVEL_GAP');
    expect(d.rootCauseConceptId).toBe('rotational_dynamics');
  });

  it('a foundational concept with no prerequisites is its own root', () => {
    const [d] = g.diagnoseAttempt([row('Vectors', 0, 4)])!;
    expect(d).toMatchObject({ status: 'TOPIC_LEVEL_GAP', rootCauseConceptId: 'vectors' });
  });

  it('returns null — no diagnosis invented — for unsupported exams', () => {
    expect(g.diagnoseAttempt([row('Compound Interest', 0, 5, { examId: 'SSC_CGL' }), row('Computer Awareness', 0, 5, { examId: 'IBPS_PO' })])).toBeNull();
    expect(g.diagnoseAttempt([row('Rotational Dynamics', 0, 5, { examId: undefined })])).toBeNull();
  });

  it('returns [] for a supported exam whose weak rows do not resolve to a concept', () => {
    expect(g.diagnoseAttempt([row('Complex Numbers', 0, 5)])).toEqual([]);
  });

  it('assigns stable ids and confidence from sample size', () => {
    const [d] = g.diagnoseAttempt([row('Rotational Dynamics', 1, 6), row('Vectors', 1, 6)])!;
    expect(d.id).toBe('diag_JEE_MAIN_rotational_dynamics');
    expect(d.confidence).toBe('high');
    const [low] = g.diagnoseAttempt([row('Rotational Dynamics', 0, 2), row('Vectors', 0, 2)])!;
    expect(low.confidence).toBe('low');
  });

  it('rejects a cyclic graph at construction', () => {
    expect(() => new ConceptGraphService([
      { id: 'a', name: 'A', subject: 'physics', examCodes: ['JEE_MAIN'], chapter: '', prerequisites: ['b'], aliases: [], description: '', rootCauseTip: '' },
      { id: 'b', name: 'B', subject: 'physics', examCodes: ['JEE_MAIN'], chapter: '', prerequisites: ['a'], aliases: [], description: '', rootCauseTip: '' },
    ])).toThrow(/cycle/);
  });
});
