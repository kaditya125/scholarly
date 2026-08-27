/**
 * Comprehensive Automated Tests for Sadhya PYQ Intelligence Subsystem
 */

import { pyqSourceDiscoveryService } from '../../src/services/pyq/pyqSourceDiscovery.service';
import { pyqExtractorService } from '../../src/services/pyq/pyqExtractor.service';
import { pyqTaxonomyNormalizer } from '../../src/services/pyq/pyqTaxonomyNormalizer.service';
import { pyqVerificationEngine } from '../../src/services/pyq/pyqVerificationEngine.service';
import { pyqDeduplicationEngine } from '../../src/services/pyq/pyqDeduplicationEngine.service';
import { pyqRightsGovernanceService } from '../../src/services/pyq/pyqRightsGovernance.service';
import { pyqVectorIngestionService } from '../../src/services/pyq/pyqVectorIngestion.service';
import { pyqAnalyticsService } from '../../src/services/pyq/pyqAnalytics.service';
import { CanonicalPYQQuestion } from '../../src/types/pyq.types';

describe('Sadhya PYQ Intelligence Subsystem', () => {
  jest.setTimeout(30000);

  // ─── 1. Source Discovery Tests ─────────────────────────────────────────────
  describe('1. Source Discovery & Multi-Tier Hierarchy', () => {
    it('should discover Tier A official sources and Tier B fallbacks for JEE_MAIN', async () => {
      const result = await pyqSourceDiscoveryService.discoverExamPYQSources('JEE_MAIN');
      expect(result.discoveredSources.length).toBeGreaterThan(0);
      expect(result.officialCount).toBeGreaterThan(0);
      expect(result.secondaryCount).toBeGreaterThan(0);

      const officialSources = result.discoveredSources.filter((s) => s.sourceTier === 'TIER_A_OFFICIAL');
      expect(officialSources[0].authority).toContain('National Testing Agency');
      expect(officialSources[0].sourceDomain).toBe('jeemain.nta.nic.in');
    });

    it('should identify coverage gaps when official years are missing', async () => {
      const result = await pyqSourceDiscoveryService.discoverExamPYQSources('JEE_ADVANCED');
      expect(result.discoveredSources.length).toBeGreaterThan(0);
      expect(Array.isArray(result.gapsIdentified)).toBe(true);
    });
  });

  // ─── 2. Extraction & Mathematical Notation Tests ───────────────────────────
  describe('2. Extraction & LaTeX Normalization', () => {
    it('should normalize mathematical and chemical notation into LaTeX format', () => {
      const rawText = 'Find integral of sin(x) dx from 0 to pi, and reaction with H2SO4 with Na+ ions and sqrt(2x) where x² = 4';
      const normalized = pyqExtractorService.normalizeMathAndScienceNotation(rawText);

      expect(normalized).toContain('\\pi');
      expect(normalized).toContain('\\text{H}_2\\text{SO}_4');
      expect(normalized).toContain('\\text{Na}^+');
      expect(normalized).toContain('\\sqrt{2x}');
      expect(normalized).toContain('x^{2}');
    });

    it('should compute deterministic content hash for duplicate detection', () => {
      const hash1 = pyqExtractorService.generateQuestionHash('JEE_MAIN', 'What is electric potential?', ['0', '1', '2'], 1);
      const hash2 = pyqExtractorService.generateQuestionHash('JEE_MAIN', 'What is electric potential?', ['0', '1', '2'], 1);
      const hashDiff = pyqExtractorService.generateQuestionHash('JEE_MAIN', 'What is magnetic field?', ['0', '1', '2'], 1);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiff);
    });
  });

  // ─── 3. Taxonomy Normalization Tests ───────────────────────────────────────
  describe('3. Subject & Taxonomy Normalization', () => {
    it('should normalize subject aliases correctly per exam', () => {
      expect(pyqTaxonomyNormalizer.normalizeSubject('JEE_MAIN', 'phys')).toBe('Physics');
      expect(pyqTaxonomyNormalizer.normalizeSubject('SSC_CGL', 'quant')).toBe('Quantitative Aptitude');
      expect(pyqTaxonomyNormalizer.normalizeSubject('NEET_UG', 'botany')).toBe('Biology');
      expect(pyqTaxonomyNormalizer.normalizeSubject('UPSC_CSE', 'general studies')).toBe('General Studies I');
    });
  });

  // ─── 4. Cross-Source Verification Engine Tests ─────────────────────────────
  describe('4. Answer Key & Cross-Source Verification', () => {
    const baseQuestion: CanonicalPYQQuestion = {
      questionId: 'test_q_1',
      examId: 'JEE_MAIN',
      examName: 'Joint Entrance Examination',
      year: 2024,
      subject: 'Physics',
      questionNumber: 1,
      questionText: 'Calculate force',
      questionType: 'MCQ_SINGLE',
      correctAnswer: 'B',
      correctAnswerSource: 'NTA Official Final Key',
      language: 'en',
      extractionQualityScore: 0.95,
      sourceId: 'src_official',
      sourceUrl: 'https://jeemain.nta.nic.in/q.pdf',
      sourceType: 'TIER_A_OFFICIAL',
      provenanceRecords: [],
      verificationStatus: 'OFFICIAL_CONFIRMED',
      rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
      rightsSource: 'NTA',
      redistributionAllowed: true,
      contentHash: 'hash_test_1',
      ingestionState: 'EXTRACTED',
      vectorIndexed: false,
      retrievalTested: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('should mark as OFFICIAL_CONFIRMED when Tier A official answer is available', () => {
      const evaluation = pyqVerificationEngine.verifyQuestion(baseQuestion, [
        { sourceName: 'Testbook', sourceTier: 'TIER_B_REPUTABLE_PLATFORM', answer: 'B' },
      ]);
      expect(evaluation.status).toBe('OFFICIAL_CONFIRMED');
      expect(evaluation.canonicalAnswer).toBe('B');
      expect(evaluation.hasConflict).toBe(false);
    });

    it('should detect and flag CONFLICTING status when secondary sources disagree and no official source exists', () => {
      const secondaryOnlyQ: CanonicalPYQQuestion = {
        ...baseQuestion,
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        correctAnswer: 'B',
        correctAnswerSource: 'Careers360',
      };

      const evaluation = pyqVerificationEngine.verifyQuestion(secondaryOnlyQ, [
        { sourceName: 'Testbook', sourceTier: 'TIER_B_REPUTABLE_PLATFORM', answer: 'C' },
      ]);

      expect(evaluation.status).toBe('CONFLICTING');
      expect(evaluation.hasConflict).toBe(true);
      expect(evaluation.conflictDetails).toContain('Disagreement among secondary sources');
    });

    it('should mark as MULTI_SOURCE_CONFIRMED when multiple secondary sources agree', () => {
      const secondaryOnlyQ: CanonicalPYQQuestion = {
        ...baseQuestion,
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        correctAnswer: 'A',
        correctAnswerSource: 'Careers360',
      };

      const evaluation = pyqVerificationEngine.verifyQuestion(secondaryOnlyQ, [
        { sourceName: 'Testbook', sourceTier: 'TIER_B_REPUTABLE_PLATFORM', answer: 'A' },
      ]);

      expect(evaluation.status).toBe('MULTI_SOURCE_CONFIRMED');
      expect(evaluation.canonicalAnswer).toBe('A');
    });
  });

  // ─── 5. Deduplication Engine Tests ─────────────────────────────────────────
  describe('5. Deduplication & Provenance Merging', () => {
    it('should merge duplicate extractions of the same question without duplication', () => {
      const q1: CanonicalPYQQuestion = {
        questionId: 'q_primary',
        examId: 'SSC_CGL',
        examName: 'SSC CGL',
        year: 2024,
        session: 'Tier 1',
        shift: 'Shift 1',
        subject: 'Quantitative Aptitude',
        questionNumber: 15,
        questionText: 'What is 20 percent of 500?',
        questionType: 'MCQ_SINGLE',
        options: ['100', '200', '300', '400'],
        correctAnswer: 'A',
        correctAnswerSource: 'Testbook',
        language: 'en',
        extractionQualityScore: 0.90,
        sourceId: 'src_testbook',
        sourceUrl: 'https://testbook.com/q15',
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        provenanceRecords: [
          {
            sourceTier: 'TIER_B_REPUTABLE_PLATFORM',
            sourceName: 'Testbook',
            sourceUrl: 'https://testbook.com/q15',
            sourceDomain: 'testbook.com',
            retrievedAt: Date.now(),
            isOfficial: false,
            contentHash: 'hash_duplicate_test',
          },
        ],
        verificationStatus: 'SECONDARY_CONFIRMED',
        rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
        rightsSource: 'Testbook',
        redistributionAllowed: true,
        contentHash: 'hash_duplicate_test',
        ingestionState: 'EXTRACTED',
        vectorIndexed: false,
        retrievalTested: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const q2DuplicateOfficial: CanonicalPYQQuestion = {
        ...q1,
        questionId: 'q_official_dup',
        sourceId: 'src_official',
        sourceUrl: 'https://ssc.gov.in/q15.pdf',
        sourceType: 'TIER_A_OFFICIAL',
        correctAnswerSource: 'SSC Official Portal',
        provenanceRecords: [
          {
            sourceTier: 'TIER_A_OFFICIAL',
            sourceName: 'SSC Official Portal',
            sourceUrl: 'https://ssc.gov.in/q15.pdf',
            sourceDomain: 'ssc.gov.in',
            retrievedAt: Date.now(),
            isOfficial: true,
            contentHash: 'hash_duplicate_test',
          },
        ],
      };

      const deduped = pyqDeduplicationEngine.deduplicateQuestions([q1, q2DuplicateOfficial]);

      expect(deduped.length).toBe(1);
      // Provenance should now contain both sources
      expect(deduped[0].provenanceRecords.length).toBe(2);
      // Official tier should be promoted
      expect(deduped[0].sourceType).toBe('TIER_A_OFFICIAL');
      expect(deduped[0].verificationStatus).toBe('OFFICIAL_CONFIRMED');
    });
  });

  // ─── 6. Rights & Licensing Governance Tests ────────────────────────────────
  describe('6. Rights Governance & Public Content Safety', () => {
    it('should approve official and public domain questions for public serving', () => {
      const qOfficial: any = {
        questionId: 'q_rights_test',
        sourceType: 'TIER_A_OFFICIAL',
        rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
        ingestionState: 'VERIFIED',
      };

      const assessment = pyqRightsGovernanceService.evaluateRights(qOfficial);
      expect(assessment.canIndexInVectorDb).toBe(true);
      expect(assessment.canExposePublicly).toBe(true);
      expect(assessment.redistributionAllowed).toBe(true);
    });

    it('should quarantine DO_NOT_REDISTRIBUTE content', () => {
      const qQuarantine: any = {
        questionId: 'q_quarantine_test',
        sourceType: 'TIER_B_REPUTABLE_PLATFORM',
        rightsStatus: 'DO_NOT_REDISTRIBUTE',
        ingestionState: 'VERIFIED',
      };

      const assessment = pyqRightsGovernanceService.evaluateRights(qQuarantine);
      expect(assessment.canIndexInVectorDb).toBe(false);
      expect(assessment.canExposePublicly).toBe(false);
      expect(assessment.redistributionAllowed).toBe(false);

      const approvalResult = pyqRightsGovernanceService.applyRightsApproval([qQuarantine]);
      expect(approvalResult.quarantinedCount).toBe(1);
      expect(qQuarantine.ingestionState).toBe('QUARANTINED');
    });
  });

  // ─── 7. Vector Metadata & Ownership Isolation Tests ────────────────────────
  describe('7. Vector Metadata & Privacy Contract', () => {
    it('should format rich question payload for vector embedding', () => {
      const q: any = {
        examId: 'JEE_MAIN',
        examName: 'Joint Entrance Examination',
        year: 2024,
        session: 'Session 1',
        shift: 'Shift 1',
        subject: 'Physics',
        topic: 'Electrostatics',
        questionNumber: 5,
        questionText: 'Two charges separated by distance r...',
        options: ['10 N', '20 N', '30 N', '40 N'],
        questionType: 'MCQ_SINGLE',
        difficulty: 'MEDIUM',
      };

      const text = pyqVectorIngestionService.formatQuestionForEmbedding(q);
      expect(text).toContain('Examination: JEE_MAIN');
      expect(text).toContain('Year: 2024 | Session: Session 1 | Shift: Shift 1');
      expect(text).toContain('Subject: Physics > Electrostatics');
      expect(text).toContain('(A) 10 N');
      expect(text).toContain('Content Type: Official Previous Year Question (PYQ)');
    });
  });

  // ─── 8. Analytics & Personalization Tests ──────────────────────────────────
  describe('8. Analytics & Personalization Recommendations', () => {
    it('should generate personalized priority recommendations based on student weaknesses', () => {
      const mockAnalytics: any = {
        examId: 'JEE_MAIN',
        totalQuestions: 100,
        topTopics: [
          { topic: 'Electrostatics', subject: 'Physics', questionCount: 15, percentageWeight: 15, yearsAppeared: [2022, 2023, 2024] },
          { topic: 'Thermodynamics', subject: 'Physics', questionCount: 12, percentageWeight: 12, yearsAppeared: [2022, 2023, 2024] },
          { topic: 'Optics', subject: 'Physics', questionCount: 8, percentageWeight: 8, yearsAppeared: [2022, 2023] },
        ],
      };

      const recommendations = pyqAnalyticsService.generatePersonalizedPriorities(mockAnalytics, ['Electrostatics']);
      expect(recommendations.highYieldWeakTopics.length).toBe(1);
      expect(recommendations.highYieldWeakTopics[0].topic).toBe('Electrostatics');
      expect(recommendations.masteryRecommendations[0]).toContain('accounts for 15% of historical questions');
    });
  });
});
