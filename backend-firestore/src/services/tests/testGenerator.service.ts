interface UserStats {
  userId: string;
  coachMemory: {
    preferredDifficulty: string;
    weakTopics: string[];
  };
}

export class TestGeneratorService {
  public async generateTest(userId: string, topic: string): Promise<any> {
    // Mock fetching user stats
    const mockUserStats: UserStats = {
      userId,
      coachMemory: {
        preferredDifficulty: 'medium',
        weakTopics: ['Algebra', 'Physics']
      }
    };

    // Read UserStats.coachMemory and adapt difficulty
    let difficulty = 'standard';
    
    if (mockUserStats.coachMemory.weakTopics.includes(topic)) {
      difficulty = 'adaptive_easier';
    } else {
      difficulty = mockUserStats.coachMemory.preferredDifficulty;
    }
    
    console.log(`Generating test for ${userId} on ${topic} with difficulty ${difficulty}`);
    
    return {
      testId: `test_${Date.now()}`,
      userId,
      topic,
      difficulty,
      questions: [
        { q: 'Question 1', a: 'Answer 1' }
      ]
    };
  }
}

export const testGeneratorService = new TestGeneratorService();
