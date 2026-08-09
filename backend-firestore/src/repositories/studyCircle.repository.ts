import { db } from '../config/firebase';
import { CircleChatTurn, CircleConcept, CircleKnowledgeItem } from '../types';

/**
 * Persistence for the AI Study Circle: a group's shared knowledge base plus its evolving AI
 * conversation. Both live under the group document so they inherit its lifecycle:
 *   studyGroups/{groupId}/circleKnowledge/{itemId}
 *   studyGroups/{groupId}/circleChat/{turnId}
 */
export class StudyCircleRepository {
  private group(groupId: string) {
    return db.collection('studyGroups').doc(groupId);
  }

  private knowledgeCol(groupId: string) {
    return this.group(groupId).collection('circleKnowledge');
  }

  private chatCol(groupId: string) {
    return this.group(groupId).collection('circleChat');
  }

  private conceptCol(groupId: string) {
    return this.group(groupId).collection('circleConcepts');
  }

  // ─── Knowledge base ────────────────────────────────────────────────────────

  async addKnowledge(item: CircleKnowledgeItem): Promise<void> {
    await this.knowledgeCol(item.groupId).doc(item.id).set(item);
  }

  async getKnowledge(groupId: string, itemId: string): Promise<CircleKnowledgeItem | null> {
    const doc = await this.knowledgeCol(groupId).doc(itemId).get();
    return doc.exists ? (doc.data() as CircleKnowledgeItem) : null;
  }

  /** Newest first, so the panel shows the latest contributions at the top. */
  async listKnowledge(groupId: string, limit = 200): Promise<CircleKnowledgeItem[]> {
    const snapshot = await this.knowledgeCol(groupId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((d) => d.data() as CircleKnowledgeItem);
  }

  async deleteKnowledge(groupId: string, itemId: string): Promise<void> {
    await this.knowledgeCol(groupId).doc(itemId).delete();
  }

  // ─── Conversation log ────────────────────────────────────────────────────────

  async appendChatTurn(turn: CircleChatTurn): Promise<void> {
    await this.chatCol(turn.groupId).doc(turn.id).set(turn);
  }

  /** Most recent turns, returned oldest -> newest for display and LLM history. */
  async listChatTurns(groupId: string, limit = 50): Promise<CircleChatTurn[]> {
    const snapshot = await this.chatCol(groupId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((d) => d.data() as CircleChatTurn).reverse();
  }

  // ─── Concept graph ───────────────────────────────────────────────────────────

  async listConcepts(groupId: string, limit = 400): Promise<CircleConcept[]> {
    const snapshot = await this.conceptCol(groupId).limit(limit).get();
    return snapshot.docs.map((d) => d.data() as CircleConcept);
  }

  /** Upserts a set of concept nodes in a single atomic batch (dedup/merge is done in the service). */
  async batchSaveConcepts(groupId: string, concepts: CircleConcept[]): Promise<void> {
    if (concepts.length === 0) return;
    const batch = db.batch();
    for (const concept of concepts) {
      batch.set(this.conceptCol(groupId).doc(concept.id), concept);
    }
    await batch.commit();
  }
}

export const studyCircleRepository = new StudyCircleRepository();
