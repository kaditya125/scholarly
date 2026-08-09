/**
 * A "Doubt" — a scanned question the student saved to their revision notebook / mistake book,
 * together with the AI answer and the exact chapter context it came from. Persisted at
 * Firestore users/{userId}/doubts/{doubtId}.
 */
export type DoubtStatus = 'open' | 'reviewed';

export interface Doubt {
  id: string;
  userId: string;
  notebookId?: string;
  sourceId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  subject?: string;
  page?: number;

  /** OCR transcription of the scanned question. */
  questionText: string;
  /** Which scanner action produced the answer (solve/explain/teach/similar). */
  action?: string;
  /** The AI answer (markdown). */
  answer: string;

  /** Full crop image (compact JPEG data URL) — shown in the detail view. */
  imageDataUrl?: string;
  /** Small thumbnail (JPEG data URL) — shown in list cards to keep list payloads light. */
  thumbDataUrl?: string;

  /** Free-text student notes. */
  notes?: string;
  /** Auto + user tags (subject, chapter, …). */
  tags: string[];
  status: DoubtStatus;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight list projection (omits the full image + full answer to keep the list response small). */
export interface DoubtPreview {
  id: string;
  notebookId?: string;
  sourceId?: string;
  bookTitle?: string;
  chapterTitle?: string;
  subject?: string;
  page?: number;
  questionText: string;
  answerPreview: string;
  thumbDataUrl?: string;
  notes?: string;
  tags: string[];
  status: DoubtStatus;
  createdAt: number;
  updatedAt: number;
}
