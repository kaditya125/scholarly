import { db } from '../../../config/firebase';
import { StudentContextService } from '../../../services/studentContext.service';
import { GroundingBrief, PodcastSource } from './types';

/**
 * Turns a PodcastSource (prompt | notebook | weak_topics | topic) into a GroundingBrief:
 * a title seed, the topic, base seed text, and the notebook scope for GraphRAG. Heavy
 * per-segment retrieval is deferred to the ConversationGenerator — this only establishes
 * WHAT to teach and WHERE to ground it. Reuses StudentContextService for weak topics.
 */
export class SourceResolver {
  private studentContext = new StudentContextService();

  async resolve(userId: string, source: PodcastSource): Promise<GroundingBrief> {
    const notebookId = (source.notebookId || '').trim();
    const sourceIds = source.sourceIds;

    switch (source.kind) {
      case 'prompt': {
        const prompt = (source.prompt || '').trim();
        return {
          titleSeed: prompt.slice(0, 80) || 'Custom Podcast',
          topic: prompt || 'the requested topic',
          baseText: prompt,
          notebookId,
          sourceIds,
          focusTopics: [],
        };
      }

      case 'topic': {
        const topic = (source.topic || source.prompt || '').trim();
        return {
          titleSeed: topic || 'Topic Podcast',
          topic: topic || 'the requested topic',
          baseText: topic,
          notebookId,
          sourceIds,
          focusTopics: topic ? [topic] : [],
        };
      }

      case 'weak_topics': {
        let weak: string[] = [];
        try {
          const ctx = await this.studentContext.aggregateContext(userId);
          weak = (ctx.memory?.weakTopics || []).slice(0, 6);
        } catch { /* fall back to empty */ }
        const topic = weak.length ? weak.join(', ') : 'your recent topics';
        return {
          titleSeed: weak.length ? `Weak Topics: ${weak.slice(0, 2).join(', ')}` : 'Weak Topics Revision',
          topic,
          baseText: weak.length ? `Focus on these weak topics: ${weak.join(', ')}.` : 'General revision session.',
          notebookId,
          sourceIds,
          focusTopics: weak,
        };
      }

      case 'notebook':
      default: {
        let title = 'Notebook';
        let description = '';
        if (notebookId) {
          try {
            const nb = await db.collection('notebooks').doc(notebookId).get();
            const d: any = nb.data() || {};
            title = d.title || d.name || 'Notebook';
            description = d.description || '';
          } catch { /* ignore — grounding still works via retrieval */ }
        }
        return {
          titleSeed: title,
          topic: title,
          baseText: [title, description].filter(Boolean).join(' — '),
          notebookId,
          sourceIds,
          focusTopics: [],
        };
      }
    }
  }
}

export const sourceResolver = new SourceResolver();
