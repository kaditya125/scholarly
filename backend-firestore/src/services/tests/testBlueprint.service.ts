/**
 * BlueprintResolver — turns "SSC CGL, FULL_MOCK, 100 questions" into a concrete TestBlueprint,
 * without ever hardcoding what SSC CGL (or any exam) looks like in this file.
 *
 * Two real data sources, both already built, neither duplicated here:
 *   examMasterService.getCurrentSyllabus(examId)  — OFFICIAL section/subject structure, when the
 *                                                    exam has a published canonical syllabus.
 *   pyqAnalyticsService.getExamPatternProfile()    — OBSERVED difficulty/subject/topic distribution,
 *                                                    computed from the verified PYQ corpus itself.
 *
 * Every number in the returned blueprint is tagged with where it came from (OFFICIAL / OBSERVED /
 * INFERRED / UNKNOWN) — see questionMixer.types.ts's PatternProvenance doc. A blueprint for an exam
 * with neither an official syllabus nor any indexed PYQs is not an error: it is a thin, all-UNKNOWN
 * blueprint the mixer degrades gracefully around, exactly the "if I ingest a new exam tomorrow this
 * engine must work" requirement — an exam with zero data still produces A blueprint, just an honest
 * one that leans entirely on GENERATED with no distribution claims.
 */
import { examMasterService } from '../exam/examMaster.service';
import { pyqAnalyticsService } from '../pyq/pyqAnalytics.service';
import { logger } from '../../utils/logger';
import {
  TestBlueprint, SectionBlueprint, TestMode, SourceDistribution, DifficultyDistribution, PatternProvenance,
} from '../../types/questionMixer.types';

/**
 * System-fallback source mixes by mode — used ONLY when the caller supplies no override. These are
 * a documented default policy, not a claim about any specific exam, which is why they are marked
 * INFERRED rather than OBSERVED: they were not measured, they were chosen as a reasonable default.
 */
const DEFAULT_SOURCE_MIX: Record<TestMode, Omit<SourceDistribution, 'provenance'>> = {
  PRACTICE:          { canonicalPyq: 0.20, pyqPattern: 0.30, referenceBook: 0.20, generated: 0.30 },
  PYQ_PRACTICE:       { canonicalPyq: 1.00, pyqPattern: 0.00, referenceBook: 0.00, generated: 0.00 },
  SMART_MIXED:        { canonicalPyq: 0.40, pyqPattern: 0.30, referenceBook: 0.20, generated: 0.10 },
  FULL_MOCK:          { canonicalPyq: 0.35, pyqPattern: 0.35, referenceBook: 0.15, generated: 0.15 },
  WEAK_AREA_DRILL:    { canonicalPyq: 0.40, pyqPattern: 0.20, referenceBook: 0.30, generated: 0.10 },
};

const DEFAULT_QUESTION_COUNT: Record<TestMode, number> = {
  PRACTICE: 10, PYQ_PRACTICE: 20, SMART_MIXED: 20, FULL_MOCK: 100, WEAK_AREA_DRILL: 10,
};

/** Documented last-resort difficulty split when the corpus has nothing to observe. Not a claim
 *  about any exam's real difficulty curve. */
const FALLBACK_DIFFICULTY_SPLIT = { easy: 0.2, medium: 0.6, hard: 0.2 };

export class BlueprintResolverService {
  async resolve(params: {
    examId: string;
    examResolved: boolean;
    mode: TestMode;
    totalQuestions?: number;
    subjectIds?: string[];
    sourceDistributionOverride?: Partial<SourceDistribution>;
  }): Promise<TestBlueprint> {
    const totalQuestions = params.totalQuestions || DEFAULT_QUESTION_COUNT[params.mode];

    const [syllabus, pattern] = await Promise.all([
      params.examResolved
        ? examMasterService.getCurrentSyllabus(params.examId).catch(() => null)
        : Promise.resolve(null),
      params.examResolved
        ? pyqAnalyticsService.getExamPatternProfile(params.examId).catch(() => null)
        : Promise.resolve(null),
    ]);

    const hasPattern = Boolean(pattern && pattern.totalQuestionsAnalyzed > 0);

    // ── Difficulty distribution ────────────────────────────────────────────────────────────
    const difficultyDistribution = this.resolveDifficulty(totalQuestions, hasPattern ? pattern : null);

    // ── Source distribution ────────────────────────────────────────────────────────────────
    const sourceDistribution = this.resolveSourceMix(params.mode, params.sourceDistributionOverride);

    // ── Sections ────────────────────────────────────────────────────────────────────────────
    const sections = this.resolveSections({
      examId: params.examId, totalQuestions, syllabus, pattern: hasPattern ? pattern : null,
      subjectIds: params.subjectIds, sourceDistribution, difficultyDistribution,
    });

    const structureProvenance: PatternProvenance = sections.official ? 'OFFICIAL' : hasPattern ? 'OBSERVED' : (params.subjectIds?.length ? 'INFERRED' : 'UNKNOWN');

    logger.info('[BlueprintResolver] resolved', {
      examId: params.examId, examResolved: params.examResolved, mode: params.mode,
      totalQuestions, sectionCount: sections.list.length, structureProvenance,
      hasOfficialSyllabus: sections.official, hasPatternData: hasPattern,
    });

    return {
      examId: params.examId,
      examResolved: params.examResolved,
      mode: params.mode,
      totalQuestions,
      sections: sections.list,
      difficultyDistribution,
      sourceDistribution,
      markingScheme: 'UNKNOWN', // examMasterService's syllabus doesn't currently carry marking scheme structurally
      structureProvenance,
    };
  }

  private resolveDifficulty(totalQuestions: number, pattern: Awaited<ReturnType<typeof pyqAnalyticsService.getExamPatternProfile>> | null): DifficultyDistribution {
    if (pattern?.difficultyDistribution) {
      const d = pattern.difficultyDistribution as Record<string, number>;
      const sum = (d.EASY || 0) + (d.MEDIUM || 0) + (d.HARD || 0);
      if (sum > 0) {
        const easy = Math.round((d.EASY / sum) * totalQuestions);
        const hard = Math.round((d.HARD / sum) * totalQuestions);
        return { easy, hard, medium: Math.max(0, totalQuestions - easy - hard), provenance: 'OBSERVED' };
      }
    }
    const easy = Math.round(FALLBACK_DIFFICULTY_SPLIT.easy * totalQuestions);
    const hard = Math.round(FALLBACK_DIFFICULTY_SPLIT.hard * totalQuestions);
    return { easy, hard, medium: Math.max(0, totalQuestions - easy - hard), provenance: 'INFERRED' };
  }

  private resolveSourceMix(mode: TestMode, override?: Partial<SourceDistribution>): SourceDistribution {
    const base = DEFAULT_SOURCE_MIX[mode];
    if (!override) return { ...base, provenance: 'INFERRED' };
    const merged = {
      canonicalPyq: override.canonicalPyq ?? base.canonicalPyq,
      pyqPattern: override.pyqPattern ?? base.pyqPattern,
      referenceBook: override.referenceBook ?? base.referenceBook,
      generated: override.generated ?? base.generated,
    };
    // Caller supplied at least one explicit fraction — that's a request, not a system guess.
    return { ...merged, provenance: 'UNKNOWN' };
  }

  private resolveSections(args: {
    examId: string; totalQuestions: number;
    syllabus: Awaited<ReturnType<typeof examMasterService.getCurrentSyllabus>> | null;
    pattern: Awaited<ReturnType<typeof pyqAnalyticsService.getExamPatternProfile>> | null;
    subjectIds?: string[]; sourceDistribution: SourceDistribution; difficultyDistribution: DifficultyDistribution;
  }): { list: SectionBlueprint[]; official: boolean } {
    /*
     * A caller-supplied subjectIds narrows an OFFICIAL/OBSERVED structure down rather than being
     * ignored by it. This used to build the full official structure regardless — requesting one
     * subject's worth of practice still produced all 10 SSC CGL sections at ~1-2 questions each,
     * which is both wrong (the caller asked for one subject) and slow (many tiny sections each
     * needing their own generation call). Case-insensitive substring match, matching the loose
     * comparison already used elsewhere for subject/topic names in this file.
     */
    const wantsSubject = (name: string): boolean =>
      !args.subjectIds || args.subjectIds.length === 0 ||
      args.subjectIds.some((s) => name.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(name.toLowerCase()));

    // 1) OFFICIAL: the syllabus has real SUBJECT-level nodes.
    const allSubjectNodes = (args.syllabus?.nodes || []).flatMap((n: any) => this.collectByType(n, 'SUBJECT'));
    const subjectNodes = allSubjectNodes.filter((n: any) => wantsSubject(n.name));
    if (subjectNodes.length > 0) {
      const declaredTotal = subjectNodes.reduce((s: number, n: any) => s + (n.questionCount || 0), 0);
      const list: SectionBlueprint[] = subjectNodes.map((n: any) => ({
        sectionId: n.nodeId,
        name: n.name,
        syllabusNodeId: n.nodeId,
        questionCount: declaredTotal > 0
          ? Math.round(((n.questionCount || 0) / declaredTotal) * args.totalQuestions)
          : Math.round(args.totalQuestions / subjectNodes.length),
        marksPerQuestion: n.marks && n.questionCount ? Math.round((n.marks / n.questionCount) * 100) / 100 : undefined,
      }));
      return { list: this.reconcileCount(list, args.totalQuestions), official: true };
    }

    // 2) OBSERVED: no official syllabus, but the PYQ corpus has a real subject distribution.
    if (args.pattern && Object.keys(args.pattern.subjectDistribution || {}).length > 0) {
      const fullDist = args.pattern.subjectDistribution as Record<string, number>;
      const dist = Object.fromEntries(Object.entries(fullDist).filter(([subject]) => wantsSubject(subject)));
      if (Object.keys(dist).length === 0) Object.assign(dist, fullDist); // requested subject not observed either — fall back to the full spread rather than an empty blueprint
      const sum = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      const list: SectionBlueprint[] = Object.entries(dist).map(([subject, count]) => ({
        sectionId: subject.toLowerCase().replace(/\s+/g, '-'),
        name: subject,
        subjectId: subject,
        questionCount: Math.round((count / sum) * args.totalQuestions),
      }));
      return { list: this.reconcileCount(list, args.totalQuestions), official: false };
    }

    // 3) INFERRED: caller named subjects but the corpus has nothing — split evenly, honestly.
    if (args.subjectIds && args.subjectIds.length > 0) {
      const per = Math.round(args.totalQuestions / args.subjectIds.length);
      const list: SectionBlueprint[] = args.subjectIds.map((s) => ({
        sectionId: s.toLowerCase().replace(/\s+/g, '-'), name: s, subjectId: s, questionCount: per,
      }));
      return { list: this.reconcileCount(list, args.totalQuestions), official: false };
    }

    // 4) UNKNOWN: nothing to structure by — one unlabelled section. The mixer still works; it
    // just cannot claim a subject breakdown that doesn't exist for this exam yet.
    return { list: [{ sectionId: 'general', name: 'General', questionCount: args.totalQuestions }], official: false };
  }

  private collectByType(node: any, type: string): any[] {
    const out: any[] = [];
    if (node?.type === type) out.push(node);
    for (const c of node?.children || []) out.push(...this.collectByType(c, type));
    return out;
  }

  /** Rounding across sections can drift from the requested total by a question or two — correct
   *  the largest section rather than leave the blueprint silently short or over. */
  private reconcileCount(sections: SectionBlueprint[], total: number): SectionBlueprint[] {
    if (sections.length === 0) return sections;
    const sum = sections.reduce((s, sec) => s + sec.questionCount, 0);
    const diff = total - sum;
    if (diff === 0) return sections;
    const idx = sections.reduce((maxI, sec, i, arr) => sec.questionCount > arr[maxI].questionCount ? i : maxI, 0);
    sections[idx] = { ...sections[idx], questionCount: Math.max(0, sections[idx].questionCount + diff) };
    return sections;
  }
}

export const blueprintResolverService = new BlueprintResolverService();
