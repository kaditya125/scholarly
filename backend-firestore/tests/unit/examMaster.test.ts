import { ExamMasterService } from '../../src/services/exam/examMaster.service';
import { OfficialSourceVerificationService } from '../../src/services/exam/officialSourceVerification.service';
import { ExamRepository } from '../../src/repositories/exam.repository';
import { ExamMaster, ExamCycle, ExamOfficialSource, ExamSyllabus } from '../../src/types/exam.types';

describe('ExamMasterService & Lifecycle', () => {
  let examService: ExamMasterService;
  let mockRepo: jest.Mocked<ExamRepository>;
  let mockVerifier: OfficialSourceVerificationService;

  // In-memory state for mock repository
  let examsDb: Map<string, ExamMaster>;
  let cyclesDb: Map<string, ExamCycle>;
  let sourcesDb: Map<string, ExamOfficialSource>;
  let syllabiDb: Map<string, ExamSyllabus>;

  beforeEach(() => {
    examsDb = new Map();
    cyclesDb = new Map();
    sourcesDb = new Map();
    syllabiDb = new Map();

    mockVerifier = new OfficialSourceVerificationService();

    mockRepo = {
      createExam: jest.fn(async (exam: ExamMaster) => {
        examsDb.set(exam.examId, exam);
      }),
      getExamById: jest.fn(async (id: string) => examsDb.get(id) || null),
      listExams: jest.fn(async () => Array.from(examsDb.values())),
      updateExam: jest.fn(async (id: string, updates: Partial<ExamMaster>) => {
        const existing = examsDb.get(id);
        if (existing) examsDb.set(id, { ...existing, ...updates, updatedAt: Date.now() });
      }),
      findExamByAlias: jest.fn(async (query: string) => {
        const norm = query.toLowerCase().trim();
        for (const ex of examsDb.values()) {
          if (ex.examId.toLowerCase() === norm) return ex;
          if (ex.shortName.toLowerCase() === norm) return ex;
          if (ex.name.toLowerCase() === norm) return ex;
          if (ex.aliases?.some((a) => a.toLowerCase() === norm)) return ex;
        }
        return null;
      }),
      createCycle: jest.fn(async (cycle: ExamCycle) => {
        cyclesDb.set(`${cycle.examId}_${cycle.cycleId}`, cycle);
      }),
      getCycle: jest.fn(async (examId: string, cycleId: string) => {
        return cyclesDb.get(`${examId}_${cycleId}`) || null;
      }),
      listCycles: jest.fn(async (examId: string) => {
        return Array.from(cyclesDb.values()).filter((c) => c.examId === examId);
      }),
      updateCycle: jest.fn(async (examId: string, cycleId: string, updates: Partial<ExamCycle>) => {
        const key = `${examId}_${cycleId}`;
        const existing = cyclesDb.get(key);
        if (existing) cyclesDb.set(key, { ...existing, ...updates, updatedAt: Date.now() });
      }),
      createOfficialSource: jest.fn(async (source: ExamOfficialSource) => {
        sourcesDb.set(source.sourceId, source);
      }),
      getOfficialSource: jest.fn(async (id: string) => sourcesDb.get(id) || null),
      listOfficialSources: jest.fn(async (examId: string, filter?: any) => {
        let list = Array.from(sourcesDb.values()).filter((s) => s.examId === examId);
        if (filter?.verifiedOnly) list = list.filter((s) => s.verified);
        return list;
      }),
      updateOfficialSource: jest.fn(async (id: string, updates: Partial<ExamOfficialSource>) => {
        const existing = sourcesDb.get(id);
        if (existing) sourcesDb.set(id, { ...existing, ...updates, updatedAt: Date.now() });
      }),
      createSyllabus: jest.fn(async (syllabus: ExamSyllabus) => {
        syllabiDb.set(syllabus.syllabusId, syllabus);
      }),
      getSyllabusById: jest.fn(async (id: string) => syllabiDb.get(id) || null),
      getCurrentSyllabus: jest.fn(async (examId: string, cycleId: string) => {
        for (const s of syllabiDb.values()) {
          if (s.examId === examId && s.cycleId === cycleId && s.status === 'CURRENT') {
            return s;
          }
        }
        return null;
      }),
      listSyllabi: jest.fn(async (examId: string, cycleId?: string) => {
        return Array.from(syllabiDb.values()).filter(
          (s) => s.examId === examId && (!cycleId || s.cycleId === cycleId)
        );
      }),
      publishSyllabusVersion: jest.fn(
        async (examId: string, cycleId: string, syllabusId: string, performedBy: string) => {
          const target = syllabiDb.get(syllabusId);
          if (!target) throw new Error('Not found');
          // Supersede older current
          for (const [id, s] of syllabiDb.entries()) {
            if (s.examId === examId && s.cycleId === cycleId && s.status === 'CURRENT') {
              syllabiDb.set(id, { ...s, status: 'SUPERSEDED' });
            }
          }
          syllabiDb.set(syllabusId, { ...target, status: 'CURRENT', verifiedAt: Date.now() });
        }
      ),
      logAudit: jest.fn(async () => {}),
    } as any;

    examService = new ExamMasterService(mockRepo, mockVerifier);
  });

  describe('Exam Master Operations', () => {
    it('creates a new canonical exam and normalizes aliases and domains', async () => {
      const exam = await examService.createExam(
        {
          examId: 'ssc_cgl',
          name: 'Staff Selection Commission — Combined Graduate Level',
          shortName: 'SSC CGL',
          conductingAuthority: 'Staff Selection Commission',
          category: 'SSC',
          aliases: ['cgl', 'Combined Graduate Level'],
          officialDomains: ['https://www.ssc.gov.in', 'ssc.nic.in/'],
          currentCycle: '2026',
        },
        'admin-user'
      );

      expect(exam.examId).toBe('SSC_CGL');
      expect(exam.officialDomains).toEqual(['ssc.gov.in', 'ssc.nic.in']);
      expect(exam.aliases).toContain('cgl');
      expect(mockRepo.createExam).toHaveBeenCalled();
      expect(mockRepo.createCycle).toHaveBeenCalledWith(
        expect.objectContaining({ cycleId: '2026', examId: 'SSC_CGL' })
      );
    });

    it('prevents duplicate exam ID creation', async () => {
      await examService.createExam(
        {
          examId: 'SSC_CGL',
          name: 'SSC CGL',
          shortName: 'SSC CGL',
          conductingAuthority: 'SSC',
          category: 'SSC',
          officialDomains: ['ssc.gov.in'],
        },
        'admin'
      );

      await expect(
        examService.createExam(
          {
            examId: 'ssc_cgl',
            name: 'Duplicate SSC',
            shortName: 'Duplicate',
            conductingAuthority: 'SSC',
            category: 'SSC',
            officialDomains: ['ssc.gov.in'],
          },
          'admin'
        )
      ).rejects.toThrow(/already exists/i);
    });

    it('resolves aliases case-insensitively to the canonical exam', async () => {
      await examService.createExam(
        {
          examId: 'SSC_CGL',
          name: 'Staff Selection Commission Combined Graduate Level',
          shortName: 'SSC CGL',
          conductingAuthority: 'SSC',
          category: 'SSC',
          aliases: ['cgl', 'SSC-CGL', 'Combined Graduate Level'],
          officialDomains: ['ssc.gov.in'],
        },
        'admin'
      );

      const res1 = await examService.resolveExam('cgl');
      expect(res1?.examId).toBe('SSC_CGL');

      const res2 = await examService.resolveExam('SSC-CGL');
      expect(res2?.examId).toBe('SSC_CGL');

      const res3 = await examService.resolveExam('nonexistent_exam');
      expect(res3).toBeNull();
    });
  });

  describe('Official Sources & Verification Integration', () => {
    beforeEach(async () => {
      await examService.createExam(
        {
          examId: 'SSC_CGL',
          name: 'SSC CGL',
          shortName: 'SSC CGL',
          conductingAuthority: 'Staff Selection Commission',
          category: 'SSC',
          officialDomains: ['ssc.gov.in'],
        },
        'admin'
      );
    });

    it('auto-verifies sources matching registered official domains', async () => {
      const source = await examService.addOfficialSource(
        'SSC_CGL',
        {
          sourceType: 'APPLICATION',
          url: 'https://ssc.gov.in/apply',
        },
        'admin'
      );

      expect(source.verified).toBe(true);
      expect(source.verificationMethod).toBe('DOMAIN_MATCH');
      expect(source.domain).toBe('ssc.gov.in');
    });

    it('marks sources from unauthorized domains as unverified with reason', async () => {
      const source = await examService.addOfficialSource(
        'SSC_CGL',
        {
          sourceType: 'APPLICATION',
          url: 'https://upsc.gov.in/apply', // Wrong exam's domain
        },
        'admin'
      );

      expect(source.verified).toBe(false);
      expect(source.notes).toContain('not in the registered official domains');
    });
  });

  describe('Versioned Syllabus Lifecycle & Isolation', () => {
    beforeEach(async () => {
      await examService.createExam(
        {
          examId: 'SSC_CGL',
          name: 'SSC CGL',
          shortName: 'SSC CGL',
          conductingAuthority: 'SSC',
          category: 'SSC',
          officialDomains: ['ssc.gov.in'],
          currentCycle: '2026',
        },
        'admin'
      );

      await examService.createExam(
        {
          examId: 'UPSC_CSE',
          name: 'UPSC CSE',
          shortName: 'UPSC CSE',
          conductingAuthority: 'UPSC',
          category: 'UPSC',
          officialDomains: ['upsc.gov.in'],
          currentCycle: '2026',
        },
        'admin'
      );
    });

    it('creates initial version in DRAFT status', async () => {
      const syl = await examService.createSyllabusVersion(
        'SSC_CGL',
        '2026',
        {
          version: '2026-v1',
          sourceDocumentUrl: 'https://ssc.gov.in/cgl2026.pdf',
          stages: [],
        },
        'admin'
      );

      expect(syl.status).toBe('DRAFT');
      expect(syl.syllabusId).toBe('syl_ssc_cgl_2026_2026_v1');
    });

    it('publishes new version as CURRENT and supersedes older version', async () => {
      const v1 = await examService.createSyllabusVersion(
        'SSC_CGL',
        '2026',
        {
          version: '2026-v1',
          sourceDocumentUrl: 'https://ssc.gov.in/v1.pdf',
          stages: [],
        },
        'admin'
      );

      await examService.publishSyllabusVersion('SSC_CGL', '2026', v1.syllabusId, 'admin');

      const currentAfterV1 = await examService.getCurrentSyllabus('SSC_CGL', '2026');
      expect(currentAfterV1?.syllabusId).toBe(v1.syllabusId);
      expect(currentAfterV1?.status).toBe('CURRENT');

      // Now create and publish v2
      const v2 = await examService.createSyllabusVersion(
        'SSC_CGL',
        '2026',
        {
          version: '2026-v2',
          sourceDocumentUrl: 'https://ssc.gov.in/v2.pdf',
          stages: [],
        },
        'admin'
      );

      await examService.publishSyllabusVersion('SSC_CGL', '2026', v2.syllabusId, 'admin');

      const currentAfterV2 = await examService.getCurrentSyllabus('SSC_CGL', '2026');
      expect(currentAfterV2?.syllabusId).toBe(v2.syllabusId);
      expect(currentAfterV2?.status).toBe('CURRENT');

      const oldV1 = await mockRepo.getSyllabusById(v1.syllabusId);
      expect(oldV1?.status).toBe('SUPERSEDED');
    });

    it('CRITICAL ISOLATION: Request for SSC_CGL 2026 never returns UPSC_CSE 2026 or older cycle', async () => {
      const ssc2026 = await examService.createSyllabusVersion(
        'SSC_CGL',
        '2026',
        { version: 'v1', sourceDocumentUrl: 'https://ssc.gov.in/1.pdf', stages: [] },
        'admin'
      );
      await examService.publishSyllabusVersion('SSC_CGL', '2026', ssc2026.syllabusId, 'admin');

      const upsc2026 = await examService.createSyllabusVersion(
        'UPSC_CSE',
        '2026',
        { version: 'v1', sourceDocumentUrl: 'https://upsc.gov.in/1.pdf', stages: [] },
        'admin'
      );
      await examService.publishSyllabusVersion('UPSC_CSE', '2026', upsc2026.syllabusId, 'admin');

      const sscResult = await examService.getCurrentSyllabus('SSC_CGL', '2026');
      expect(sscResult?.examId).toBe('SSC_CGL');
      expect(sscResult?.syllabusId).toBe(ssc2026.syllabusId);

      const upscResult = await examService.getCurrentSyllabus('UPSC_CSE', '2026');
      expect(upscResult?.examId).toBe('UPSC_CSE');
      expect(upscResult?.syllabusId).toBe(upsc2026.syllabusId);
    });
  });
});
