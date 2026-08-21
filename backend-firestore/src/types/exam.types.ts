/**
 * Sadhya — Exam Intelligence Types
 * Canonical Data Models for Exam Master Registry, Cycles, Official Sources, and Versioned Syllabi.
 */

export type ExamCategory =
  | 'UPSC'
  | 'SSC'
  | 'BANKING'
  | 'RAILWAY'
  | 'DEFENCE'
  | 'TEACHING'
  | 'STATE_PSC'
  | 'ENGINEERING'
  | 'MEDICAL'
  | 'LAW'
  | 'JUDICIARY'
  | 'ENTRANCE'
  | 'OTHER';

export type ExamStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type ExamCycleStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

/**
 * Syllabus version lifecycle.
 *
 * The forward path mirrors what has to happen in the world — a source is located, the document is
 * retrieved and hashed, extraction runs, structure is validated, and only then may the version
 * claim to be the authoritative one. See syllabusLifecycle.ts for the transition allowlist and the
 * preconditions CURRENT requires.
 *
 * DRAFT is retained for records created before this lifecycle existed; new records should enter at
 * DISCOVERED. UNAVAILABLE and INVALID are deliberately distinct: the first means we could not get
 * the document (retry the fetch), the second means we have it and extraction or validation failed
 * (retrying the fetch will not help).
 */
export type SyllabusStatus =
  | 'DRAFT'
  | 'DISCOVERED'
  | 'FETCHED'
  | 'VALIDATING'
  | 'VERIFIED'
  | 'CURRENT'
  | 'SUPERSEDED'
  | 'UNAVAILABLE'
  | 'INVALID'
  | 'ARCHIVED';

export type OfficialSourceType =
  | 'AUTHORITY_HOME'
  | 'EXAM_PORTAL'
  | 'SYLLABUS'
  | 'NOTIFICATION'
  | 'APPLICATION'
  | 'ADMIT_CARD'
  | 'RESULT'
  | 'VACANCY'
  | 'OTHER';

/**
 * Canonical verified official URLs for an exam.
 */
export interface VerifiedOfficialUrls {
  authorityHome: string;
  examPortal?: string;
  syllabusPage?: string;
  notificationPage?: string;
  applicationPortal?: string;
  admitCardPortal?: string;
  resultPortal?: string;
}

/**
 * 1. ExamMaster — Canonical registry entry for an examination.
 */
export interface ExamMaster {
  examId: string; // Canonical slug e.g. "SSC_CGL", "UPSC_CSE", "NEET_UG"
  name: string; // Full official title e.g. "Staff Selection Commission — Combined Graduate Level"
  shortName: string; // e.g. "SSC CGL"
  conductingAuthority: string; // e.g. "Staff Selection Commission"
  category: ExamCategory;
  country: 'IN';
  aliases: string[]; // e.g. ["SSC CGL", "SSC-CGL", "CGL", "Combined Graduate Level"]
  officialDomains: string[]; // Whitelisted official hostnames e.g. ["ssc.gov.in", "ssc.nic.in"]
  currentCycle?: string; // Default/active cycle ID e.g. "2026"
  activeSyllabusVersionId?: string; // Pointer to current canonical syllabus doc ID
  verifiedOfficialUrls: VerifiedOfficialUrls;
  status: ExamStatus;
  description?: string;
  eligibilitySummary?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 2. ExamCycle — A specific iteration / year of an examination.
 */
export interface ExamCycle {
  cycleId: string; // e.g. "2026", "2025"
  examId: string; // Canonical examId foreign key
  label: string; // e.g. "SSC CGL 2026 Examination Cycle"
  year: string; // e.g. "2026"
  status: ExamCycleStatus;
  activeSyllabusVersionId?: string;
  notificationDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  tentativeExamDate?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 3. ExamOfficialSource — Registered and verified official source link.
 */
export interface ExamOfficialSource {
  sourceId: string;
  examId: string;
  cycleId?: string;
  sourceType: OfficialSourceType;
  url: string;
  domain: string; // Normalized hostname e.g. "ssc.gov.in"
  title?: string;
  authority: string;
  verified: boolean;
  verificationMethod?: 'DOMAIN_MATCH' | 'MANUAL_ADMIN' | 'CRYPTOGRAPHIC_SIGNATURE';
  lastVerifiedAt?: number;
  active: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 4. Canonical Syllabus Hierarchy Sub-Entities
 */
export interface ExamSubtopic {
  subtopicId: string; // e.g. "ssc_cgl_quant_algebra_identities"
  name: string;
  order: number;
  description?: string;
  officialSourceRef?: string;
}

export interface ExamTopic {
  topicId: string; // e.g. "ssc_cgl_quant_algebra"
  name: string;
  order: number;
  description?: string;
  officialSourceRef?: string;
  subtopics: ExamSubtopic[];
}

export interface ExamSubject {
  subjectId: string; // e.g. "quantitative_aptitude"
  name: string;
  order: number;
  marks?: number;
  durationMinutes?: number;
  questionCount?: number;
  topics: ExamTopic[];
}

export interface ExamPaper {
  paperId: string; // e.g. "paper_1"
  name: string;
  order: number;
  description?: string;
  subjects: ExamSubject[];
}

export interface ExamStage {
  stageId: string; // e.g. "tier_1", "tier_2", "prelims", "mains"
  name: string; // e.g. "Tier I (Computer Based Examination)"
  order: number;
  description?: string;
  papers: ExamPaper[];
}

/**
 * 5. ExamSyllabus — Versioned Official Syllabus Document.
 */
export interface ExamSyllabus {
  syllabusId: string; // e.g. "syl_ssc_cgl_2026_v1"
  examId: string;
  cycleId: string;
  version: string; // e.g. "2026-v1"
  authority: string;
  status: SyllabusStatus;
  sourceDocumentId?: string;
  /**
   * The official PAGE the document was discovered on, when that differs from the document itself
   * (a notifications index linking to a PDF). Optional and distinct from sourceDocumentUrl — the
   * document URL is what was actually retrieved and hashed.
   */
  sourceUrl?: string;
  sourceDocumentUrl: string;
  /** Official title as printed on the document, so a human can confirm the right file was used. */
  sourceDocumentTitle?: string;
  sourceDocumentType?: OfficialSourceType;
  /**
   * SHA-256 of the retrieved document bytes.
   *
   * Must be a real digest of real content. `validateProvenance` rejects the SHA-256 of the empty
   * string specifically, because production shipped exactly that as the provenance of a CURRENT
   * syllabus: a syntactically perfect hash of nothing at all.
   */
  sourceDocumentHash: string;
  storagePath?: string; // Firebase Storage path e.g. "exam_documents/SSC_CGL/2026/syllabus_v1.pdf"
  storageDownloadUrl?: string; // Firebase Storage download URL
  /** When the source document was actually fetched. Distinct from when it was parsed. */
  retrievedAt?: number;
  extractedAt: number;
  /** When structural validation passed. NOT the moment of publication — see publishedAt. */
  verifiedAt?: number;
  /** When this version became CURRENT. Kept separate so "verified" never means "published". */
  publishedAt?: number;
  /** Set when the version is withdrawn from authoritative use. Never cleared — this is history. */
  invalidatedAt?: number;
  invalidationReason?: SyllabusInvalidationReason;
  invalidationDetail?: string;
  stages: ExamStage[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 6. Audit Trail for Administrative Actions
 */
export type ExamAuditEventType =
  | 'EXAM_CREATED'
  | 'EXAM_UPDATED'
  | 'EXAM_ARCHIVED'
  | 'CYCLE_CREATED'
  | 'CYCLE_UPDATED'
  | 'SOURCE_ADDED'
  | 'SOURCE_VERIFIED'
  | 'SOURCE_REVOKED'
  | 'SYLLABUS_CREATED'
  | 'SYLLABUS_APPROVED'
  | 'SYLLABUS_PUBLISHED'
  | 'SYLLABUS_SUPERSEDED'
  /** A version was withdrawn from authoritative use because its provenance cannot be established. */
  | 'SYLLABUS_INVALIDATED';

/**
 * Why a syllabus version was invalidated. Machine-readable so the reason survives as data rather
 * than as prose in a log line nobody can query.
 */
export type SyllabusInvalidationReason =
  /** Provenance fields are absent or internally inconsistent. */
  | 'INVALID_PROVENANCE'
  /** sourceDocumentHash is the SHA-256 of an empty document — nothing was ever retrieved. */
  | 'EMPTY_DOCUMENT_HASH'
  /** Created by the pre-provenance seed path and never verified against an official source. */
  | 'LEGACY_SEED_UNVERIFIED'
  /** The retrieved document no longer matches the recorded hash. */
  | 'SOURCE_DOCUMENT_MISMATCH'
  /** Extraction produced a structurally invalid canonical graph. */
  | 'GRAPH_VALIDATION_FAILED';

export interface ExamAuditRecord {
  id: string;
  eventType: ExamAuditEventType;
  examId: string;
  cycleId?: string;
  entityId: string;
  performedBy: string; // User ID or system identifier
  details: Record<string, any>;
  timestamp: number;
}

/**
 * 7. Phase 3: Official Notification, Timeline, Vacancy & Eligibility Types
 */

export type OfficialNotificationType =
  | 'ADV_NOTIFICATION'
  | 'CORRIGENDUM'
  | 'EXAM_DATE_NOTICE'
  | 'ADMIT_CARD_NOTICE'
  | 'ANSWER_KEY_NOTICE'
  | 'RESULT_NOTICE'
  | 'VACANCY_UPDATE';

export interface ExamImportantDates {
  notificationReleaseDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  feePaymentDeadline?: string;
  correctionWindow?: { startDate: string; endDate: string };
  admitCardDate?: string;
  examStagesDates?: {
    stageId: string;
    stageName: string;
    startDate: string;
    endDate?: string;
    shiftDetails?: string;
  }[];
  answerKeyDate?: string;
  resultDate?: string;
}

export interface PostVacancy {
  postCode: string;
  postName: string;
  department: string;
  payLevel?: number;
  vacancies: number;
  ageLimit?: { min: number; max: number };
  qualifications?: string;
}

export interface ExamVacancies {
  total: number;
  isTentative: boolean;
  breakdownByCategory?: {
    UR?: number;
    OBC?: number;
    SC?: number;
    ST?: number;
    EWS?: number;
    PwD?: number;
    ESM?: number;
  };
  breakdownByPost?: PostVacancy[];
}

export interface AgeRelaxationRule {
  category: string; // e.g. "OBC", "SC", "ST", "PwD", "Ex-Servicemen"
  years: number; // e.g. 3, 5, 10
  condition?: string;
}

export interface ExamEligibilityCriteria {
  ageLimit: {
    min: number;
    max: number;
    asOnDate: string; // e.g. "2026-08-01"
    relaxations?: AgeRelaxationRule[];
  };
  educationalQualifications: {
    minimumDegree: string; // e.g. "Bachelor's Degree", "10+2", "Class 10"
    specificRequirements?: string[];
    cutoffDate?: string; // e.g. "2026-08-01"
  };
  nationality?: string[]; // e.g. ["Citizen of India", "Subject of Nepal", "Subject of Bhutan"]
  attemptLimit?: {
    default: number;
    categoryRelaxations?: Record<string, number>;
  };
}

export interface ExamFeeStructure {
  general: number;
  reserved: number;
  female: number;
  paymentModes?: string[];
}

export interface ExamOfficialNotification {
  notificationId: string; // e.g. "notif_ssc_cgl_2026_adv1"
  examId: string;
  cycleId: string;
  notificationType: OfficialNotificationType;
  advtNumber?: string; // Official Advt Number e.g. "F.No. 3/1/2026-P&P-I"
  title: string;
  publishDate: number;
  sourceUrl: string;
  sourceDocumentHash: string; // SHA-256
  storagePath?: string; // Firebase Storage path e.g. "exam_documents/SSC_CGL/2026/notice_adv1.pdf"
  storageDownloadUrl?: string; // Firebase Storage download URL
  importantDates: ExamImportantDates;
  vacancies?: ExamVacancies;
  eligibility?: ExamEligibilityCriteria;
  feeStructure?: ExamFeeStructure;
  status: 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED';
  createdAt: number;
  updatedAt: number;
}

export interface StudentEligibilityInput {
  dob: string; // "YYYY-MM-DD" e.g. "2001-05-15"
  category: string; // "UR", "OBC", "SC", "ST", "EWS", "PwD", "ESM"
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  highestQualification: string; // e.g. "Bachelor of Technology", "Class 12"
  hasDegreeCompleted: boolean;
  degreeCompletionDate?: string;
}

export interface StudentEligibilityEvaluation {
  isEligible: boolean;
  reasons: string[];
  calculatedAge: number; // Age as on cutoff date (e.g. 24.5)
  cutoffDate: string;
  categoryRelaxationYears: number;
  applicableMaxAge: number;
  feeAmount: number;
  eligiblePosts: string[];
  ineligiblePosts: { postName: string; reason: string }[];
}

export interface ExamTimelineCountdown {
  examId: string;
  cycleId: string;
  currentStage: string;
  daysRemaining?: number;
  status: 'UPCOMING' | 'ONGOING' | 'PASSED' | 'TENTATIVE';
  targetDate: string;
  label: string;
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
