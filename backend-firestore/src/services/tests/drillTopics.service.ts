/**
 * Drill topic index — the corpus's OWN topic vocabulary per exam, normalized, with real PYQ
 * frequencies. It is what grounds the dashboard's drill cards ("High Yield" = most-asked in real
 * previous-year papers, not a hand-typed list) and what lets the QuestionMixer find PYQs and
 * reference-book questions for a drill topic at all.
 *
 * Why it exists: pyq_questions topics are stored as the importer tagged them — "Percentage",
 * "Percentage — RS Aggarwal / Lucent Maths", "Algebra — Lucent Maths" — and subjects vary by source
 * ("General Intelligence" vs "General Intelligence & Reasoning"). The mixer's Firestore lookups are
 * exact-equality, so a drill asking for "Arithmetic (Percentage, Profit & Loss, SI/CI, Ratio)"
 * matched nothing and silently fell back to plain LLM generation (measured: 0 PYQs in 10 questions
 * while 2,427 real SSC CGL Quant PYQs existed). This index maps a normalized topic key back to every
 * raw stored spelling so retrieval can use `in` queries on the real values.
 *
 * Only `origin !== 'template'` rows count: template rows are unverified "Practice Set" questions
 * with no source and must never be counted or served as PYQs.
 *
 * Built by one field-projected scan per exam, cached in-process (the Redis tier is at quota) and
 * rebuilt every few hours. For SSC CGL that is ~14k small reads a few times a day per instance.
 */
import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';

const TTL_MS = 6 * 60 * 60 * 1000;

/** Groups spelling variants of one subject ("General Intelligence" / "General Intelligence &
 *  Reasoning"). Only an internal group id — each exam's index displays the group under its own
 *  most common stored name, so JEE's "Mathematics" stays "Mathematics". */
const SUBJECT_GROUPS: Array<[RegExp, string]> = [
  [/quant|math|arith/i, 'g:math'],
  [/intelligence|reasoning/i, 'g:reasoning'],
  [/english/i, 'g:english'],
  [/awareness|general studies|\bgk\b/i, 'g:awareness'],
  [/computer/i, 'g:computer'],
];

export function subjectGroup(raw: unknown): string {
  const s = String(raw || '').trim();
  for (const [re, id] of SUBJECT_GROUPS) if (re.test(s)) return id;
  return s.toLowerCase();
}

/** Display form of a stored topic: drop the importer's " — <book/chapter note>" suffix. */
export function displayTopic(raw: unknown): string {
  return String(raw || '').split(/\s+[—–]\s+/)[0].trim();
}

/** Comparison key: lowercase, "&" ≡ "and", punctuation collapsed, simple plural folding. */
export function topicKey(raw: unknown): string {
  return displayTopic(raw)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Topic buckets that are really a whole subject ("Mathematics", "General Awareness — Lucent GK
 *  (full revision)"): real PYQs, but they say nothing about WHICH topic, so they never become a
 *  topic card and are only used for subject-level drills. */
const GENERIC_TOPIC_KEYS = new Set([
  'quantitative aptitude', 'mathematic', 'mathematical abilitie', 'mathematical ability', 'math',
  'general intelligence', 'general intelligence and reasoning', 'reasoning and general intelligence', 'reasoning',
  'general awareness', 'general knowledge', 'general studie', 'english', 'english comprehension',
  'english language', 'computer knowledge', 'computer', 'science', 'general science and gk',
]);

/** Significant words of a topic/chapter, cut to 5 chars so "Algebra" ≈ "Algebraic". */
const STOP = new Set(['and', 'the', 'of', 'in', 'on', 'for', 'with', 'to', 'its', 'based', 'question']);
export function topicTokens(raw: unknown): string[] {
  return topicKey(raw).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.slice(0, 5));
}
export function tokensOverlap(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.some((w) => set.has(w));
}

export interface DrillTopic {
  subject: string;          // display subject (the exam's most common spelling)
  topic: string;            // display topic ("Percentage")
  key: string;              // topicKey
  pyqCount: number;         // real (non-template) PYQs tagged with this topic
  referenceCount: number;   // indexed reference-book questions on this topic
  rawTopics: string[];      // every stored spelling, for `in` retrieval
  rawSubjects: string[];    // every stored subject spelling these rows used
}

/** An indexed reference-book MCQ (question_bank, questionOrigin REFERENCE_BOOK). */
export interface ReferenceQuestion {
  id: string; text: string; options: string[]; correctAnswerIndex: number; explanation?: string;
  subject: string; topic: string; chapter?: string; book?: string; difficulty?: string;
  group: string; tokens: string[];
}

export interface TopicIndex {
  examId: string;
  builtAt: number;
  totalPyqs: number;
  /** subjectGroup → display name, raw spellings, real PYQ count. */
  subjects: Map<string, { display: string; rawSubjects: Set<string>; pyqCount: number }>;
  topics: DrillTopic[];     // specific topics only, sorted by pyqCount desc
  references: ReferenceQuestion[];
}

class DrillTopicsService {
  private cache = new Map<string, { index: TopicIndex; expires: number }>();
  private inflight = new Map<string, Promise<TopicIndex>>();

  async getIndex(examId: string): Promise<TopicIndex> {
    const hit = this.cache.get(examId);
    if (hit && hit.expires > Date.now()) return hit.index;
    const running = this.inflight.get(examId);
    if (running) return running;
    const p = this.build(examId)
      .then((index) => { this.cache.set(examId, { index, expires: Date.now() + TTL_MS }); return index; })
      .finally(() => this.inflight.delete(examId));
    this.inflight.set(examId, p);
    return p;
  }

  private async build(examId: string): Promise<TopicIndex> {
    const t0 = Date.now();
    const [pyqSnap, refSnap] = await Promise.all([
      db.collection('pyq_questions').where('examId', '==', examId).select('subject', 'topic', 'origin').get(),
      db.collection('question_bank').where('examId', '==', examId).where('questionOrigin', '==', 'REFERENCE_BOOK').get(),
    ]);

    const subjects: TopicIndex['subjects'] = new Map();
    const subjectNames = new Map<string, Map<string, number>>();
    const byTopic = new Map<string, { group: string; key: string; count: number; raw: Set<string>; rawSubj: Set<string>; names: Map<string, number> }>();
    let total = 0;

    for (const doc of pyqSnap.docs) {
      const r = doc.data();
      if (r.origin === 'template') continue;
      total++;
      const rawSubject = String(r.subject || '').trim();
      const group = subjectGroup(rawSubject);
      const s = subjects.get(group) || { display: rawSubject, rawSubjects: new Set<string>(), pyqCount: 0 };
      s.rawSubjects.add(rawSubject);
      s.pyqCount++;
      subjects.set(group, s);
      const names = subjectNames.get(group) || new Map<string, number>();
      names.set(rawSubject, (names.get(rawSubject) || 0) + 1);
      subjectNames.set(group, names);

      const key = topicKey(r.topic);
      if (!key || GENERIC_TOPIC_KEYS.has(key) || /\bweak chapter|full revision|section\b/i.test(String(r.topic))) continue;
      const id = `${group}::${key}`;
      const t = byTopic.get(id) || { group, key, count: 0, raw: new Set<string>(), rawSubj: new Set<string>(), names: new Map<string, number>() };
      t.count++;
      t.raw.add(String(r.topic));
      t.rawSubj.add(rawSubject);
      const name = displayTopic(r.topic);
      t.names.set(name, (t.names.get(name) || 0) + 1);
      byTopic.set(id, t);
    }
    // Display each subject group under its most common stored spelling.
    for (const [group, names] of subjectNames) {
      subjects.get(group)!.display = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    const references: ReferenceQuestion[] = refSnap.docs.map((d) => {
      const x: any = d.data();
      return {
        id: d.id, text: String(x.text || ''), options: Array.isArray(x.options) ? x.options.map(String) : [],
        correctAnswerIndex: Number(x.correctAnswerIndex ?? 0), explanation: x.explanation,
        subject: String(x.subject || ''), topic: String(x.topic || ''), chapter: x.sourceShift, book: x.sourcePaper,
        difficulty: x.difficulty, group: subjectGroup(x.subject),
        tokens: [...new Set([...topicTokens(x.topic), ...topicTokens(x.sourceShift)])],
      };
    }).filter((q) => q.text && q.options.length >= 2);

    const topics: DrillTopic[] = [...byTopic.values()].map((t) => {
      const tokens = topicTokens(t.key);
      return {
        subject: subjects.get(t.group)?.display || t.group,
        key: t.key, pyqCount: t.count,
        topic: [...t.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        referenceCount: references.filter((q) => q.group === t.group && tokensOverlap(tokens, q.tokens)).length,
        rawTopics: [...t.raw], rawSubjects: [...t.rawSubj],
      };
    }).sort((a, b) => b.pyqCount - a.pyqCount);

    logger.info('[DrillTopics] index built', { examId, totalPyqs: total, topics: topics.length, references: references.length, ms: Date.now() - t0 });
    return { examId, builtAt: Date.now(), totalPyqs: total, subjects, topics, references };
  }

  /** Find the corpus topic a drill request means: exact normalized key first, then containment
   *  either way ("Idioms" ↔ "Idioms and Phrases"); scoped to the requested subject when given. */
  async resolveTopic(examId: string, topic: string, subject?: string): Promise<DrillTopic | null> {
    const index = await this.getIndex(examId);
    const key = topicKey(topic);
    if (!key) return null;
    const pool = subject ? index.topics.filter((t) => subjectGroup(t.subject) === subjectGroup(subject)) : index.topics;
    const exact = pool.find((t) => t.key === key);
    if (exact) return exact;
    return pool
      .filter((t) => t.key.includes(key) || key.includes(t.key))
      .sort((a, b) => b.pyqCount - a.pyqCount)[0] || null;
  }

  /** Stored subject spellings for a subject name, and its display name. */
  async resolveSubject(examId: string, subject: string): Promise<{ display: string; rawSubjects: string[] } | null> {
    const index = await this.getIndex(examId);
    const s = index.subjects.get(subjectGroup(subject));
    return s ? { display: s.display, rawSubjects: [...s.rawSubjects] } : null;
  }

  /** True when the name is a whole subject of this exam ("Quantitative Aptitude"), not a topic. */
  async isSubjectName(examId: string, name: string): Promise<boolean> {
    const index = await this.getIndex(examId);
    const s = index.subjects.get(subjectGroup(name));
    if (!s) return false;
    const k = topicKey(name);
    // "Quantitative Aptitude" (generic bucket) or any stored spelling of the subject itself
    // ("Physics" for a JEE full-mock section).
    return GENERIC_TOPIC_KEYS.has(k) || [...s.rawSubjects, s.display].some((r) => topicKey(r) === k);
  }

  /** Indexed reference-book questions on this subject and (when given) topic. Never returns
   *  another topic's questions to fill a quota — off-topic is worse than generated. */
  async referenceQuestions(examId: string, subject: string, topic?: string): Promise<ReferenceQuestion[]> {
    const index = await this.getIndex(examId);
    const group = subjectGroup(subject);
    const tokens = topic ? topicTokens(topic) : [];
    return index.references.filter((q) => q.group === group && (!tokens.length || tokensOverlap(tokens, q.tokens)));
  }
}

export const drillTopicsService = new DrillTopicsService();
