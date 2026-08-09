import { v4 as uuidv4 } from 'uuid';
import { podcastRepository } from '../../repositories/podcast.repository';
import { knowledgeService } from '../../core/knowledge';
import { container, TOKENS } from '../../core/di/container';
import { IAIProvider } from '../../core/interfaces/IAIProvider';
import { Response } from 'express';

export class LiveInteractionService {
  /**
   * Handles a live Q&A interaction during podcast playback.
   * Streams the text answer back to the client using SSE.
   */
  async ask(
    userId: string,
    podcastId: string,
    question: string,
    timeMs: number,
    segmentId: number,
    res: Response
  ): Promise<void> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) {
      res.status(404).end();
      return;
    }

    const notebookId = podcast.notebookId || '';
    const sourceIds = podcast.sourceKind === 'notebook' && (podcast as any).source?.sourceIds ? (podcast as any).source.sourceIds : undefined;

    let grounding = '';
    let citations: { source: string; score: number }[] = [];

    // Grounding phase through KnowledgeService
    try {
      const contextBundle = await knowledgeService.getSourceContext(question, notebookId, {
        sourceIds,
        topK: 5,
        includeKnowledgeGraph: !!notebookId,
        artifactType: 'PODCAST',
        consumerContext: 'Live Podcast Q&A Interaction',
      });
      citations = contextBundle.citations.map(c => ({ source: c.source, score: c.score }));
      grounding = contextBundle.contextString;
    } catch {
      // Best effort grounding
    }

    const prompt = `You are the Teacher from the educational podcast "${podcast.title}".
The student has paused the podcast at ${Math.round(timeMs / 1000)} seconds to ask a question.
Answer their question directly and naturally, in your established teaching style. Keep it conversational but concise.

Question: ${question}

Use the following grounding context to inform your answer. Only use facts from this context:
${grounding ? grounding.slice(0, 4000) : '(No specific context found. Answer generally.)'}`;

    const system = 'You are a helpful, conversational teacher in an educational podcast. Output only your response text.';

    const aiProvider = container.resolve<IAIProvider>(TOKENS.AIProvider);
    const context = { userId, notebookId: notebookId || undefined, operation: 'podcast_ask' };

    let fullAnswer = '';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const anyProvider: any = aiProvider;
    const history = [{ role: 'user' as const, content: prompt, timestamp: Date.now() }];

    if (typeof anyProvider.generateStreamResponse === 'function') {
      const stream = anyProvider.generateStreamResponse(history, system, context);
      for await (const chunk of stream) {
        fullAnswer += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    } else {
      const response = await aiProvider.generateResponse(history, system, context);
      fullAnswer = response.reply;
      res.write(`data: ${JSON.stringify({ text: fullAnswer })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    // Log the interaction
    const interactionId = `int_${uuidv4()}`;
    await podcastRepository.createInteraction(podcastId, interactionId, {
      id: interactionId,
      userId,
      atTimeMs: timeMs,
      segmentId,
      questionText: question,
      answerText: fullAnswer,
      citations,
      createdAt: Date.now(),
    });
  }
}

export const liveInteractionService = new LiveInteractionService();
