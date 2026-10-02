/**
 * Exam → avatar mapping for the dashboard greeting.
 *
 * Source: the exam-branded set in D:\scholarly\social-kit (each student holds a book or stands
 * at a board with the exam's name on it). Most of those files are RGB with a fake checkerboard
 * painted into the pixels, so every one was cut out to real alpha, trimmed to its content and
 * exported as ~100KB WebP in frontend/public/avatars/<key>.webp. `ratio` (width ÷ height) is the
 * trimmed art's shape; GreetingRobot sizes the slot from it so nothing is cropped.
 *
 * Exams with no dedicated art in the set (NDA, State PSC, CA, CMA, CLAT, GPAT, and unknown
 * goals) use the closest honest match or the generic student — never another profession's image.
 *
 * Deliberately separate from any component: pure data + lookup logic.
 */

const AVATAR_BASE = '/avatars';

/** Canonical avatar keys. Not the same vocabulary as the backend's examId (examIndex.ts) or
 *  TestCenter's exam names (examPersonalization.ts) — this module normalizes both into these. */
export type ExamAvatarKey =
  | 'NEET' | 'JEE_MAIN' | 'JEE_ADVANCED' | 'UPSC_CSE' | 'BPSC' | 'BIHAR_TRE'
  | 'CTET' | 'STET' | 'CUET' | 'IBPS_PO' | 'SBI_PO' | 'RBI_GRADE_B' | 'RRB_NTPC'
  | 'UGC_NET' | 'STATE_PSC' | 'CBSE' | 'ICSE' | 'CA' | 'CMA' | 'CLAT' | 'NDA'
  | 'GPAT' | 'GATE' | 'SSC_CGL' | 'SSC_CHSL' | 'CDS' | 'SCHOOL' | 'DEFAULT';

export const EXAM_AVATAR_MAP: Record<ExamAvatarKey, { file: string; alt: string; ratio: number }> = {
  NEET: { file: 'neet.webp', alt: 'NEET aspirant avatar', ratio: 720/538 },
  JEE_MAIN: { file: 'jee.webp', alt: 'JEE aspirant avatar', ratio: 625/720 },
  JEE_ADVANCED: { file: 'jee.webp', alt: 'JEE aspirant avatar', ratio: 625/720 },
  UPSC_CSE: { file: 'upsc.webp', alt: 'UPSC aspirant avatar', ratio: 720/696 },
  SSC_CGL: { file: 'ssc-cgl.webp', alt: 'SSC CGL aspirant avatar', ratio: 720/590 },
  SSC_CHSL: { file: 'ssc-chsl.webp', alt: 'SSC CHSL aspirant avatar', ratio: 636/720 },
  BPSC: { file: 'bpsc.webp', alt: 'BPSC aspirant avatar', ratio: 720/545 },
  BIHAR_TRE: { file: 'bihar-tre.webp', alt: 'Bihar TRE aspirant avatar', ratio: 637/720 },
  CTET: { file: 'stet-ctet.webp', alt: 'Teacher-eligibility aspirant avatar', ratio: 635/720 },
  STET: { file: 'stet-ctet.webp', alt: 'STET aspirant avatar', ratio: 635/720 },
  UGC_NET: { file: 'ugc-net.webp', alt: 'UGC NET aspirant avatar', ratio: 720/541 },
  IBPS_PO: { file: 'ibps-po.webp', alt: 'IBPS PO aspirant avatar', ratio: 720/537 },
  SBI_PO: { file: 'ibps-po.webp', alt: 'Bank PO aspirant avatar', ratio: 720/537 },
  RBI_GRADE_B: { file: 'rbi-grade-b.webp', alt: 'RBI Grade B aspirant avatar', ratio: 720/638 },
  RRB_NTPC: { file: 'rrb-ntpc.webp', alt: 'RRB NTPC aspirant avatar', ratio: 720/561 },
  CUET: { file: 'cuet.webp', alt: 'CUET aspirant avatar', ratio: 720/635 },
  GATE: { file: 'gate.webp', alt: 'GATE aspirant avatar', ratio: 638/720 },
  CDS: { file: 'cds.webp', alt: 'CDS aspirant avatar', ratio: 720/535 },
  NDA: { file: 'cds.webp', alt: 'Defence aspirant avatar', ratio: 720/535 },
  CBSE: { file: 'cbse-icse.webp', alt: 'CBSE student avatar', ratio: 720/628 },
  ICSE: { file: 'cbse-icse.webp', alt: 'ICSE student avatar', ratio: 720/628 },
  SCHOOL: { file: 'cbse-icse.webp', alt: 'School student avatar', ratio: 720/628 },
  STATE_PSC: { file: 'upsc.webp', alt: 'Civil services aspirant avatar', ratio: 720/696 },
  CA: { file: 'cuet.webp', alt: 'Sadhya student avatar', ratio: 720/635 },
  CMA: { file: 'cuet.webp', alt: 'Sadhya student avatar', ratio: 720/635 },
  CLAT: { file: 'cuet.webp', alt: 'Sadhya student avatar', ratio: 720/635 },
  GPAT: { file: 'cuet.webp', alt: 'Sadhya student avatar', ratio: 720/635 },
  DEFAULT: { file: 'cuet.webp', alt: 'Sadhya student avatar', ratio: 720/635 },
};

/**
 * Raw values seen in the wild → avatar key. Covers both `LearningProfile.goal`/`targetExam`
 * (onboardingOptions.ts — the dashboard's actual source) and TestCenter's exam names
 * (examPersonalization.ts), plus common spelling variants, so this stays correct if either
 * source's vocabulary is later reused here.
 */
const EXAM_ALIASES: Record<string, ExamAvatarKey> = {
  NEET: 'NEET', 'NEET UG': 'NEET', 'NEET-UG': 'NEET',
  'JEE MAIN': 'JEE_MAIN', JEE: 'JEE_MAIN',
  'JEE ADVANCED': 'JEE_ADVANCED',
  UPSC: 'UPSC_CSE', 'UPSC CSE': 'UPSC_CSE', 'UPSC CIVIL SERVICES': 'UPSC_CSE',
  SSC: 'SSC_CGL', 'SSC CGL': 'SSC_CGL',
  'SSC CHSL': 'SSC_CHSL',
  BPSC: 'BPSC', 'BPSC CCE': 'BPSC',
  'TRE BIHAR': 'BIHAR_TRE', 'BIHAR TRE': 'BIHAR_TRE', 'BPSC TRE': 'BIHAR_TRE',
  CTET: 'CTET',
  STET: 'STET', 'BIHAR STET': 'STET',
  'UGC NET': 'UGC_NET', UGCNET: 'UGC_NET', NET: 'UGC_NET',
  'BANKING PO': 'IBPS_PO', 'IBPS PO': 'IBPS_PO', IBPS: 'IBPS_PO',
  'SBI PO': 'SBI_PO',
  'RBI GRADE B': 'RBI_GRADE_B', RBI: 'RBI_GRADE_B',
  'RAILWAY NTPC': 'RRB_NTPC', 'RRB NTPC': 'RRB_NTPC', NTPC: 'RRB_NTPC',
  CUET: 'CUET',
  GATE: 'GATE',
  CDS: 'CDS',
  NDA: 'NDA',
  CBSE: 'CBSE',
  ICSE: 'ICSE',
  'STATE BOARD': 'SCHOOL',
  'STATE PSC': 'STATE_PSC',
  CA: 'CA',
  CMA: 'CMA',
  CLAT: 'CLAT',
  GPAT: 'GPAT',
  OLYMPIADS: 'SCHOOL',
  FOUNDATION: 'SCHOOL',
};

/** "Class 6".."Class 12" → SCHOOL. */
const CLASS_PATTERN = /^CLASS\s*\d{1,2}$/;

/** Normalizes any raw exam/goal string this app produces into an avatar key. Unknown or absent
 *  values (College, Other, empty) fall through to null — callers use DEFAULT. */
export function normalizeExam(raw?: string | null): ExamAvatarKey | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  if (EXAM_ALIASES[key]) return EXAM_ALIASES[key];
  if (CLASS_PATTERN.test(key)) return 'SCHOOL';
  return null;
}

export function getExamAvatar(raw?: string | null): { src: string; alt: string; ratio: number } {
  const key = normalizeExam(raw) || 'DEFAULT';
  const entry = EXAM_AVATAR_MAP[key];
  return { src: `${AVATAR_BASE}/${entry.file}`, alt: entry.alt, ratio: entry.ratio };
}
