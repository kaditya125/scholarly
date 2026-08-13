/**
 * Classes / batches — the unit a teacher creates, and later fills with students (3E),
 * resources (3F) and tests (3G).
 *
 * ── Scope of Phase 3D ─────────────────────────────────────────────────────────────────
 * This phase creates and manages the class RECORD only. Deliberately absent:
 *   · enrolment of any kind — a class has no members until 3E, and `counts.enrolled` is
 *     therefore always 0;
 *   · payment — `pricing` is captured and stored, but nothing in the codebase reads it to
 *     charge anyone. A class marked `paid` is not purchasable; it simply records an intent.
 *
 * Storing an inert price is the deliberate choice over omitting the field: a teacher setting a
 * class up wants to state its price, and adding the column later would mean migrating every
 * existing class. What must NOT happen is any surface implying the price is collectable — see
 * the note on `pricing` below.
 */

/* ── Lifecycle ─────────────────────────────────────────────────────────────────────── */

export const CLASS_STATUSES = ['draft', 'published', 'active', 'completed', 'archived'] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export function isClassStatus(value: unknown): value is ClassStatus {
  return typeof value === 'string' && (CLASS_STATUSES as readonly string[]).includes(value);
}

/**
 * Permitted lifecycle transitions.
 *
 *     draft ──► published ──► active ──► completed
 *       │           │           │           │
 *       └───────────┴───────────┴───────────┴──► archived
 *
 * `archived` is terminal, and is the only way to withdraw a class — nothing deletes a class
 * record, because once 3E exists a deletion would orphan enrolments and, once 3I exists, would
 * detach a class from money that has already changed hands.
 *
 * `published → active` and `active → completed` are manual in this phase. Driving them from
 * `startDate`/`endDate` needs a scheduled job, and a date-driven transition that silently fails
 * is worse than one a teacher performs deliberately.
 */
export const CLASS_TRANSITIONS: Record<ClassStatus, readonly ClassStatus[]> = {
  draft: ['published', 'archived'],
  published: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export function canTransitionClass(from: ClassStatus, to: ClassStatus): boolean {
  return CLASS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses in which a class is visible to anyone other than its owner. */
export function isDiscoverable(status: ClassStatus): boolean {
  return status === 'published' || status === 'active';
}

/* ── Sub-shapes ────────────────────────────────────────────────────────────────────── */

export const CLASS_MODES = ['online', 'offline', 'hybrid'] as const;
export type ClassMode = (typeof CLASS_MODES)[number];

export function isClassMode(value: unknown): value is ClassMode {
  return typeof value === 'string' && (CLASS_MODES as readonly string[]).includes(value);
}

export const SYLLABUS_TOPIC_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type SyllabusTopicStatus = (typeof SYLLABUS_TOPIC_STATUSES)[number];

export interface SyllabusTopic {
  id: string;
  title: string;
  status: SyllabusTopicStatus;
}

export interface ClassSchedule {
  /** Lowercase day names, e.g. ['mon','wed']. Display only in this phase. */
  days: string[];
  /** 24h "HH:MM". Display only — no timezone maths happens anywhere yet. */
  startTime: string | null;
  endTime: string | null;
}

/**
 * What a class costs.
 *
 * ⚠ INERT IN PHASE 3D. Nothing charges against this. It is write-once-then-frozen: editable
 * only while the class is a `draft`, because a price a student has already seen on a published
 * class must not change underneath them. When 3I wires purchasing, the authoritative amount is
 * recomputed server-side from this record — never accepted from a client, exactly as the
 * existing subscription flow does.
 */
export interface ClassPricing {
  type: 'free' | 'paid';
  /** Whole rupees. 0 when free. */
  amountINR: number;
  currency: 'INR';
}

/* ── The record ────────────────────────────────────────────────────────────────────── */

export interface ClassRecord {
  id: string;
  /** The creating teacher. Always the verified token uid — never accepted from a body. */
  ownerUid: string;

  title: string;
  description: string | null;
  subject: string | null;
  grade: string | null;
  board: string | null;
  exam: string | null;
  language: string | null;

  syllabus: SyllabusTopic[];
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null;
  schedule: ClassSchedule | null;
  mode: ClassMode;
  capacity: number | null;

  pricing: ClassPricing;
  status: ClassStatus;

  /** Denormalised, backend-maintained. Always 0 until enrolment exists (3E). */
  counts: { enrolled: number };

  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  publishedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
}

/**
 * What a teacher may submit. Note the absence of id, ownerUid, status, counts and timestamps —
 * all server-owned. The service builds its write set field by field rather than spreading input,
 * so an unexpected key cannot reach Firestore even if this type is bypassed.
 */
export interface ClassInput {
  title?: string;
  description?: string | null;
  subject?: string | null;
  grade?: string | null;
  board?: string | null;
  exam?: string | null;
  language?: string | null;
  syllabus?: { id?: string; title: string; status?: SyllabusTopicStatus }[];
  startDate?: string | null;
  endDate?: string | null;
  schedule?: { days?: string[]; startTime?: string | null; endTime?: string | null } | null;
  mode?: ClassMode;
  capacity?: number | null;
  pricing?: { type?: 'free' | 'paid'; amountINR?: number };
}

/* ── Publish validation ────────────────────────────────────────────────────────────── */

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_TOPIC_TITLE = 160;
export const MAX_TOPICS = 200;
export const MAX_CAPACITY = 100_000;
export const MAX_PRICE_INR = 1_000_000;

/**
 * Rules a class must satisfy before it can leave `draft`.
 *
 * Enforced at publish rather than at save so a teacher can build a class incrementally without
 * the form fighting them — the same autosave-friendly approach the onboarding wizards take.
 * Returns every problem at once rather than the first, so the UI can show a complete checklist.
 */
export function validateForPublish(record: Pick<ClassRecord, 'title' | 'subject' | 'pricing' | 'capacity' | 'startDate' | 'endDate'>): string[] {
  const problems: string[] = [];

  if (!record.title?.trim()) problems.push('Give the class a title.');
  if (!record.subject?.trim()) problems.push('Choose a subject.');

  if (record.pricing.type === 'paid' && record.pricing.amountINR <= 0) {
    problems.push('A paid class needs a price above zero.');
  }
  if (record.pricing.type === 'free' && record.pricing.amountINR !== 0) {
    problems.push('A free class cannot carry a price.');
  }
  if (record.capacity != null && record.capacity < 1) {
    problems.push('Capacity must be at least one student.');
  }
  if (record.startDate && record.endDate && record.endDate < record.startDate) {
    problems.push('The end date cannot fall before the start date.');
  }

  return problems;
}
