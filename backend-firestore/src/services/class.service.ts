import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classRepository } from '../repositories/class.repository';
import {
  ClassInput,
  ClassMode,
  ClassPricing,
  ClassRecord,
  ClassStatus,
  MAX_CAPACITY,
  MAX_DESCRIPTION,
  MAX_PRICE_INR,
  MAX_TITLE,
  MAX_TOPICS,
  MAX_TOPIC_TITLE,
  SyllabusTopic,
  canTransitionClass,
  isClassMode,
  isDiscoverable,
  validateForPublish,
} from '../types/class';
// Safe direction: enrollment.service imports only TYPES from ../types/class, never this module,
// so there is no cycle.
import { enrollmentService } from './enrollment.service';
import { logger } from '../utils/logger';

/**
 * ClassService — owns `classes/{classId}`.
 *
 * Security properties, all enforced here rather than at the route:
 *  - `ownerUid` is always the verified token uid handed in by the controller. No method accepts
 *    an owner from a request body, so a teacher cannot create or mutate a class for someone else.
 *  - `sanitize()` builds a NEW object field by field instead of spreading input, so `status`,
 *    `ownerUid`, `counts`, `id` and timestamps cannot reach Firestore from a client payload no
 *    matter what is sent.
 *  - `status` is unreachable through the update path entirely. Lifecycle changes go through
 *    `transition()`, which validates against the state machine inside a transaction.
 *  - `pricing` is frozen once a class leaves `draft` — a price a student may already have seen
 *    cannot be edited underneath them.
 */

/* ── Field cleaning ────────────────────────────────────────────────────────────────── */

function cleanText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function cleanDate(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  if (!t) return null;
  // Stored as a plain ISO date. Rejecting anything else keeps range comparisons (endDate <
  // startDate) meaningful as string comparisons.
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined;
}

function cleanInt(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function cleanSchedule(value: unknown): ClassRecord['schedule'] | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;

  const days = Array.isArray(v.days)
    ? Array.from(new Set(v.days.filter((d): d is string => typeof d === 'string').map((d) => d.trim().toLowerCase())))
        .filter((d) => DAYS.includes(d))
    : [];

  const time = (t: unknown): string | null =>
    typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim()) ? t.trim() : null;

  return { days, startTime: time(v.startTime), endTime: time(v.endTime) };
}

function cleanSyllabus(value: unknown): SyllabusTopic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SyllabusTopic[] = [];
  for (const raw of value.slice(0, MAX_TOPICS)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, MAX_TOPIC_TITLE) : '';
    if (!title) continue;
    const status =
      r.status === 'in_progress' || r.status === 'completed' ? r.status : 'not_started';
    out.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 64) : `t_${out.length}_${Date.now().toString(36)}`,
      title,
      status,
    });
  }
  return out;
}

/**
 * Pricing is normalised so the two fields can never disagree: a `free` class always carries
 * amount 0, and a `paid` class always carries a bounded positive integer.
 */
function cleanPricing(value: unknown): ClassPricing | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const type = v.type === 'paid' ? 'paid' : v.type === 'free' ? 'free' : undefined;
  if (!type) return undefined;

  if (type === 'free') return { type: 'free', amountINR: 0, currency: 'INR' };

  const amount = cleanInt(v.amountINR, 0, MAX_PRICE_INR);
  return { type: 'paid', amountINR: typeof amount === 'number' ? amount : 0, currency: 'INR' };
}

/* ── Service ───────────────────────────────────────────────────────────────────────── */

export class ClassService {
  /** Builds the writable field set. Never spreads caller input. */
  private sanitize(input: ClassInput): Record<string, any> {
    const out: Record<string, any> = {};

    const title = cleanText(input.title, MAX_TITLE);
    if (title !== undefined) out.title = title ?? '';

    const description = cleanText(input.description, MAX_DESCRIPTION);
    if (description !== undefined) out.description = description;

    for (const key of ['subject', 'grade', 'board', 'exam', 'language'] as const) {
      const v = cleanText(input[key], 64);
      if (v !== undefined) out[key] = v;
    }

    const syllabus = cleanSyllabus(input.syllabus);
    if (syllabus !== undefined) out.syllabus = syllabus;

    const startDate = cleanDate(input.startDate);
    if (startDate !== undefined) out.startDate = startDate;
    const endDate = cleanDate(input.endDate);
    if (endDate !== undefined) out.endDate = endDate;

    const schedule = cleanSchedule(input.schedule);
    if (schedule !== undefined) out.schedule = schedule;

    if (isClassMode(input.mode)) out.mode = input.mode as ClassMode;

    const capacity = cleanInt(input.capacity, 1, MAX_CAPACITY);
    if (capacity !== undefined) out.capacity = capacity;

    return out;
  }

  /** Creates a draft. A class is never born published — publishing is an explicit act. */
  async create(ownerUid: string, input: ClassInput): Promise<ClassRecord> {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const fields = this.sanitize(input);
    const pricing = cleanPricing(input.pricing) ?? { type: 'free' as const, amountINR: 0, currency: 'INR' as const };

    const record: ClassRecord = {
      id: classRepository.newId(),
      ownerUid,
      title: '',
      description: null,
      subject: null,
      grade: null,
      board: null,
      exam: null,
      language: null,
      syllabus: [],
      startDate: null,
      endDate: null,
      schedule: null,
      mode: 'online',
      capacity: null,
      ...(fields as Partial<ClassRecord>),
      pricing,
      status: 'draft',
      counts: { enrolled: 0 },
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    await classRepository.create(record);
    logger.info('[Class] Created', { classId: record.id, ownerUid });
    return record;
  }

  async listMine(ownerUid: string): Promise<ClassRecord[]> {
    return classRepository.listByOwner(ownerUid);
  }

  /**
   * Reads one class, applying visibility.
   *
   * The owner sees it in any state. Everyone else sees it only once it is `published` or
   * `active` — a draft is private to its author, and an archived class stops being discoverable.
   * There is no "enrolled member" branch yet because enrolment does not exist until 3E; when it
   * does, this is the single function that gains it.
   */
  async getForViewer(classId: string, viewerUid: string): Promise<ClassRecord> {
    const record = await classRepository.getById(classId);
    if (!record) throw Object.assign(new Error('Class not found'), { code: 'NOT_FOUND' });

    if (record.ownerUid === viewerUid) return record;
    if (isDiscoverable(record.status)) return record;

    /**
     * The enrolled-member branch, added with Phase 3E.
     *
     * Without it, a class moving to `completed` would vanish from the view of the very students
     * who took it — `isDiscoverable` covers only `published` and `active`. An accepted edge has
     * to outlive the teaching period, or "you are in this class" would silently expire.
     *
     * Checked last, so it costs a read only for the narrow case of a non-owner looking at a
     * class that is no longer open.
     */
    if (await enrollmentService.isActiveMember(classId, viewerUid)) return record;

    // Deliberately NOT_FOUND rather than FORBIDDEN: confirming a draft exists would leak that a
    // given id is a real class belonging to someone.
    throw Object.assign(new Error('Class not found'), { code: 'NOT_FOUND' });
  }

  /**
   * Updates an owned class.
   *
   * `status` is not reachable here at any cost — it is neither read from input nor written.
   * `pricing` is accepted only while the class is still a draft.
   */
  async update(classId: string, ownerUid: string, input: ClassInput): Promise<ClassRecord> {
    const existing = await classRepository.getById(classId);
    if (!existing) throw Object.assign(new Error('Class not found'), { code: 'NOT_FOUND' });
    if (existing.ownerUid !== ownerUid) {
      throw Object.assign(new Error('Not your class'), { code: 'FORBIDDEN' });
    }
    if (existing.status === 'archived') {
      throw Object.assign(new Error('Archived classes are read-only'), { code: 'READ_ONLY' });
    }

    const patch = this.sanitize(input);

    if (input.pricing !== undefined) {
      if (existing.status !== 'draft') {
        throw Object.assign(
          new Error('Pricing can only be changed while the class is a draft'),
          { code: 'PRICING_LOCKED' },
        );
      }
      const pricing = cleanPricing(input.pricing);
      if (pricing) patch.pricing = pricing;
    }

    if (Object.keys(patch).length === 0) return existing;

    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await classRepository.update(classId, patch);

    const fresh = await classRepository.getById(classId);
    return fresh as ClassRecord;
  }

  /**
   * Moves a class through its lifecycle.
   *
   * Read and write happen in one transaction so two concurrent requests cannot both validate
   * against the same stale status and, for example, publish twice. Publishing additionally runs
   * the completeness checks — enforced here rather than at save time so a teacher can build a
   * class incrementally.
   */
  async transition(classId: string, ownerUid: string, to: ClassStatus): Promise<ClassRecord> {
    const ref = classRepository.ref(classId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw Object.assign(new Error('Class not found'), { code: 'NOT_FOUND' });

      const record = snap.data() as ClassRecord;
      if (record.ownerUid !== ownerUid) {
        throw Object.assign(new Error('Not your class'), { code: 'FORBIDDEN' });
      }

      const from = record.status;
      if (!canTransitionClass(from, to)) {
        throw Object.assign(new Error(`Cannot move a class from ${from} to ${to}`), {
          code: 'INVALID_TRANSITION',
          from,
          to,
        });
      }

      if (to === 'published') {
        const problems = validateForPublish(record);
        if (problems.length) {
          throw Object.assign(new Error('Class is not ready to publish'), {
            code: 'NOT_PUBLISHABLE',
            problems,
          });
        }
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const patch: Record<string, any> = { status: to, updatedAt: now };
      // Stamped once, on the first publish, so it survives later lifecycle moves.
      if (to === 'published' && !record.publishedAt) patch.publishedAt = now;

      tx.update(ref, patch);
      logger.info('[Class] Transition', { classId, ownerUid, from, to });
      return { ...record, ...patch, status: to } as ClassRecord;
    });
  }
}

export const classService = new ClassService();
