import { IAIProvider } from '../interfaces/IAIProvider';
import { TOKENS, container } from '../di/container';

export interface EvaluationResult {
  groundingScore: number;       // 0 to 1
  hallucinationScore: number;   // 0 to 1
  citationAccuracy: number;     // 0 to 1
  pedagogyMatch: boolean;
  bloomMatch: boolean;
  personalizationMatch: boolean;
  overallScore: number;
  judgeFeedback: string;
}

export class MetricsEngine {
  private get provider(): IAIProvider {
    return container.resolve<IAIProvider>(TOKENS.ReasoningProvider);
  }

  /**
   * Evaluates an AI interaction against subjective and objective criteria using LLM-as-a-judge.
   */
  public async evaluateInteraction(
    prompt: string,
    aiResponse: string,
    retrievedContext: string[],
    expectedPedagogy: string,
    mustMention: string[],
    studentProfile: any
  ): Promise<EvaluationResult> {
    
    // Fallback heuristic for mustMention (objective)
    let mustMentionScore = 0;
    if (mustMention.length > 0) {
      const mentions = mustMention.filter(term => 
        aiResponse.toLowerCase().includes(term.toLowerCase())
      );
      mustMentionScore = mentions.length / mustMention.length;
    } else {
      mustMentionScore = 1;
    }

    const systemPrompt = `You are an expert AI Benchmark Judge evaluating a tutoring AI's response.
You must output a JSON object exactly matching this schema:
{
  "groundingScore": number (0 to 1),
  "hallucinationScore": number (0 to 1, where 1 means heavily hallucinated),
  "citationAccuracy": number (0 to 1),
  "pedagogyMatch": boolean,
  "bloomMatch": boolean,
  "personalizationMatch": boolean,
  "judgeFeedback": "string explaining reasoning"
}

EVALUATION CRITERIA:
1. GroundingScore: Does the AI response strictly rely on the Provided Context?
2. HallucinationScore: Does the AI introduce facts NOT present in the Context?
3. PedagogyMatch: Did the AI use the expected pedagogy (${expectedPedagogy})?
4. PersonalizationMatch: Did the AI tailor the response to the student profile (${JSON.stringify(studentProfile)})?`;

    const userMessage = `
--- USER PROMPT ---
${prompt}

--- AI RESPONSE ---
${aiResponse}

--- PROVIDED CONTEXT ---
${retrievedContext.join('\n---\n')}
`;

    try {
      const response = await this.provider.generateResponse(
        [{ role: 'user', content: userMessage }],
        systemPrompt,
        { temperature: 0.1 } // low temperature for consistent judging
      );

      // Clean the response text to extract JSON (in case model wraps it in markdown)
      const cleanJson = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const overallScore = (
        parsed.groundingScore * 0.3 +
        (1 - parsed.hallucinationScore) * 0.3 +
        (parsed.pedagogyMatch ? 1 : 0) * 0.15 +
        (parsed.personalizationMatch ? 1 : 0) * 0.15 +
        mustMentionScore * 0.1
      );

      return {
        groundingScore: parsed.groundingScore ?? 0,
        hallucinationScore: parsed.hallucinationScore ?? 1,
        citationAccuracy: parsed.citationAccuracy ?? 0,
        pedagogyMatch: parsed.pedagogyMatch ?? false,
        bloomMatch: parsed.bloomMatch ?? false,
        personalizationMatch: parsed.personalizationMatch ?? false,
        overallScore,
        judgeFeedback: parsed.judgeFeedback || 'No feedback provided.',
      };
    } catch (e) {
      console.error("[MetricsEngine] Failed to evaluate interaction:", e);
      // Return a zeroed fallback result on failure
      return {
        groundingScore: 0, hallucinationScore: 1, citationAccuracy: 0,
        pedagogyMatch: false, bloomMatch: false, personalizationMatch: false,
        overallScore: 0, judgeFeedback: 'Failed to parse judge output.'
      };
    }
  }
}

export const metricsEngine = new MetricsEngine();
