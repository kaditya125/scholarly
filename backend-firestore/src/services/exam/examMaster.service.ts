/**
 * ExamMasterService — Central Business Logic for Exam Intelligence
 * Manages canonical exam records, alias resolution, official source verification,
 * and versioned syllabus lifecycles.
 */

import * as crypto from 'crypto';
import {
  ExamMaster,
  ExamCategory,
  ExamStatus,
  ExamCycle,
  ExamOfficialSource,
  ExamSyllabus,
  OfficialSourceType,
} from '../../types/exam.types';
import { examRepository, ExamRepository } from '../../repositories/exam.repository';
import { officialSourceVerificationService, OfficialSourceVerificationService } from './officialSourceVerification.service';
import { CANONICAL_EXAM_SEEDS } from './canonicalExamSeeds';

export interface CreateExamDto {
  examId: string;
  name: string;
  shortName: string;
  conductingAuthority: string;
  category: ExamCategory;
  aliases?: string[];
  officialDomains: string[];
  currentCycle?: string;
  verifiedOfficialUrls?: Partial<ExamMaster['verifiedOfficialUrls']>;
  description?: string;
  eligibilitySummary?: string;
}

export interface CreateCycleDto {
  cycleId: string;
  label: string;
  year: string;
  status?: ExamCycle['status'];
  notificationDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  tentativeExamDate?: string;
}

export interface CreateOfficialSourceDto {
  cycleId?: string;
  sourceType: OfficialSourceType;
  url: string;
  title?: string;
  notes?: string;
}

export interface CreateSyllabusDto {
  version: string;
  authority?: string;
  sourceDocumentUrl: string;
  sourceDocumentHash?: string;
  sourceDocumentId?: string;
  stages: ExamSyllabus['stages'];
  notes?: string;
}

export class ExamMasterService {
  constructor(
    private repository: ExamRepository = examRepository,
    private verifier: OfficialSourceVerificationService = officialSourceVerificationService
  ) {}

  // ─── 1. Canonical Exam Operations ──────────────────────────────────────────

  async createExam(dto: CreateExamDto, performedBy: string): Promise<ExamMaster> {
    // 1. Canonical ID formatting
    const examId = dto.examId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!examId) throw new Error('examId must be a valid non-empty identifier');

    // 2. Check for duplicate ID
    const existing = await this.repository.getExamById(examId);
    if (existing) {
      throw new Error(`Exam with ID '${examId}' already exists`);
    }

    // 3. Normalize aliases
    const aliases = Array.from(
      new Set(
        [dto.shortName, dto.name, ...(dto.aliases || [])]
          .map((a) => a.trim())
          .filter(Boolean)
      )
    );

    // 4. Normalize domains
    const officialDomains = Array.from(
      new Set(
        dto.officialDomains
          .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
          .filter(Boolean)
      )
    );

    const now = Date.now();
    const exam: ExamMaster = {
      examId,
      name: dto.name.trim(),
      shortName: dto.shortName.trim(),
      conductingAuthority: dto.conductingAuthority.trim(),
      category: dto.category,
      country: 'IN',
      aliases,
      officialDomains,
      currentCycle: dto.currentCycle?.trim() || new Date().getFullYear().toString(),
      verifiedOfficialUrls: {
        authorityHome: dto.verifiedOfficialUrls?.authorityHome || '',
        examPortal: dto.verifiedOfficialUrls?.examPortal,
        syllabusPage: dto.verifiedOfficialUrls?.syllabusPage,
        notificationPage: dto.verifiedOfficialUrls?.notificationPage,
        applicationPortal: dto.verifiedOfficialUrls?.applicationPortal,
        admitCardPortal: dto.verifiedOfficialUrls?.admitCardPortal,
        resultPortal: dto.verifiedOfficialUrls?.resultPortal,
      },
      status: 'ACTIVE',
      description: dto.description?.trim(),
      eligibilitySummary: dto.eligibilitySummary?.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createExam(exam);

    // Also auto-create initial cycle
    if (exam.currentCycle) {
      await this.repository.createCycle({
        cycleId: exam.currentCycle,
        examId,
        label: `${exam.shortName} ${exam.currentCycle}`,
        year: exam.currentCycle,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.repository.logAudit({
      id: `audit_${now}_${examId}`,
      eventType: 'EXAM_CREATED',
      examId,
      entityId: examId,
      performedBy,
      details: { examId, name: exam.name, category: exam.category },
      timestamp: now,
    });

    return exam;
  }

  async getExam(examId: string): Promise<ExamMaster | null> {
    const normalized = examId.trim().toUpperCase();
    const found = await this.repository.getExamById(normalized);
    if (found) return found;

    const seed = CANONICAL_EXAM_SEEDS[normalized];
    if (seed) {
      this.seedExamIfMissing(normalized).catch(() => {});
      return seed.exam;
    }
    return null;
  }

  async listExams(filter?: { category?: ExamCategory; status?: ExamStatus }): Promise<ExamMaster[]> {
    const list = await this.repository.listExams(filter);
    if (list.length > 0) return list;

    const seeds = Object.values(CANONICAL_EXAM_SEEDS).map((s) => s.exam);
    let filtered = seeds;
    if (filter?.category) filtered = filtered.filter((e) => e.category === filter.category);
    if (filter?.status) filtered = filtered.filter((e) => e.status === filter.status);
    return filtered;
  }

  private async seedExamIfMissing(examId: string): Promise<void> {
    const seed = CANONICAL_EXAM_SEEDS[examId];
    if (!seed) return;
    try {
      await this.repository.createExam(seed.exam);
      if (seed.cycle) await this.repository.createCycle(seed.cycle);
      if (seed.syllabus) await this.repository.createSyllabus(seed.syllabus);
      if (seed.sources) {
        for (const src of seed.sources) {
          await this.repository.createOfficialSource(src);
        }
      }
    } catch {
      // Non-blocking background seed
    }
  }

  async updateExam(examId: string, updates: Partial<ExamMaster>, performedBy: string): Promise<ExamMaster> {
    const existing = await this.getExam(examId);
    if (!existing) throw new Error(`Exam '${examId}' not found`);

    await this.repository.updateExam(examId, updates);
    const updated = (await this.repository.getExamById(examId)) || { ...existing, ...updates };

    await this.repository.logAudit({
      id: `audit_${Date.now()}_${examId}`,
      eventType: 'EXAM_UPDATED',
      examId,
      entityId: examId,
      performedBy,
      details: updates,
      timestamp: Date.now(),
    });

    return updated;
  }

  /**
   * Resolves a student's free-text goal or legacy targetExam string to a canonical ExamMaster record.
   * e.g. "SSC CGL", "cgl", "ssc-cgl", "Combined Graduate Level" -> ExamMaster (SSC_CGL)
   */
  async resolveExam(query: string): Promise<ExamMaster | null> {
    if (!query || typeof query !== 'string') return null;
    const found = await this.repository.findExamByAlias(query);
    if (found) return found;

    const normalized = query.trim().toLowerCase();
    const seedMatch = Object.values(CANONICAL_EXAM_SEEDS).find((s) => {
      if (s.exam.examId.toLowerCase() === normalized) return true;
      if (s.exam.shortName.toLowerCase() === normalized) return true;
      if (s.exam.name.toLowerCase() === normalized) return true;
      if (s.exam.aliases && s.exam.aliases.some((a) => a.toLowerCase() === normalized)) return true;
      return false;
    });

    return seedMatch ? seedMatch.exam : null;
  }

  // ─── 2. Exam Cycle Operations ──────────────────────────────────────────────

  async createCycle(examId: string, dto: CreateCycleDto, performedBy: string): Promise<ExamCycle> {
    const exam = await this.repository.getExamById(examId);
    if (!exam) throw new Error(`Exam '${examId}' not found`);

    const cycleId = dto.cycleId.trim();
    const existingCycle = await this.repository.getCycle(examId, cycleId);
    if (existingCycle) {
      throw new Error(`Cycle '${cycleId}' already exists for exam '${examId}'`);
    }

    const now = Date.now();
    const cycle: ExamCycle = {
      cycleId,
      examId,
      label: dto.label.trim() || `${exam.shortName} ${cycleId}`,
      year: dto.year.trim() || cycleId,
      status: dto.status || 'ACTIVE',
      notificationDate: dto.notificationDate,
      applicationStartDate: dto.applicationStartDate,
      applicationEndDate: dto.applicationEndDate,
      tentativeExamDate: dto.tentativeExamDate,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createCycle(cycle);

    await this.repository.logAudit({
      id: `audit_${now}_${examId}_${cycleId}`,
      eventType: 'CYCLE_CREATED',
      examId,
      cycleId,
      entityId: cycleId,
      performedBy,
      details: cycle,
      timestamp: now,
    });

    return cycle;
  }

  async listCycles(examId: string): Promise<ExamCycle[]> {
    const normalized = examId.trim().toUpperCase();
    const cycles = await this.repository.listCycles(normalized);
    if (cycles.length > 0) return cycles;

    const seed = CANONICAL_EXAM_SEEDS[normalized];
    return seed?.cycle ? [seed.cycle] : [];
  }

  // ─── 3. Official Source Operations ─────────────────────────────────────────

  async addOfficialSource(
    examId: string,
    dto: CreateOfficialSourceDto,
    performedBy: string
  ): Promise<ExamOfficialSource> {
    const exam = await this.getExam(examId);
    if (!exam) throw new Error(`Exam '${examId}' not found`);

    // Verification check against registered official domains
    const verification = this.verifier.verifyOfficialSource(exam, dto.url);

    const now = Date.now();
    const sourceId = `src_${crypto.randomUUID().slice(0, 12)}`;

    const source: ExamOfficialSource = {
      sourceId,
      examId,
      cycleId: dto.cycleId,
      sourceType: dto.sourceType,
      url: verification.normalizedUrl,
      domain: verification.domain,
      title: dto.title?.trim() || `${exam.shortName} Official ${dto.sourceType}`,
      authority: exam.conductingAuthority,
      verified: verification.isOfficial,
      verificationMethod: verification.isOfficial ? 'DOMAIN_MATCH' : undefined,
      lastVerifiedAt: verification.isOfficial ? now : undefined,
      active: true,
      notes: dto.notes || (verification.isOfficial ? 'Verified via registered domain whitelist' : verification.rejectionReason),
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createOfficialSource(source);

    await this.repository.logAudit({
      id: `audit_${now}_${sourceId}`,
      eventType: 'SOURCE_ADDED',
      examId,
      cycleId: dto.cycleId,
      entityId: sourceId,
      performedBy,
      details: { url: source.url, verified: source.verified, domain: source.domain },
      timestamp: now,
    });

    return source;
  }

  async listOfficialSources(
    examId: string,
    filter?: { activeOnly?: boolean; verifiedOnly?: boolean }
  ): Promise<ExamOfficialSource[]> {
    const normalized = examId.trim().toUpperCase();
    const sources = await this.repository.listOfficialSources(normalized, filter);
    if (sources.length > 0) return sources;

    const seed = CANONICAL_EXAM_SEEDS[normalized];
    return seed?.sources ? seed.sources : [];
  }

  // ─── 4. Versioned Syllabus Operations ──────────────────────────────────────

  async createSyllabusVersion(
    examId: string,
    cycleId: string,
    dto: CreateSyllabusDto,
    performedBy: string
  ): Promise<ExamSyllabus> {
    const exam = await this.getExam(examId);
    if (!exam) throw new Error(`Exam '${examId}' not found`);

    const version = dto.version.trim();
    const syllabusId = `syl_${examId.toLowerCase()}_${cycleId}_${version.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    const existing = await this.repository.getSyllabusById(syllabusId);
    if (existing) {
      throw new Error(`Syllabus version '${version}' already exists for ${examId} ${cycleId}`);
    }

    // Generate content hash if not provided
    const contentHash =
      dto.sourceDocumentHash ||
      crypto.createHash('sha256').update(JSON.stringify(dto.stages) + dto.sourceDocumentUrl).digest('hex');

    const now = Date.now();
    const syllabus: ExamSyllabus = {
      syllabusId,
      examId,
      cycleId,
      version,
      authority: dto.authority || exam.conductingAuthority,
      status: 'DRAFT',
      sourceDocumentId: dto.sourceDocumentId,
      sourceDocumentUrl: dto.sourceDocumentUrl,
      sourceDocumentHash: contentHash,
      extractedAt: now,
      stages: dto.stages || [],
      notes: dto.notes,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createSyllabus(syllabus);

    await this.repository.logAudit({
      id: `audit_${now}_${syllabusId}`,
      eventType: 'SYLLABUS_CREATED',
      examId,
      cycleId,
      entityId: syllabusId,
      performedBy,
      details: { version, stageCount: syllabus.stages.length },
      timestamp: now,
    });

    return syllabus;
  }

  async publishSyllabusVersion(
    examId: string,
    cycleId: string,
    syllabusId: string,
    performedBy: string
  ): Promise<void> {
    await this.repository.publishSyllabusVersion(examId, cycleId, syllabusId, performedBy);
  }

  async getCurrentSyllabus(examId: string, cycleId?: string): Promise<ExamSyllabus | null> {
    const normalized = examId.trim().toUpperCase();
    const exam = await this.getExam(normalized);
    if (!exam) return null;

    const targetCycle = cycleId || exam.currentCycle || new Date().getFullYear().toString();
    const found = await this.repository.getCurrentSyllabus(normalized, targetCycle);
    if (found) return found;

    const seed = CANONICAL_EXAM_SEEDS[normalized];
    if (seed && seed.syllabus) {
      return seed.syllabus;
    }
    return null;
  }

  async listSyllabi(examId: string, cycleId?: string): Promise<ExamSyllabus[]> {
    const normalized = examId.trim().toUpperCase();
    const syllabi = await this.repository.listSyllabi(normalized, cycleId);
    if (syllabi.length > 0) return syllabi;

    const seed = CANONICAL_EXAM_SEEDS[normalized];
    return seed?.syllabus ? [seed.syllabus] : [];
  }
}

export const examMasterService = new ExamMasterService();
