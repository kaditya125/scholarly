import { SyllabusDiffService } from '../../src/services/exam/syllabusDiff.service';
import { ExamSyllabus } from '../../src/types/exam.types';

describe('SyllabusDiffService', () => {
  let diffService: SyllabusDiffService;

  const baseSyllabus: ExamSyllabus = {
    syllabusId: 'syl_ssc_cgl_2025_v1',
    examId: 'SSC_CGL',
    cycleId: '2025',
    version: '2025-v1',
    authority: 'SSC',
    status: 'SUPERSEDED',
    sourceDocumentUrl: 'https://ssc.gov.in/v1.pdf',
    sourceDocumentHash: 'hash1',
    extractedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    stages: [
      {
        stageId: 'tier_1',
        name: 'Tier I',
        order: 1,
        papers: [
          {
            paperId: 'p1',
            name: 'Paper 1',
            order: 1,
            subjects: [
              {
                subjectId: 'quant',
                name: 'Quantitative Aptitude',
                order: 1,
                marks: 50,
                topics: [
                  {
                    topicId: 'quant_algebra',
                    name: 'Algebra',
                    order: 1,
                    subtopics: [
                      { subtopicId: 'alg_identities', name: 'Basic Identities', order: 1 },
                      { subtopicId: 'alg_linear', name: 'Linear Equations', order: 2 },
                    ],
                  },
                  {
                    topicId: 'quant_geometry',
                    name: 'Geometry',
                    order: 2,
                    subtopics: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    diffService = new SyllabusDiffService();
  });

  it('detects no changes when comparing identical syllabi', () => {
    const report = diffService.compare(baseSyllabus, baseSyllabus);
    expect(report.hasChanges).toBe(false);
    expect(report.totalAddedTopics).toBe(0);
    expect(report.totalRemovedTopics).toBe(0);
    expect(report.totalModifiedTopics).toBe(0);
    expect(report.changes).toHaveLength(0);
  });

  it('detects newly added topics in target syllabus', () => {
    const targetSyllabus: ExamSyllabus = {
      ...baseSyllabus,
      version: '2026-v1',
      stages: [
        {
          stageId: 'tier_1',
          name: 'Tier I',
          order: 1,
          papers: [
            {
              paperId: 'p1',
              name: 'Paper 1',
              order: 1,
              subjects: [
                {
                  subjectId: 'quant',
                  name: 'Quantitative Aptitude',
                  order: 1,
                  marks: 50,
                  topics: [
                    ...baseSyllabus.stages[0].papers[0].subjects[0].topics,
                    {
                      topicId: 'quant_statistics',
                      name: 'Statistics and Probability',
                      order: 3,
                      subtopics: [{ subtopicId: 'stat_mean', name: 'Mean & Variance', order: 1 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = diffService.compare(baseSyllabus, targetSyllabus);
    expect(report.hasChanges).toBe(true);
    expect(report.totalAddedTopics).toBe(1);
    expect(report.changes[0].type).toBe('ADDED');
    expect(report.changes[0].topicId).toBe('quant_statistics');
    expect(report.summary[0]).toContain("Added topic 'Statistics and Probability'");
  });

  it('detects removed topics in target syllabus', () => {
    const targetSyllabus: ExamSyllabus = {
      ...baseSyllabus,
      version: '2026-v1',
      stages: [
        {
          stageId: 'tier_1',
          name: 'Tier I',
          order: 1,
          papers: [
            {
              paperId: 'p1',
              name: 'Paper 1',
              order: 1,
              subjects: [
                {
                  subjectId: 'quant',
                  name: 'Quantitative Aptitude',
                  order: 1,
                  marks: 50,
                  topics: [baseSyllabus.stages[0].papers[0].subjects[0].topics[0]], // removed geometry
                },
              ],
            },
          ],
        },
      ],
    };

    const report = diffService.compare(baseSyllabus, targetSyllabus);
    expect(report.hasChanges).toBe(true);
    expect(report.totalRemovedTopics).toBe(1);
    expect(report.changes[0].type).toBe('REMOVED');
    expect(report.changes[0].topicId).toBe('quant_geometry');
    expect(report.summary[0]).toContain("Removed topic 'Geometry'");
  });

  it('detects subtopic modifications (additions and removals)', () => {
    const targetSyllabus: ExamSyllabus = {
      ...baseSyllabus,
      version: '2026-v1',
      stages: [
        {
          stageId: 'tier_1',
          name: 'Tier I',
          order: 1,
          papers: [
            {
              paperId: 'p1',
              name: 'Paper 1',
              order: 1,
              subjects: [
                {
                  subjectId: 'quant',
                  name: 'Quantitative Aptitude',
                  order: 1,
                  marks: 50,
                  topics: [
                    {
                      topicId: 'quant_algebra',
                      name: 'Algebra',
                      order: 1,
                      subtopics: [
                        { subtopicId: 'alg_identities', name: 'Basic Identities', order: 1 },
                        { subtopicId: 'alg_surds', name: 'Elementary Surds & Roots', order: 2 }, // Added
                      ], // Removed Linear Equations
                    },
                    baseSyllabus.stages[0].papers[0].subjects[0].topics[1],
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const report = diffService.compare(baseSyllabus, targetSyllabus);
    expect(report.hasChanges).toBe(true);
    expect(report.totalModifiedTopics).toBe(1);
    const mod = report.changes[0];
    expect(mod.type).toBe('MODIFIED');
    expect(mod.details.addedSubtopics).toContain('Elementary Surds & Roots');
    expect(mod.details.removedSubtopics).toContain('Linear Equations');
  });
});
