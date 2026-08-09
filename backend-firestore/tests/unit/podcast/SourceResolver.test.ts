import { sourceResolver } from '../../../src/core/workflow/podcast/SourceResolver';
import { StudentContextService } from '../../../src/services/studentContext.service';

jest.mock('../../../src/services/studentContext.service');

describe('SourceResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve a prompt source correctly', async () => {
    const brief = await sourceResolver.resolve('user_123', { kind: 'prompt', prompt: 'Explain quantum physics' });
    expect(brief.topic).toBe('Explain quantum physics');
    expect(brief.baseText).toBe('Explain quantum physics');
    expect(brief.focusTopics).toEqual([]);
    expect(brief.notebookId).toBe('');
  });

  it('should resolve a weak_topics source correctly with mocked student memory', async () => {
    (StudentContextService.prototype.aggregateContext as jest.Mock).mockResolvedValue({
      memory: { weakTopics: ['Thermodynamics', 'Optics'] }
    });

    const brief = await sourceResolver.resolve('user_123', { kind: 'weak_topics' });
    expect(brief.titleSeed).toContain('Weak Topics: Thermodynamics, Optics');
    expect(brief.topic).toBe('Thermodynamics, Optics');
    expect(brief.focusTopics).toEqual(['Thermodynamics', 'Optics']);
  });

  it('should fallback gracefully if student memory fails for weak_topics', async () => {
    (StudentContextService.prototype.aggregateContext as jest.Mock).mockRejectedValue(new Error('Memory DB down'));

    const brief = await sourceResolver.resolve('user_123', { kind: 'weak_topics' });
    expect(brief.topic).toBe('your recent topics');
    expect(brief.focusTopics).toEqual([]);
  });

  it('should resolve a topic source correctly', async () => {
    const brief = await sourceResolver.resolve('user_123', { kind: 'topic', topic: 'Photosynthesis' });
    expect(brief.topic).toBe('Photosynthesis');
    expect(brief.focusTopics).toEqual(['Photosynthesis']);
  });
});
