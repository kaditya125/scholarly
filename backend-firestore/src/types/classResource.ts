/**
 * Class resources — a notebook a teacher has attached to a class.
 *
 * ── Why a resource IS a notebook, not a new content system ────────────────────────────
 * Notebooks already do the actual work: upload, extraction (pdf-parse/mammoth/tesseract),
 * chunking, embedding, citation-backed Q&A. Building a second content pipeline for "class
 * resources" would duplicate all of that to produce something strictly worse. A classResource
 * is therefore a thin pointer — `notebookId` plus the metadata a class needs — and opening one
 * takes a student to the exact same /notebooks/:id experience that already exists.
 *
 * ── Access model ───────────────────────────────────────────────────────────────────────
 * Attaching a resource does not, by itself, let anyone read it. Access is granted through the
 * SAME mechanism the rest of the app already uses for shared notebooks —
 * `notebookSharing.shareWithUser(notebookId, teacherUid, studentUid, 'viewer')`, which adds the
 * student to the notebook's `viewers` array. That array is what both the REST API
 * (`notebookRepository.getNotebooksByUser` / `getNotebook`) and the Firestore security rules
 * check, so this is genuine access, not a list entry pointing at something unreachable.
 *
 * Because of that, class resources must be kept in lockstep with enrolment:
 *   · a student reaching ACTIVE is granted `viewer` on every resource already attached;
 *   · a student leaving ACTIVE (LEFT / REMOVED / BLOCKED) has `viewer` revoked from all of them.
 * See `classResource.service.ts#syncAccessForEnrollment`, called from `enrollment.service.ts`.
 *
 * ── Provenance ─────────────────────────────────────────────────────────────────────────
 * `source` is SELF-DECLARED by the teacher at attach time, not verified by the platform. Only
 * values that can genuinely occur today are listed — no `student_created` (nothing here lets a
 * student author a resource) and no automatic detection of "AI wrote this" vs "I wrote this".
 * Overstating this as verified would be a bigger problem than the field being honestly soft.
 */

export const RESOURCE_PROVENANCE_SOURCES = [
  'teacher_authored',
  'teacher_uploaded',
  'platform_generated',
  'licensed',
] as const;
export type ResourceProvenanceSource = (typeof RESOURCE_PROVENANCE_SOURCES)[number];

export function isResourceProvenanceSource(value: unknown): value is ResourceProvenanceSource {
  return typeof value === 'string' && (RESOURCE_PROVENANCE_SOURCES as readonly string[]).includes(value);
}

export interface ResourceProvenance {
  source: ResourceProvenanceSource;
  /** Always the attaching teacher's uid — never accepted from input. */
  createdBy: string;
}

export const MAX_RESOURCE_TITLE = 160;

/** `classResources/{id}` */
export interface ClassResourceRecord {
  id: string;
  classId: string;
  /** Denormalised from the class, so a rule or query never needs to join to `classes`. */
  ownerUid: string;
  notebookId: string;
  /** Defaults to the notebook's own title at attach time; editable independently afterwards. */
  title: string;
  provenance: ResourceProvenance;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface AttachResourceInput {
  notebookId?: string;
  title?: string;
  source?: ResourceProvenanceSource;
}
