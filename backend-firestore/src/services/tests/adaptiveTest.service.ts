import { v4 as uuidv4 } from 'uuid';
import { studentContextService } from '../studentContext.service';
import { testsRepository } from '../../repositories/tests.repository';
import { MockTest, Question } from '../../types/tests.types';
import { Subject, Difficulty } from '../../types';

export class AdaptiveTestService {
  async generateAdaptiveTest(
    userId: string, 
    subject: Subject, 
    topic?: string,
    difficulty: Difficulty = 'Medium',
    questionCount: number = 10,
    timeLimitMins: number = 15
  ): Promise<MockTest> {
    
    // 1. Fetch user context to tailor the test (e.g. prioritize weak topics if topic is not explicitly provided)
    const context = await studentContextService.aggregateContext(userId);
    let targetTopic = topic;
    
    if (!targetTopic && context.memory?.weakTopics && context.memory.weakTopics.length > 0) {
      // Very basic heuristic: pick a weak topic if available
      targetTopic = context.memory.weakTopics[0];
    }

    // 2. Query Question Bank
    // For V1, we query existing questions. If none exist, we would fallback to generating via LLM.
    const questions = await testsRepository.getQuestionsBySubjectAndTopic(subject, targetTopic, questionCount);
    
    // 3. Create a unique Adaptive Mock Test document
    const adaptiveTestId = `adapt_${uuidv4()}`;
    const adaptiveTest: MockTest = {
      id: adaptiveTestId,
      title: `Adaptive ${subject} Test${targetTopic ? ` - ${targetTopic}` : ''}`,
      type: 'adaptive',
      category: 'SSC', // Defaulting for now, can be passed in
      subject,
      topic: targetTopic,
      difficulty,
      isLive: false,
      questionIds: questions.map(q => q.id),
      totalQuestions: questions.length,
      totalMarks: questions.length * 2, // e.g. 2 marks per question
      durationMinutes: timeLimitMins,
      positiveMarks: 2,
      negativeMarks: 0.5,
      participantsCount: 1, // Only the user generating it
      aiRecommended: true
    };
    
    // In a full implementation, we'd save this test to Firestore.
    // For now, we assume it's created ephemerally or stored.
    // await db.collection('mock_tests').doc(adaptiveTestId).set(adaptiveTest);

    return adaptiveTest;
  }
}

export const adaptiveTestService = new AdaptiveTestService();
