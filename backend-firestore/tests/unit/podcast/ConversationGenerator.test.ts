import { conversationGenerator } from '../../../src/core/workflow/podcast/ConversationGenerator';
import { callStructuredLLM } from '../../../src/services/ai/structuredLlm';
import { retrievalService } from '../../../src/services/rag/retrieval.service';
import { graphRetrievalService } from '../../../src/services/rag/graphRetrieval.service';

jest.mock('../../../src/services/ai/structuredLlm');
jest.mock('../../../src/services/rag/retrieval.service');
jest.mock('../../../src/services/rag/graphRetrieval.service');

describe('ConversationGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a conversation script relying on GraphRAG retrieved context', async () => {
    (retrievalService.retrieveContext as jest.Mock).mockResolvedValue([
      { text: 'Chloroplasts absorb sunlight.', source: 'nb1', score: 0.9 }
    ]);
    (graphRetrievalService.getGraphContext as jest.Mock).mockResolvedValue({
      contextString: 'Chlorophyll is green.'
    });
    
    (callStructuredLLM as jest.Mock).mockResolvedValue({
      ok: true,
      data: [
        { speaker: 'Teacher', text: 'Welcome to our lesson on photosynthesis.' },
        { speaker: 'Student', text: 'What is a chloroplast?' }
      ]
    });

    const brief = { notebookId: 'nb1', topic: 'Photosynthesis', titleSeed: '', baseText: '', focusTopics: [] };
    const plan = {
      title: 'Photosynthesis',
      language: 'English',
      speakers: [{ name: 'Teacher', role: 'Teacher', voiceStyle: 'warm_teacher' as any }],
      segments: [
        { index: 0, title: 'Intro', objective: 'Explain basics', talkingPoints: [], retrievalQuery: 'basics', targetWords: 100 }
      ]
    } as any;

    const script = await conversationGenerator.generate('user1', brief, plan);
    
    expect(script.lines.length).toBe(2);
    expect(script.lines[0].text).toContain('Welcome to our lesson');
    // Ensure RAG services were invoked
    expect(retrievalService.retrieveContext).toHaveBeenCalled();
    expect(graphRetrievalService.getGraphContext).toHaveBeenCalled();
    // Citations are attached PER LINE (ScriptLine.citations), not to the script as
    // a whole — that is what powers click-transcript → jump-to-source.
    expect(script.lines[0].citations).toEqual([{ source: 'nb1', score: 0.9 }]);
  });

  it('should fallback to basic script if LLM fails', async () => {
    (callStructuredLLM as jest.Mock).mockResolvedValue({ ok: false, error: 'LLM failed' });

    const brief = { notebookId: 'nb1', topic: 'Photosynthesis', titleSeed: '', baseText: '', focusTopics: [] };
    const plan = {
      title: 'Photosynthesis',
      language: 'English',
      speakers: [{ name: 'Teacher', role: 'Teacher', voiceStyle: 'warm_teacher' as any }],
      segments: [
        { index: 0, title: 'Intro Segment', objective: 'Explain basics', talkingPoints: [], retrievalQuery: 'basics', targetWords: 100 }
      ]
    } as any;

    const script = await conversationGenerator.generate('user1', brief, plan);
    
    expect(script.lines.length).toBe(1);
    expect(script.lines[0].text).toContain('Intro Segment. Explain basics');
  });
});
