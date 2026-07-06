import fs from 'fs';
import path from 'path';
import { RetrievalService } from '../src/services/rag/retrieval.service';
import goldenDataset from '../tests/fixtures/golden_dataset.json';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface LlmEvaluation {
  explanationScore: number; // 0-10
  conceptCompleteness: number; // 0-10
  hallucinationDetected: boolean;
  beginnerFriendly: boolean;
  examRelevance: number; // 0-10
  reasoning: string;
}

interface BenchmarkResult {
  id: string;
  question: string;
  expected_concepts: string[];
  retrieved_text: string;
  citation_accuracy: number;
  retrieval_latency_ms: number;
  precision_at_k: number;
  recall_at_k: number;
  llm_evaluation: LlmEvaluation | null;
}

interface ProviderBenchmark {
  provider: string;
  average_latency_ms: number;
  average_explanation_score: number;
  hallucination_rate: number;
}

interface RegressionReport {
  timestamp: string;
  total_questions: number;
  average_retrieval_latency_ms: number;
  average_citation_accuracy: number;
  average_precision: number;
  average_recall: number;
  hallucination_rate: number;
  provider_benchmarks: ProviderBenchmark[];
  results: BenchmarkResult[];
}

async function evaluateWithLLM(question: string, context: string, expectedConcepts: string[]): Promise<LlmEvaluation | null> {
  const prompt = `
  You are an expert educational evaluator. Evaluate the following retrieved context for a student question.
  
  Question: ${question}
  Expected Concepts: ${expectedConcepts.join(', ')}
  Retrieved Context: ${context}
  
  Evaluate strictly based on the provided context. Do NOT use outside knowledge.
  Output JSON format ONLY:
  {
    "explanationScore": <0-10 rating of how well the context explains the answer>,
    "conceptCompleteness": <0-10 rating of how many expected concepts are covered>,
    "hallucinationDetected": <boolean, true if context contains claims contradicting standard facts or logic>,
    "beginnerFriendly": <boolean, true if explained simply>,
    "examRelevance": <0-10 rating of usefulness for exam preparation>,
    "reasoning": "<brief string explaining the scores>"
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    
    if (response.text) {
      return JSON.parse(response.text) as LlmEvaluation;
    }
  } catch (error) {
    console.error("LLM Evaluation failed:", error);
  }
  return null;
}

async function runRegression() {
  console.log('--- Starting Hybrid Evaluation Regression Suite ---');
  const service = new RetrievalService();
  const results: BenchmarkResult[] = [];
  
  let totalLatency = 0;
  let totalCitations = 0;
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalHallucinations = 0;
  let totalExplanation = 0;

  for (const q of goldenDataset) {
    console.log(`Running question: ${q.id}`);
    const start = performance.now();
    let retrievedText = '';
    let retrievedDocs: any[] = [];
    
    try {
      // Simulate fetching top 5 docs
      retrievedDocs = await service.retrieveContext(q.question, 'mock_notebook', { exam: 'General', subject: 'General' }, 5);
      retrievedText = retrievedDocs.map(d => d.text).join(' ');
    } catch (e) {
      console.error(`Error retrieving context for ${q.id}`);
      retrievedText = "Error simulating context retrieval.";
    }
    
    const end = performance.now();
    const latency = end - start;
    
    // Objective Metrics: Precision & Recall based on expected concepts appearing
    let conceptsFound = 0;
    for (const concept of q.expected_concepts) {
      if (retrievedText.toLowerCase().includes(concept.toLowerCase())) {
        conceptsFound++;
      }
    }
    
    const citationAccuracy = q.expected_concepts.length > 0 ? (conceptsFound / q.expected_concepts.length) : 0;
    
    // K = 5 (since we retrieved 5 docs)
    // Precision: Of the concepts we found, what fraction of K are they? (simplified heuristic)
    const precision_at_k = conceptsFound / 5;
    const recall_at_k = q.expected_concepts.length > 0 ? conceptsFound / q.expected_concepts.length : 0;

    // LLM Evaluation
    const llmEval = await evaluateWithLLM(q.question, retrievedText, q.expected_concepts);
    
    if (llmEval) {
       totalExplanation += llmEval.explanationScore;
       if (llmEval.hallucinationDetected) totalHallucinations++;
    }

    results.push({
      id: q.id,
      question: q.question,
      expected_concepts: q.expected_concepts,
      retrieved_text: retrievedText.substring(0, 150) + '...',
      citation_accuracy: citationAccuracy,
      retrieval_latency_ms: latency,
      precision_at_k,
      recall_at_k,
      llm_evaluation: llmEval
    });

    totalLatency += latency;
    totalCitations += citationAccuracy;
    totalPrecision += precision_at_k;
    totalRecall += recall_at_k;
  }

  const datasetSize = goldenDataset.length;
  
  const report: RegressionReport = {
    timestamp: new Date().toISOString(),
    total_questions: datasetSize,
    average_retrieval_latency_ms: totalLatency / datasetSize,
    average_citation_accuracy: totalCitations / datasetSize,
    average_precision: totalPrecision / datasetSize,
    average_recall: totalRecall / datasetSize,
    hallucination_rate: totalHallucinations / datasetSize,
    provider_benchmarks: [
      {
        provider: "Gemini",
        average_latency_ms: totalLatency / datasetSize, // Simulating for Gemini here
        average_explanation_score: totalExplanation / datasetSize,
        hallucination_rate: totalHallucinations / datasetSize
      },
      {
         // Placeholder for Groq which would be tested in a parallel runner
        provider: "Groq",
        average_latency_ms: 0,
        average_explanation_score: 0,
        hallucination_rate: 0
      }
    ],
    results
  };

  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }
  
  const reportFile = path.join(reportsDir, `benchmark_report_${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\nRegression complete. Report saved to ${reportFile}`);
  console.log(`Avg Latency: ${report.average_retrieval_latency_ms.toFixed(2)}ms`);
  console.log(`Citation Accuracy: ${(report.average_citation_accuracy * 100).toFixed(1)}%`);
  console.log(`Avg Recall@5: ${(report.average_recall * 100).toFixed(1)}%`);
  console.log(`Hallucination Rate: ${(report.hallucination_rate * 100).toFixed(1)}%`);
}

runRegression().catch(console.error);
