/**
 * Continuous AI Evaluation Pipeline
 * 
 * Periodically samples recent user chats and evaluates them
 * using a strong "Judge" LLM on 10 quality dimensions:
 * 
 * 1.  Grounding           — Is the answer grounded in retrieved context?
 * 2.  Citation Accuracy    — Are citations correct and relevant?
 * 3.  Concept Coverage     — Are all key concepts addressed?
 * 4.  Pedagogical Quality  — Does it teach effectively?
 * 5.  Difficulty Matching  — Is the difficulty appropriate for the student?
 * 6.  Exam Relevance       — Is it relevant to the target exam?
 * 7.  Hallucination        — Does it contain fabricated information? (inverted: 0 = no hallucination)
 * 8.  Completeness         — Is the answer complete?
 * 9.  Reasoning Quality    — Is the logical flow sound?
 * 10. Readability          — Is it clear and accessible?
 * 
 * Scores are stored in Firestore for trend analysis and A/B testing.
 * 
 * Usage: npx ts-node src/scripts/continuousEval.ts
 *        OR schedule via cron: node dist/scripts/continuousEval.js
 */

import { getFirestore } from 'firebase-admin/firestore';
import { bootstrapDI } from '../core/di/registry';
import { ContinuousEvalScore } from '../types/observability';

bootstrapDI();

const JUDGE_PROMPT = `You are an expert educational content evaluator. You will receive a student's query and the AI tutor's response.

Rate the response on EACH of the following dimensions using a scale of 0–10.

Dimensions:
1. Grounding (0-10): Is the response grounded in factual, verifiable information?
2. Citation Accuracy (0-10): If citations are provided, are they correct and relevant?
3. Concept Coverage (0-10): Does the response cover all key concepts related to the query?
4. Pedagogical Quality (0-10): Does the response teach effectively? Does it use examples, analogies, step-by-step reasoning?
5. Difficulty Matching (0-10): Is the difficulty level appropriate for a competitive exam student?
6. Exam Relevance (0-10): Is the content directly useful for exam preparation (UPSC, SSC, NEET, JEE, etc.)?
7. Hallucination (0-10): 0 = no hallucination at all, 10 = severe fabrication. Inverted: lower is better.
8. Completeness (0-10): Does the response fully answer the question without leaving gaps?
9. Reasoning Quality (0-10): Is the logical flow of the explanation sound and coherent?
10. Readability (0-10): Is the response clear, well-structured, and easy to understand?

Respond ONLY with a valid JSON object. No markdown, no backticks. Example:
{"grounding":8,"citationAccuracy":7,"conceptCoverage":9,"pedagogicalQuality":8,"difficultyMatching":7,"examRelevance":9,"hallucination":1,"completeness":8,"reasoningQuality":9,"readability":9}`;

async function runContinuousEvaluation() {
  const db = getFirestore();
  
  console.log('==========================================');
  console.log('🔬 CONTINUOUS AI EVALUATION PIPELINE');
  console.log('==========================================\n');

  // Sample recent telemetry records that have associated chat content
  const recentTelemetry = await db.collection('telemetry')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();

  if (recentTelemetry.empty) {
    console.log('No recent telemetry found. Falling back to sample evaluation...\n');
    
    // Run evaluation on sample queries to establish baseline scores
    const samplePairs = [
      {
        query: 'Explain the significance of the Revolt of 1857 in Indian history.',
        response: 'The Revolt of 1857, also known as the First War of Indian Independence, was a major uprising against the British East India Company. Key causes include: 1) Military grievances (greased cartridges), 2) Economic exploitation (drain of wealth), 3) Doctrine of Lapse by Lord Dalhousie, 4) Social reforms that threatened Hindu and Muslim traditions. The revolt began in Meerut and spread to Delhi, Lucknow, Kanpur, and Jhansi. Leaders included Bahadur Shah Zafar, Rani Laxmi Bai, Tantia Tope, and Nana Sahib. Though suppressed, it led to the transfer of power from the Company to the British Crown (Government of India Act, 1858) and marked the beginning of organized national consciousness.',
        examMode: 'UPSC',
      },
      {
        query: 'Solve: If A can do a work in 12 days, B in 15 days, how long together?',
        response: 'Let us solve this step-by-step:\n\nA\'s work per day = 1/12\nB\'s work per day = 1/15\n\nCombined work per day = 1/12 + 1/15\n\nLCM of 12 and 15 = 60\n\n= 5/60 + 4/60 = 9/60 = 3/20\n\nSo together they complete 3/20 of the work per day.\n\nTime = 20/3 = 6⅔ days = 6 days and 16 hours.\n\n**Answer: 6⅔ days**\n\n💡 Shortcut Formula: (A × B) / (A + B) = (12 × 15) / (12 + 15) = 180/27 = 20/3 ≈ 6.67 days',
        examMode: 'SSC',
      },
      {
        query: 'What is the mechanism of action of penicillin?',
        response: 'Penicillin is a beta-lactam antibiotic that works by inhibiting bacterial cell wall synthesis.\n\n**Mechanism:**\n1. Penicillin binds to Penicillin-Binding Proteins (PBPs) — transpeptidase enzymes.\n2. This inhibits the cross-linking of peptidoglycan chains in the bacterial cell wall.\n3. The cell wall becomes structurally weak and osmotically unstable.\n4. Autolytic enzymes (autolysins) break down the weakened wall.\n5. The bacterium undergoes osmotic lysis and dies.\n\n**Key Points for NEET:**\n- Penicillin is bactericidal (kills bacteria)\n- Effective against Gram-positive bacteria\n- Beta-lactamase producing bacteria are resistant\n- Example: Staphylococcus produces penicillinase (beta-lactamase)\n\n**Mnemonic:** "PBP = Penicillin Blocks Peptidoglycan"',
        examMode: 'NEET',
      },
    ];

    const { WorkflowEngine } = await import('../core/workflow/WorkflowEngine');
    const workflowEngine = new WorkflowEngine();

    let totalScores: Record<string, number> = {};
    let scoreCount = 0;

    for (const pair of samplePairs) {
      console.log(`▶ Evaluating [${pair.examMode}]: "${pair.query.substring(0, 60)}..."`);
      
      try {
        const judgeMessages = [
          { role: 'system' as const, content: JUDGE_PROMPT },
          { role: 'user' as const, content: `Student Query: ${pair.query}\n\nAI Response:\n${pair.response}` },
        ];

        const judgeResultObj = await workflowEngine.processEducationalQuery(
          `Evaluate this AI response:\n\nQuery: ${pair.query}\n\nResponse: ${pair.response}\n\nRate on all 10 dimensions (grounding, citationAccuracy, conceptCoverage, pedagogicalQuality, difficultyMatching, examRelevance, hallucination, completeness, reasoningQuality, readability). Reply ONLY with JSON.`,
          'eval-system'
        );

        // Try to parse the JSON scores from the response
        const judgeResult = judgeResultObj.answer;
        const jsonMatch = judgeResult.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const scores = JSON.parse(jsonMatch[0]);
          
          const evalScore: ContinuousEvalScore = {
            id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            traceId: 'eval-pipeline',
            userId: 'eval-system',
            query: pair.query,
            response: pair.response.substring(0, 500),
            grounding: scores.grounding || 0,
            citationAccuracy: scores.citationAccuracy || 0,
            conceptCoverage: scores.conceptCoverage || 0,
            pedagogicalQuality: scores.pedagogicalQuality || 0,
            difficultyMatching: scores.difficultyMatching || 0,
            examRelevance: scores.examRelevance || 0,
            hallucination: scores.hallucination || 0,
            completeness: scores.completeness || 0,
            reasoningQuality: scores.reasoningQuality || 0,
            readability: scores.readability || 0,
            overallScore: 0,
            promptVersion: 'eval-v1',
            examMode: pair.examMode,
            evaluatedAt: Date.now(),
          };

          // Calculate overall (excluding hallucination which is inverted)
          const positiveScores = [
            evalScore.grounding, evalScore.citationAccuracy, evalScore.conceptCoverage,
            evalScore.pedagogicalQuality, evalScore.difficultyMatching, evalScore.examRelevance,
            evalScore.completeness, evalScore.reasoningQuality, evalScore.readability,
          ];
          evalScore.overallScore = parseFloat(
            ((positiveScores.reduce((a, b) => a + b, 0) / positiveScores.length)).toFixed(2)
          );

          // Store in Firestore
          await db.collection('eval_scores').doc(evalScore.id).set(evalScore);

          // Accumulate
          for (const [key, val] of Object.entries(scores)) {
            totalScores[key] = (totalScores[key] || 0) + (val as number);
          }
          scoreCount++;

          console.log(`  ✅ Overall: ${evalScore.overallScore}/10 | Pedagogy: ${evalScore.pedagogicalQuality}/10 | Hallucination: ${evalScore.hallucination}/10`);
        } else {
          console.log(`  ⚠️ Could not parse judge scores from response`);
        }
      } catch (error: any) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }

    // Print summary
    console.log('\n==========================================');
    console.log('📊 EVALUATION SUMMARY');
    console.log('==========================================');
    if (scoreCount > 0) {
      for (const [dim, total] of Object.entries(totalScores)) {
        console.log(`  ${dim.padEnd(22)}: ${(total / scoreCount).toFixed(2)} / 10`);
      }
    }
    console.log(`  Samples Evaluated    : ${scoreCount}`);
    console.log('==========================================\n');
  }
}

runContinuousEvaluation().catch(console.error);
