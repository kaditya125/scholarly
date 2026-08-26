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
/**
 * The leaf level, and deliberately RECURSIVE.
 *
 * A fixed ladder of level names cannot describe real syllabi. SSC CGL 2026 Paper-III prints
 * "General Studies-Finance and Economics > Part A: Finance and Accounts > Fundamental principles
 * ... > Financial Accounting > Nature and scope" — seven levels, and nothing guarantees the next
 * notice stops there. Rather than invent a name for each new depth (SUB_SUBTOPIC and onward),
 * the leaf nests into itself, so arbitrary official nesting is representable without changing
 * the vocabulary again.
 */
export interface ExamSubtopic {
  subtopicId: string; // e.g. "ssc_cgl_quant_algebra_identities"
  name: string;
  order: number;
  description?: string;
  officialSourceRef?: string;
  /** Present only where the document nests below this point. */
  subtopics?: ExamSubtopic[];
}

/** Every subtopic under a node, flattened depth-first with its printed nesting preserved. */
export function flattenSubtopics(
  subtopics: ExamSubtopic[] | undefined,
  depth = 0,
): Array<{ subtopic: ExamSubtopic; depth: number }> {
  return (subtopics || []).flatMap((subtopic) => [
    { subtopic, depth },
    ...flattenSubtopics(subtopic.subtopics, depth + 1),
  ]);
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

/**
 * An OPTIONAL grouping of subjects inside a paper.
 *
 * Most exams go straight from paper to subject, and for those this level is simply absent. Some
 * do not: SSC CGL Tier-II prints "Tier | Paper | Session | Subject" as its own column headers and
 * groups subjects into "Section-I"/"Section-II", each carrying its own sectional timing and
 * qualifying marks. Those are real exam mechanics a candidate is assessed on, so flattening a
 * section into its subjects would discard something the official document actually states.
 *
 * When `sections` is present, `subjects` on the paper is empty and every subject hangs off a
 * section. Use `eachSubjectOfPaper` rather than reading either field directly — a consumer that
 * reads `paper.subjects` alone silently sees nothing for a sectioned paper.
 */
export interface ExamSection {
  sectionId: string; // e.g. "section_1"
  name: string; // e.g. "Section-I"
  order: number;
  description?: string;
  subjects: ExamSubject[];
}

export interface ExamPaper {
  paperId: string; // e.g. "paper_1"
  name: string;
  order: number;
  description?: string;
  subjects: ExamSubject[];
  /** Present only when the official document groups this paper's subjects into sections. */
  sections?: ExamSection[];
}

/**
 * Every subject in a paper, whether or not the paper is divided into sections.
 *
 * One place knows the optional-section rule so no caller has to remember it.
 */
export function eachSubjectOfPaper(
  paper: ExamPaper,
): Array<{ subject: ExamSubject; section?: ExamSection }> {
  if (paper.sections?.length) {
    return paper.sections.flatMap((section) =>
      (section.subjects || []).map((subject) => ({ subject, section })));
  }
  return (paper.subjects || []).map((subject) => ({ subject }));
}

/*
 * ── The canonical syllabus shape ──────────────────────────────────────────────────────────
 *
 * A syllabus is a TREE OF TYPED NODES, not a fixed ladder of stage>paper>subject>topic>subtopic.
 *
 * The ladder was tried and it does not survive contact with real documents. SSC CGL 2026 alone
 * breaks it three separate ways: Tier-I lists four subjects with no paper level at all; Tier-II
 * Paper-I groups subjects into Sections; Paper-III nests seven deep. Each is legitimate, and each
 * is the commission describing its own exam. A model that demands every rung be present can only
 * represent such a document by inventing levels it does not contain.
 *
 * So the rule is a RANK ORDER rather than a chain: a child must be strictly deeper than its
 * parent, and levels may be skipped freely. SUBTOPIC is the one exception — it may contain
 * SUBTOPIC, which is what lets arbitrary official nesting be represented without inventing a new
 * type name for every additional depth.
 */
export type SyllabusNodeType = 'STAGE' | 'PAPER' | 'SECTION' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC';

export const SYLLABUS_NODE_RANK: Record<SyllabusNodeType, number> = {
  STAGE: 0, PAPER: 1, SECTION: 2, SUBJECT: 3, TOPIC: 4, SUBTOPIC: 5,
};

/** May a node of type `child` hang directly off a node of type `parent`? */
export function isValidSyllabusNesting(parent: SyllabusNodeType, child: SyllabusNodeType): boolean {
  if (parent === 'SUBTOPIC') return child === 'SUBTOPIC';
  /*
   * SECTION is a GROUPING construct, not a fixed tier.
   *
   * SSC CGL prints "Section-I" between a paper and its subjects. NEET prints "Physical Chemistry",
   * "Inorganic Chemistry", "Organic Chemistry" between the Chemistry subject and its units. Both
   * are an authority describing its own paper, and pinning SECTION to one rank rejects whichever
   * one it was not pinned to — NEET failed validation on exactly these three nodes.
   *
   * So it may sit under a stage, a paper, or a subject. It still may not contain another section,
   * which keeps the level from nesting into itself indefinitely.
   */
  if (child === 'SECTION') return parent === 'STAGE' || parent === 'PAPER' || parent === 'SUBJECT';
  return SYLLABUS_NODE_RANK[child] > SYLLABUS_NODE_RANK[parent];
}

export interface SyllabusNode {
  /** Canonical, derived id. Never the slug printed in the source document. */
  nodeId: string;
  type: SyllabusNodeType;
  /** Official name exactly as printed. */
  name: string;
  order: number;
  description?: string;
  officialSourceRef?: string;
  marks?: number;
  durationMinutes?: number;
  questionCount?: number;
  children: SyllabusNode[];
}

/** Depth-first walk, handing each node its ancestor names. */
export function walkSyllabusNodes(
  nodes: SyllabusNode[] | undefined,
  visit: (node: SyllabusNode, parentPath: string[], parent?: SyllabusNode) => void,
  parentPath: string[] = [],
  parent?: SyllabusNode,
): void {
  for (const node of nodes || []) {
    visit(node, parentPath, parent);
    walkSyllabusNodes(node.children, visit, [...parentPath, node.name], node);
  }
}

/** Every node of a given type, in document order. */
export function syllabusNodesOfType(nodes: SyllabusNode[] | undefined, type: SyllabusNodeType): SyllabusNode[] {
  const out: SyllabusNode[] = [];
  walkSyllabusNodes(nodes, (n) => { if (n.type === type) out.push(n); });
  return out;
}

export interface ExamStage {
  stageId: string; // e.g. "tier_1", "tier_2", "prelims", "mains"
  name: string; // e.g. "Tier I (Computer Based Examination)"
  order: number;
  description?: string;
  papers: ExamPaper[];
}

/**
 * Legacy nested shape -> canonical node tree.
 *
 * Kept because fixtures and older records describe syllabi as stages/papers/subjects/topics.
 * Anything the nested shape can express, the tree can; the reverse is not true, which is why
 * the tree is canonical and this converts one way only.
 *
 * Incoming *Id slugs are carried across but are NOT canonical identity — buildCanonicalGraph
 * derives ids from type and ancestor path and ignores whatever the document happened to print.
 */
export function fromExamStages(stages: ExamStage[] | undefined): SyllabusNode[] {
  const subtopic = (st: ExamSubtopic, i: number): SyllabusNode => ({
    nodeId: st.subtopicId, type: 'SUBTOPIC', name: st.name, order: st.order ?? i + 1,
    description: st.description, officialSourceRef: st.officialSourceRef,
    children: (st.subtopics || []).map(subtopic),
  });
  const topic = (t: ExamTopic, i: number): SyllabusNode => ({
    nodeId: t.topicId, type: 'TOPIC', name: t.name, order: t.order ?? i + 1,
    description: t.description, officialSourceRef: t.officialSourceRef,
    children: (t.subtopics || []).map(subtopic),
  });
  const subject = (sj: ExamSubject, i: number): SyllabusNode => ({
    nodeId: sj.subjectId, type: 'SUBJECT', name: sj.name, order: sj.order ?? i + 1,
    marks: sj.marks, durationMinutes: sj.durationMinutes, questionCount: sj.questionCount,
    children: (sj.topics || []).map(topic),
  });
  const section = (sc: ExamSection, i: number): SyllabusNode => ({
    nodeId: sc.sectionId, type: 'SECTION', name: sc.name, order: sc.order ?? i + 1,
    description: sc.description, children: (sc.subjects || []).map(subject),
  });
  const paper = (p: ExamPaper, i: number): SyllabusNode => ({
    nodeId: p.paperId, type: 'PAPER', name: p.name, order: p.order ?? i + 1,
    description: p.description,
    children: p.sections?.length ? p.sections.map(section) : (p.subjects || []).map(subject),
  });
  return (stages || []).map((st, i) => ({
    nodeId: st.stageId, type: 'STAGE' as const, name: st.name, order: st.order ?? i + 1,
    description: st.description, children: (st.papers || []).map(paper),
  }));
}

/**
 * The node tree for a syllabus, whichever shape it was stored in.
 *
 * Every consumer should go through this rather than reading either field, so that a record
 * written in the legacy shape can never be read as an empty syllabus.
 */
export function syllabusNodesOf(syllabus: { nodes?: SyllabusNode[]; stages?: ExamStage[] }): SyllabusNode[] {
  return syllabus.nodes?.length ? syllabus.nodes : fromExamStages(syllabus.stages);
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
  /**
   * CANONICAL structure. A tree of typed nodes that may skip levels — see SyllabusNode.
   */
  nodes?: SyllabusNode[];
  /** @deprecated Legacy nested shape. Read via `syllabusNodesOf`, never directly. */
  stages?: ExamStage[];
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
