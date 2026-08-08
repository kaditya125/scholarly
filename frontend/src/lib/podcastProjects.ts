/**
 * Podcast Projects Store
 *
 * Client-side persistence for the podcast workspace. Each "project" is one
 * podcast conversation — the ChatGPT/Claude-Projects model:
 *
 *   - Created the moment the user sends their first message (not when the
 *     podcast job starts), so a draft is never lost.
 *   - Holds the full conversation trail (`turns`) including reasoning steps,
 *     plus the collected parameters (duration / language / style).
 *   - Linked to a backend `podcastId` once generation kicks off, so the
 *     generated audio, transcript, quiz, flashcards, and mind map remain
 *     reachable through the normal podcast APIs.
 *
 * Storage layout (localStorage):
 *   podcast-projects-index-v1        -> PodcastProjectMeta[] (light, for the sidebar)
 *   podcast-project-v1-<projectId>   -> PodcastProjectDetail (heavy, per project)
 *
 * The split keeps the sidebar render cheap: listing projects never parses
 * every conversation. Detail blobs are only read when a project is opened.
 *
 * The backend is intentionally untouched. Projects are a navigation and
 * session-continuity layer on top of the existing podcast pipeline. The
 * tradeoff is that project history is per-device; see `MIGRATION NOTE` at
 * the bottom for the Firestore path if cross-device sync is wanted later.
 */

import type { PodcastStatus } from '../types';
import type { PodcastStyleId } from './api/podcasts';

const INDEX_KEY = 'podcast-projects-index-v1';
const DETAIL_PREFIX = 'podcast-project-v1-';

/** Cap stored projects so localStorage can't grow without bound. */
const MAX_PROJECTS = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle of a project, derived from its linked podcast (if any). */
export type ProjectStatus = 'draft' | 'planning' | 'generating' | 'ready' | 'failed';

/**
 * Light-weight project record used to render the sidebar list. Everything
 * here is denormalized on write so the sidebar never needs to load a
 * conversation or hit the network to draw a card.
 */
export interface PodcastProjectMeta {
  id: string;
  /** Display title. Starts as the user's first message, upgraded to the podcast title. */
  title: string;
  /** Optional subject/topic line shown under the title. */
  subject?: string;
  createdAt: number;
  updatedAt: number;
  /** Backend podcast id, once generation has been kicked off. */
  podcastId: string | null;
  status: ProjectStatus;
  /** Raw backend status, kept for precise progress labels. */
  podcastStatus?: PodcastStatus;
  durationMinutes?: number;
  language?: string;
  styleLabel?: string;
  /** Cover image URL, if one has been generated. */
  thumbnailUrl?: string;
}

/** Full project record including the conversation. */
export interface PodcastProjectDetail extends PodcastProjectMeta {
  /**
   * The conversation turns. Typed as `unknown[]` here on purpose: the `Turn`
   * union lives in the studio component, and this module stays free of
   * component imports. Callers cast at the boundary.
   */
  turns: unknown[];
  /** The collected duration/language/style params. Same reasoning as `turns`. */
  collected: unknown;
}

// ---------------------------------------------------------------------------
// Index (list) operations
// ---------------------------------------------------------------------------

/**
 * All projects, newest activity first. Returns an empty array rather than
 * throwing when storage is unavailable (private mode, quota, disabled).
 */
export function listProjects(): PodcastProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as PodcastProjectMeta[])
      .filter((p) => p && typeof p.id === 'string')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
}

function writeIndex(projects: PodcastProjectMeta[]): void {
  try {
    // Keep newest first, drop the tail past the cap along with its detail blob.
    const sorted = [...projects].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const keep = sorted.slice(0, MAX_PROJECTS);
    const drop = sorted.slice(MAX_PROJECTS);
    for (const p of drop) {
      localStorage.removeItem(DETAIL_PREFIX + p.id);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(keep));
  } catch (err) {
    console.warn('[podcastProjects] Failed to write index:', err);
  }
}

function upsertIndex(meta: PodcastProjectMeta): void {
  const all = listProjects();
  const idx = all.findIndex((p) => p.id === meta.id);
  if (idx >= 0) {
    all[idx] = meta;
  } else {
    all.push(meta);
  }
  writeIndex(all);
}

// ---------------------------------------------------------------------------
// Detail operations
// ---------------------------------------------------------------------------

/** Full project including conversation, or null if missing/corrupt. */
export function getProject(projectId: string): PodcastProjectDetail | null {
  try {
    const raw = localStorage.getItem(DETAIL_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PodcastProjectDetail;
    if (!parsed || typeof parsed.id !== 'string') return null;
    if (!Array.isArray(parsed.turns)) parsed.turns = [];
    return parsed;
  } catch {
    return null;
  }
}

function writeDetail(detail: PodcastProjectDetail): void {
  try {
    localStorage.setItem(DETAIL_PREFIX + detail.id, JSON.stringify(detail));
  } catch (err) {
    // Most likely a quota error from a very long conversation. Retry once
    // with the reasoning trail trimmed to the most recent turns so the
    // project itself survives even if some history is shed.
    console.warn('[podcastProjects] Detail write failed, retrying trimmed:', err);
    try {
      const trimmed: PodcastProjectDetail = {
        ...detail,
        turns: detail.turns.slice(-40),
      };
      localStorage.setItem(DETAIL_PREFIX + detail.id, JSON.stringify(trimmed));
    } catch (err2) {
      console.warn('[podcastProjects] Trimmed write also failed:', err2);
    }
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `proj-${crypto.randomUUID()}`;
  }
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Derive a short, readable project title from the user's first message.
 * Keeps it to roughly one line so sidebar cards stay tidy.
 */
export function deriveTitle(firstMessage: string): string {
  const cleaned = (firstMessage || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New podcast';
  // Prefer cutting at a sentence boundary when one appears early.
  const sentenceEnd = cleaned.search(/[.!?](\s|$)/);
  const base = sentenceEnd > 12 && sentenceEnd <= 60 ? cleaned.slice(0, sentenceEnd) : cleaned;
  if (base.length <= 52) return base;
  // Otherwise cut on a word boundary.
  const cut = base.slice(0, 52);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim()}...`;
}

/**
 * Create a new project. Called as soon as the user sends their first
 * message so the conversation is durable from turn one.
 */
export function createProject(input: {
  firstMessage: string;
  turns?: unknown[];
  collected?: unknown;
}): PodcastProjectDetail {
  const now = Date.now();
  const detail: PodcastProjectDetail = {
    id: newId(),
    title: deriveTitle(input.firstMessage),
    subject: undefined,
    createdAt: now,
    updatedAt: now,
    podcastId: null,
    status: 'draft',
    turns: input.turns ?? [],
    collected: input.collected ?? { topic: input.firstMessage },
  };
  writeDetail(detail);
  upsertIndex(toMeta(detail));
  return detail;
}

/**
 * Persist the conversation for a project. Called on every turn change so a
 * reload or crash mid-generation doesn't lose the trail.
 */
export function saveProjectSession(
  projectId: string,
  turns: unknown[],
  collected: unknown
): void {
  const existing = getProject(projectId);
  if (!existing) return;
  const detail: PodcastProjectDetail = {
    ...existing,
    turns,
    collected,
    updatedAt: Date.now(),
  };
  writeDetail(detail);
  upsertIndex(toMeta(detail));
}

/**
 * Patch project metadata (title, linked podcast, status, denormalized
 * duration/language/style, thumbnail). Merges — omitted fields are kept.
 */
export function updateProject(
  projectId: string,
  patch: Partial<Omit<PodcastProjectMeta, 'id' | 'createdAt'>>
): PodcastProjectMeta | null {
  const existing = getProject(projectId);
  if (!existing) return null;
  const detail: PodcastProjectDetail = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  writeDetail(detail);
  const meta = toMeta(detail);
  upsertIndex(meta);
  return meta;
}

/** Remove a project and its conversation. */
export function deleteProject(projectId: string): void {
  try {
    localStorage.removeItem(DETAIL_PREFIX + projectId);
  } catch {
    /* ignore */
  }
  writeIndex(listProjects().filter((p) => p.id !== projectId));
}

/** Find the project linked to a backend podcast id, if any. */
export function findProjectByPodcastId(podcastId: string): PodcastProjectMeta | null {
  return listProjects().find((p) => p.podcastId === podcastId) ?? null;
}

// ---------------------------------------------------------------------------
// Backfill for podcasts generated before the project model existed
// ---------------------------------------------------------------------------

/** Minimal shape we need off a backend podcast to build a project from it. */
interface BackfillPodcast {
  id: string;
  title?: string;
  description?: string;
  status: PodcastStatus;
  language?: string;
  duration?: number;
  durationMs?: number;
  speakers?: string[];
  createdAt?: unknown;
  learningObjectives?: string[];
}

/**
 * Create projects for podcasts that don't have one yet, so a user's existing
 * library still appears in the Podcast Projects list after this redesign.
 *
 * Backfilled projects get a synthesized conversation (the real chat was
 * never persisted for them), clearly framed as a recap. Returns true when
 * anything was written, so callers know to refresh their list.
 */
export function backfillFromPodcasts(podcasts: BackfillPodcast[]): boolean {
  if (!podcasts || podcasts.length === 0) return false;

  const existing = listProjects();
  const linked = new Set(existing.map((p) => p.podcastId).filter(Boolean) as string[]);

  let wrote = false;
  for (const podcast of podcasts) {
    if (!podcast?.id || linked.has(podcast.id)) continue;

    const durationMinutes = podcastDurationMinutes(podcast);
    const styleLabel = inferStyleLabel(podcast.speakers);
    const language = normalizeLanguageLabel(podcast.language);
    const createdAt = coerceTimestamp(podcast.createdAt);

    const detail: PodcastProjectDetail = {
      id: newId(),
      title: podcast.title || 'Untitled podcast',
      subject: undefined,
      createdAt,
      updatedAt: createdAt,
      podcastId: podcast.id,
      status: projectStatusFromPodcast(podcast.status),
      podcastStatus: podcast.status,
      durationMinutes,
      language,
      styleLabel,
      turns: synthesizeTurns(podcast, { durationMinutes, language, styleLabel }),
      collected: {
        topic: podcast.title || 'Untitled podcast',
        duration: { label: `${durationMinutes} Minutes`, minutes: durationMinutes },
        language: { label: language, value: language },
        style: {
          label: styleLabel,
          podcastStyle: podcastStyleFor(styleLabel),
          speakerStyle: speakerStyleFor(styleLabel),
        },
      },
    };

    writeDetail(detail);
    upsertIndex(toMeta(detail));
    linked.add(podcast.id);
    wrote = true;
  }

  return wrote;
}

/**
 * Build a readable recap conversation for a backfilled podcast. Shaped like
 * the studio's `Turn` union (`user` / `ai_prose`) so it renders natively.
 */
function synthesizeTurns(
  podcast: BackfillPodcast,
  meta: { durationMinutes: number; language: string; styleLabel: string }
): unknown[] {
  const base = `backfill-${podcast.id}`;
  const turns: unknown[] = [
    { kind: 'user', id: `${base}-u1`, content: podcast.title || 'Untitled podcast' },
    {
      kind: 'ai_prose',
      id: `${base}-a1`,
      content:
        'This podcast was created before conversations were saved, so here is a recap of how it was configured.',
    },
    { kind: 'user', id: `${base}-u2`, content: `${meta.durationMinutes} Minutes` },
    { kind: 'user', id: `${base}-u3`, content: meta.language },
    { kind: 'user', id: `${base}-u4`, content: meta.styleLabel },
  ];

  const objectives =
    podcast.learningObjectives && podcast.learningObjectives.length
      ? `\n\nLearning objectives:\n${podcast.learningObjectives.map((o) => `- ${o}`).join('\n')}`
      : '';
  const description =
    podcast.description ||
    `A ${meta.durationMinutes}-minute ${meta.styleLabel.toLowerCase()} podcast in ${meta.language}.`;

  turns.push({ kind: 'ai_prose', id: `${base}-a2`, content: `${description}${objectives}` });

  if (podcast.status === 'READY') {
    turns.push({
      kind: 'ai_prose',
      id: `${base}-a3`,
      content:
        'This podcast is ready. The transcript is in the right panel, and you can keep refining it from here.',
    });
  }

  return turns;
}

function podcastDurationMinutes(podcast: BackfillPodcast): number {
  if (podcast.duration && podcast.duration > 0) {
    return Math.max(1, Math.round(podcast.duration / 60));
  }
  if (podcast.durationMs && podcast.durationMs > 0) {
    return Math.max(1, Math.round(podcast.durationMs / 60000));
  }
  return 10;
}

/** Firestore timestamps, ISO strings, and epoch numbers all show up here. */
function coerceTimestamp(value: unknown): number {
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return parsed;
  }
  if (value && typeof value === 'object') {
    const seconds = (value as { _seconds?: number; seconds?: number });
    const s = seconds._seconds ?? seconds.seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return Date.now();
}

export function normalizeLanguageLabel(raw?: string): string {
  const v = (raw || '').toLowerCase();
  if (v === 'hi' || v === 'hindi') return 'Hindi';
  if (v === 'hinglish') return 'Hinglish';
  if (v === 'sanskrit') return 'Sanskrit';
  if (!raw) return 'English';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Guess the original style from the podcast's speaker roles.
 *
 * Only the cast is stored on a finished podcast, so this is a best-effort
 * reconstruction. Storytelling and Solo Narration are both a lone Narrator and
 * genuinely cannot be told apart here; Solo Narration is the safer guess since it
 * makes no cinematic promises.
 */
export function inferStyleLabel(speakers?: string[]): string {
  const list = (speakers || []).map((s) => (s || '').toLowerCase());
  const has = (k: string) => list.some((s) => s.includes(k));

  // Three voices only ever comes from a debate (moderator + two sides).
  if (list.length >= 3) return 'Debate';
  if (has('teacher') && has('student')) return 'Teacher & Student';
  // Narrator + expert is the documentary cast; host + expert is the interview cast.
  if (has('narrator') && has('expert')) return 'Documentary';
  if (has('interview')) return 'Interview';
  if (has('host') && list.length >= 2) return 'Interview';
  if (list.length === 1) return 'Solo Narration';
  if (list.length >= 2) return 'Interview';
  return 'Teacher & Student';
}

/** Map a style label back to the LEGACY backend speakerStyle enum value. */
export function speakerStyleFor(
  label: string
): 'teacher_student' | 'interview' | 'discussion' | 'solo_narrator' {
  switch (label) {
    case 'Teacher & Student':
      return 'teacher_student';
    case 'Interview':
      return 'interview';
    case 'Discussion':
    case 'Debate':
      return 'discussion';
    default:
      return 'solo_narrator';
  }
}

/**
 * Map a style label to the production format id.
 *
 * Unlike speakerStyleFor this is lossless — every label has its own id, which is
 * the whole point of the style engine.
 */
export function podcastStyleFor(label: string): PodcastStyleId {
  switch (label) {
    case 'Teacher & Student':
      return 'teacher_student';
    case 'Storytelling':
      return 'storytelling';
    case 'Documentary':
      return 'documentary';
    case 'Interview':
      return 'interview';
    case 'Debate':
    case 'Discussion':
      return 'debate';
    case 'Solo Narration':
      return 'solo_narration';
    default:
      return 'teacher_student';
  }
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

/** Strip the conversation off a detail record to get its index entry. */
function toMeta(detail: PodcastProjectDetail): PodcastProjectMeta {
  const { turns: _turns, collected: _collected, ...meta } = detail;
  return meta;
}

/** Map a backend podcast status onto the coarser project status. */
export function projectStatusFromPodcast(status: PodcastStatus): ProjectStatus {
  switch (status) {
    case 'READY':
      return 'ready';
    case 'FAILED':
    case 'CANCELLED':
      return 'failed';
    case 'PENDING':
    case 'PLANNING':
      return 'planning';
    default:
      return 'generating';
  }
}

/**
 * Short human label for a project card's status line, e.g. "Completed",
 * "Generating...", "Draft".
 */
export function projectStatusLabel(project: PodcastProjectMeta): string {
  switch (project.status) {
    case 'ready':
      return 'Completed';
    case 'failed':
      return project.podcastStatus === 'CANCELLED' ? 'Cancelled' : 'Failed';
    case 'planning':
      return 'Planning...';
    case 'generating':
      return 'Generating...';
    case 'draft':
    default:
      return 'Draft';
  }
}

/**
 * The "10 min • English • Storytelling" metadata line. Omits pieces that
 * aren't known yet so a fresh draft doesn't render stray separators.
 */
export function projectMetaLine(project: PodcastProjectMeta): string {
  return [
    project.durationMinutes ? `${project.durationMinutes} min` : null,
    project.language || null,
    project.styleLabel || null,
  ]
    .filter(Boolean)
    .join(' • ');
}

/** Relative time for the "Updated 2 min ago" line. */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 45_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}

/*
 * MIGRATION NOTE — cross-device project history
 *
 * Projects live in localStorage, so history is per-device. To sync across
 * devices without touching the generation pipeline, add a sibling Firestore
 * collection (e.g. `users/{uid}/podcastProjects/{projectId}`) holding exactly
 * the PodcastProjectDetail shape, then swap the four functions that touch
 * storage — listProjects, getProject, writeDetail, deleteProject — for API
 * calls. Every call site already goes through this module, so no component
 * changes would be required.
 */
