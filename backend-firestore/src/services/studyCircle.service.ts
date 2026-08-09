import { v4 as uuidv4 } from 'uuid';
import { studyCircleRepository } from '../repositories/studyCircle.repository';
import { studyGroupRepository } from '../repositories/studyGroup.repository';
import { connectionRepository } from '../repositories/connection.repository';
import { userProfileService } from './userProfile.service';
import { aiOrchestrator, AILearningMode } from './ai/ai.orchestrator';
import { callStructuredLLM } from './ai/structuredLlm';
import {
  ChatMessage,
  CircleChatTurn,
  CircleConcept,
  CircleKnowledgeItem,
  CircleKnowledgeSource,
  StudyGroup,
} from '../types';
import { StudentProfile } from '../types/studentContext.types';

const KNOWLEDGE_SOURCES: CircleKnowledgeSource[] = ['note', 'resource', 'summary', 'message'];

/** Shape the concept-extraction LLM returns, before sanitization. */
interface ExtractedConcept {
  label: string;
  definition: string;
  importance: number;
  related: string[];
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const normLabel = (s: string): string => s.trim().toLowerCase();

/** Thrown for expected, user-facing failures; carries an HTTP status for the controller. */
export class StudyCircleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'StudyCircleError';
  }
}

interface MemberContext {
  uid: string;
  displayName: string;
  profile: StudentProfile | null;
}

/**
 * The AI Study Circle: a per-group study assistant grounded in (a) the group's identity, (b) its
 * members' shared exam/subject goals, and (c) a persistent knowledge base the members curate
 * together. Every method is gated on group membership; the conversation is persisted so the whole
 * circle shares one continuous, evolving thread.
 */
export class StudyCircleService {
  private async loadGroupForMember(groupId: string, uid: string): Promise<StudyGroup> {
    const group = await studyGroupRepository.getGroupById(groupId);
    if (!group) throw new StudyCircleError(404, 'Group not found');
    if (!group.memberIds.includes(uid)) {
      throw new StudyCircleError(403, 'You are not a member of this group');
    }
    return group;
  }

  // ─── Knowledge base ────────────────────────────────────────────────────────

  async listKnowledge(uid: string, groupId: string): Promise<CircleKnowledgeItem[]> {
    await this.loadGroupForMember(groupId, uid);
    return studyCircleRepository.listKnowledge(groupId);
  }

  async addKnowledge(
    uid: string,
    groupId: string,
    input: { text: string; title?: string; source?: string }
  ): Promise<CircleKnowledgeItem> {
    await this.loadGroupForMember(groupId, uid);

    const text = (input.text || '').trim();
    if (!text) throw new StudyCircleError(400, 'Knowledge text is required');
    if (text.length > 4000) throw new StudyCircleError(400, 'Knowledge is too long (max 4000 characters)');

    const title = input.title?.trim().slice(0, 140) || undefined;
    const source: CircleKnowledgeSource =
      input.source && KNOWLEDGE_SOURCES.includes(input.source as CircleKnowledgeSource)
        ? (input.source as CircleKnowledgeSource)
        : 'note';

    const [entry] = await connectionRepository.getDirectoryMany([uid]);
    const item: CircleKnowledgeItem = {
      id: uuidv4(),
      groupId,
      title,
      text,
      source,
      addedBy: uid,
      addedByName: entry?.displayName || 'Scholarly learner',
      createdAt: Date.now(),
    };
    await studyCircleRepository.addKnowledge(item);
    return item;
  }

  /** Removes a knowledge item. Allowed for the contributor or a group admin (moderation). */
  async deleteKnowledge(uid: string, groupId: string, itemId: string): Promise<void> {
    const group = await this.loadGroupForMember(groupId, uid);
    const item = await studyCircleRepository.getKnowledge(groupId, itemId);
    if (!item) throw new StudyCircleError(404, 'Knowledge item not found');
    const isAdmin = group.members.find((m) => m.userId === uid)?.role === 'admin';
    if (item.addedBy !== uid && !isAdmin) {
      throw new StudyCircleError(403, 'You can only remove knowledge you added');
    }
    await studyCircleRepository.deleteKnowledge(groupId, itemId);
  }

  // ─── Conversation ────────────────────────────────────────────────────────────

  async getChatLog(uid: string, groupId: string): Promise<CircleChatTurn[]> {
    await this.loadGroupForMember(groupId, uid);
    return studyCircleRepository.listChatTurns(groupId);
  }

  /**
   * Streams a grounded answer to `question`, then persists the exchange to the shared circle log.
   * Yields text chunks for the SSE controller. Validation/membership errors are thrown before the
   * first chunk so the controller can surface them as proper HTTP status codes.
   */
  async *askStream(
    uid: string,
    groupId: string,
    question: string
  ): AsyncGenerator<string, void, unknown> {
    const group = await this.loadGroupForMember(groupId, uid);

    const q = (question || '').trim();
    if (!q) throw new StudyCircleError(400, 'A question is required');
    if (q.length > 4000) throw new StudyCircleError(400, 'Question is too long (max 4000 characters)');

    const [knowledge, priorTurns, members, concepts] = await Promise.all([
      studyCircleRepository.listKnowledge(groupId),
      studyCircleRepository.listChatTurns(groupId, 8),
      this.loadMemberContexts(group),
      studyCircleRepository.listConcepts(groupId),
    ]);

    const contextData = this.buildCircleContext(group, knowledge, members, concepts);

    // Prior turns become conversation history so the circle thread stays continuous.
    const history: ChatMessage[] = [];
    for (const turn of priorTurns) {
      history.push({ role: 'user', content: turn.question, timestamp: turn.createdAt });
      history.push({ role: 'ai', content: turn.answer, timestamp: turn.createdAt });
    }
    history.push({ role: 'user', content: q, timestamp: Date.now() });

    let fullAnswer = '';
    const stream = aiOrchestrator.generateStreamGroundedResponse(
      AILearningMode.TEACHER,
      history,
      contextData
    );
    for await (const chunk of stream) {
      fullAnswer += chunk;
      yield chunk;
    }

    // Only persist a real exchange — never a blank answer (e.g. if the model yielded nothing).
    if (fullAnswer.trim()) {
      const asker = members.find((m) => m.uid === uid);
      const turn: CircleChatTurn = {
        id: uuidv4(),
        groupId,
        askedBy: uid,
        askedByName: asker?.displayName || 'Scholarly learner',
        question: q,
        answer: fullAnswer,
        createdAt: Date.now(),
      };
      await studyCircleRepository.appendChatTurn(turn);
    }
  }

  // ─── Context building ──────────────────────────────────────────────────────

  private async loadMemberContexts(group: StudyGroup): Promise<MemberContext[]> {
    const directory = await connectionRepository.getDirectoryMany(group.memberIds);
    const nameByUid = new Map(directory.map((d) => [d.uid, d.displayName]));
    return Promise.all(
      group.memberIds.map(async (uid) => ({
        uid,
        displayName: nameByUid.get(uid) || 'Scholarly learner',
        profile: await userProfileService.getProfile(uid),
      }))
    );
  }

  private buildCircleContext(
    group: StudyGroup,
    knowledge: CircleKnowledgeItem[],
    members: MemberContext[],
    concepts: CircleConcept[] = []
  ): string {
    const sections: string[] = [];

    // 1) Identity of the circle.
    const identity: string[] = [`Study group: "${group.name}"`];
    if (group.subject) identity.push(`Primary subject: ${group.subject}`);
    if (group.description) identity.push(`About: ${group.description}`);
    identity.push(`Members: ${group.memberIds.length}`);
    sections.push(identity.join('\n'));

    // 2) Shared study goals aggregated from member onboarding profiles.
    const goals = this.aggregate(members.map((m) => m.profile?.goal || m.profile?.targetExam));
    const subjects = this.aggregate(members.flatMap((m) => m.profile?.subjects || []));
    const weakAreas = this.aggregate(members.flatMap((m) => m.profile?.weakAreas || []));
    const focus: string[] = [];
    if (goals.length) focus.push(`Shared exam/goal focus: ${goals.join(', ')}`);
    if (subjects.length) focus.push(`Subjects the members study: ${subjects.join(', ')}`);
    if (weakAreas.length) focus.push(`Common weak areas worth reinforcing: ${weakAreas.join(', ')}`);
    if (focus.length) sections.push(focus.join('\n'));

    // 3) The curated knowledge base -- the heart of the circle.
    if (knowledge.length) {
      const items = knowledge
        .slice(0, 60)
        .map((k, i) => {
          const head = k.title ? `${k.title}: ` : '';
          return `${i + 1}. ${head}${k.text}`.slice(0, 600);
        })
        .join('\n');
      sections.push(`Shared knowledge base curated by the group:\n${items}`);
    } else {
      sections.push(
        'Shared knowledge base curated by the group: (empty so far -- encourage members to add key notes, summaries, and resources.)'
      );
    }

    // 4) The synthesized concept map, so answers reinforce the group's growing graph.
    if (concepts.length) {
      const top = [...concepts]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 20)
        .map((c) => `- ${c.label}: ${c.definition}`)
        .join('\n');
      sections.push(`The group's concept map so far:\n${top}`);
    }

    sections.push(
      'You are this study circle\'s AI companion. Ground your answers in the shared knowledge base and the group\'s goals above. When the knowledge base is relevant, build on it; when it is missing something important, say so and suggest what the group could add.'
    );

    return sections.join('\n\n');
  }

  /** Counts occurrences and returns the most common non-empty values (case-insensitive). */
  private aggregate(values: (string | undefined)[], max = 6): string[] {
    const counts = new Map<string, { label: string; n: number }>();
    for (const v of values) {
      const label = (v || '').trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.n += 1;
      else counts.set(key, { label, n: 1 });
    }
    return [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, max)
      .map((e) => e.label);
  }

  // ─── Concept graph ───────────────────────────────────────────────────────────

  /** The group's persisted concept graph, most important concepts first. */
  async getGraph(uid: string, groupId: string): Promise<CircleConcept[]> {
    await this.loadGroupForMember(groupId, uid);
    const concepts = await studyCircleRepository.listConcepts(groupId);
    return concepts.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Synthesizes the circle's shared knowledge + recent conversation into a concept graph via one
   * structured LLM call, then MERGES the result into the persisted graph (dedup by label, reinforce
   * mentions, accumulate relationships) so the graph grows over time rather than being rebuilt.
   */
  async synthesizeGraph(uid: string, groupId: string): Promise<CircleConcept[]> {
    const group = await this.loadGroupForMember(groupId, uid);

    const [knowledge, turns, existing] = await Promise.all([
      studyCircleRepository.listKnowledge(groupId),
      studyCircleRepository.listChatTurns(groupId, 15),
      studyCircleRepository.listConcepts(groupId),
    ]);

    if (knowledge.length === 0 && turns.length === 0) {
      throw new StudyCircleError(
        400,
        'Add some knowledge or ask the circle a question first, so there is material to map.'
      );
    }

    const material = this.buildSynthesisMaterial(group, knowledge, turns);
    const extracted = await this.extractConcepts(material);
    if (extracted.length === 0) {
      // The model returned nothing usable — leave the existing graph untouched.
      return existing.sort((a, b) => b.importance - a.importance);
    }

    const merged = this.mergeConcepts(groupId, existing, extracted);
    await studyCircleRepository.batchSaveConcepts(groupId, merged);
    return merged.sort((a, b) => b.importance - a.importance);
  }

  private buildSynthesisMaterial(
    group: StudyGroup,
    knowledge: CircleKnowledgeItem[],
    turns: CircleChatTurn[]
  ): string {
    const parts: string[] = [];
    parts.push(`Study group: ${group.name}${group.subject ? ` (subject: ${group.subject})` : ''}`);

    if (knowledge.length) {
      const items = knowledge
        .slice(0, 80)
        .map((k) => `- ${k.title ? `${k.title}: ` : ''}${k.text}`.slice(0, 500))
        .join('\n');
      parts.push(`Shared knowledge items:\n${items}`);
    }

    if (turns.length) {
      const qa = turns
        .slice(-10)
        .map((t) => `Q: ${t.question}\nA: ${t.answer}`.slice(0, 800))
        .join('\n\n');
      parts.push(`Recent questions & answers:\n${qa}`);
    }

    return parts.join('\n\n').slice(0, 12000);
  }

  private async extractConcepts(material: string): Promise<ExtractedConcept[]> {
    const prompt = `From the following study-group material, extract the key CONCEPTS and how they relate, as a knowledge graph.

Return JSON of exactly this shape:
{ "concepts": [ { "label": string, "definition": string, "importance": number, "related": string[] } ] }

Rules:
- "label": a concise, canonical concept name in Title Case (1-4 words). No duplicates.
- "definition": one or two clear sentences.
- "importance": a number from 0 to 1 for how central the concept is to this group's studies.
- "related": labels of OTHER concepts in this same list that this concept is directly connected to.
- Produce between 6 and 25 concepts. Focus on subject matter; ignore small talk.

MATERIAL:
${material}`;

    const result = await callStructuredLLM<{ concepts: ExtractedConcept[] }>({
      prompt,
      label: 'circle.concepts',
      system:
        'You are an expert curriculum knowledge-graph builder. Output ONLY valid JSON matching the requested schema.',
      validate: (d) => ({ ok: !!d && Array.isArray(d.concepts) }),
    });

    if (!result.ok || !result.data?.concepts) return [];

    return result.data.concepts
      .filter((c) => c && typeof c.label === 'string' && c.label.trim())
      .map((c) => ({
        label: c.label.trim().slice(0, 80),
        definition: (c.definition ?? '').toString().trim().slice(0, 600),
        importance: clamp01(typeof c.importance === 'number' ? c.importance : 0.5),
        related: Array.isArray(c.related)
          ? c.related.map((r) => (r ?? '').toString().trim()).filter(Boolean)
          : [],
      }))
      .slice(0, 40);
  }

  /**
   * Merges freshly-extracted concepts into the existing graph: existing labels are reinforced
   * (mentions++, importance = max, longer definition kept); new labels are created. Relationships
   * are resolved from labels to ids and stored undirected.
   */
  private mergeConcepts(
    groupId: string,
    existing: CircleConcept[],
    extracted: ExtractedConcept[]
  ): CircleConcept[] {
    const now = Date.now();
    const byLabel = new Map<string, CircleConcept>();
    for (const c of existing) byLabel.set(normLabel(c.label), c);

    // Pass 1 — upsert the nodes.
    for (const e of extracted) {
      const key = normLabel(e.label);
      const found = byLabel.get(key);
      if (found) {
        if (e.definition.length > found.definition.length) found.definition = e.definition;
        found.importance = Math.max(found.importance, e.importance);
        found.mentions = (found.mentions ?? 0) + 1;
        found.updatedAt = now;
      } else {
        byLabel.set(key, {
          id: uuidv4(),
          groupId,
          label: e.label,
          definition: e.definition,
          importance: e.importance,
          mentions: 1,
          relatedConceptIds: [],
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Pass 2 — resolve related labels to ids and link undirected.
    const addLink = (concept: CircleConcept, otherId: string) => {
      if (otherId !== concept.id && !concept.relatedConceptIds.includes(otherId)) {
        concept.relatedConceptIds.push(otherId);
      }
    };
    for (const e of extracted) {
      const self = byLabel.get(normLabel(e.label));
      if (!self) continue;
      for (const relLabel of e.related) {
        const other = byLabel.get(normLabel(relLabel));
        if (!other) continue;
        addLink(self, other.id);
        addLink(other, self.id);
      }
    }

    return [...byLabel.values()];
  }
}

export const studyCircleService = new StudyCircleService();
