import fs from 'fs';
import path from 'path';
import { bootstrapDI } from '../../src/core/di/registry';
import { ChatService } from '../../src/services/chat.service';
import { metricsEngine } from '../../src/core/evaluators/MetricsEngine';
import { Telemetry } from '../../src/lib/telemetry';

// Ensure environment variables are loaded
import * as dotenv from 'dotenv';
dotenv.config();

// Apply global firebase mock if needed, or rely on setup.ts to be run by Jest.
// This benchmark will run as a Jest suite.

describe('AI Quality Benchmark & Regression Suite', () => {
  let chatService: ChatService;
  let dataset: any[];

  beforeAll(async () => {
    // We must bootstrap DI to ensure the Intelligence Layer is active
    bootstrapDI();
    chatService = new ChatService();

    const dataPath = path.join(__dirname, '../fixtures/ai_regression_dataset.json');
    dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  });

  it('should load the benchmark dataset', () => {
    expect(dataset.length).toBeGreaterThan(0);
  });

  describe('Executing Test Cases', () => {
    // Use an extended timeout since we are making real LLM calls
    jest.setTimeout(120000); 

    // We generate the test cases dynamically from the dataset
    // We cannot use `test.each` dynamically easily with async setup, so we do it in a loop if dataset is static.
    // Since dataset is loaded in beforeAll, we can't map over it outside the block.
    // Instead, we just run one big test block or require it directly.
  });
});

const staticDataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/ai_regression_dataset.json'), 'utf-8'));

describe('AI Quality Executions', () => {
  jest.setTimeout(120000); 
  let chatService: ChatService;

  beforeAll(async () => {
    bootstrapDI();
    chatService = new ChatService();
  });

  staticDataset.forEach((testCase: any) => {
    it(`[${testCase.category}] ${testCase.id}: ${testCase.prompt.substring(0, 30)}...`, async () => {
      
      const sessionId = `bench_${testCase.id}_${Date.now()}`;
      
      // Execute the chat prompt
      const result = await chatService.processChat(
        'mock_bench_user',
        sessionId,
        testCase.prompt,
        'grok-4.1-fast-reasoning', // Or fallback to gemini-1.5-pro
        'chat'
      );

      // Evaluate the interaction
      const evalResult = await metricsEngine.evaluateInteraction(
        testCase.prompt,
        result.reply,
        [], // No RAG context for these specific general benchmark cases unless we mock it
        testCase.expectedPedagogy,
        testCase.mustMention,
        testCase.studentProfile
      );

      // Log to telemetry
      Telemetry.logAIQuality(evalResult, { testId: testCase.id });

      // Assertions - We want high quality!
      expect(evalResult.overallScore).toBeGreaterThanOrEqual(0.6); // Minimum threshold
      expect(evalResult.hallucinationScore).toBeLessThanOrEqual(0.5); // Should not hallucinate
      
      if (testCase.expectedPedagogy === "Deflection" || testCase.expectedPedagogy === "Correction") {
        expect(evalResult.pedagogyMatch).toBe(true);
      }

    });
  });
});
