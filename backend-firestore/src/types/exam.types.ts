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

export type SyllabusStatus = 'DRAFT' | 'VERIFIED' | 'CURRENT' | 'SUPERSEDED' | 'ARCHIVED';

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
  sourceDocumentUrl: string;
  sourceDocumentHash: string; // SHA-256 hash of the official source
  storagePath?: string; // Firebase Storage path e.g. "exam_documents/SSC_CGL/2026/syllabus_v1.pdf"
  storageDownloadUrl?: string; // Firebase Storage download URL
  extractedAt: number;
  verifiedAt?: number;
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
  | 'SYLLABUS_SUPERSEDED';

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
