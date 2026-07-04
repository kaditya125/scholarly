import fs from 'fs';
import path from 'path';
import { RetrievalService } from '../src/services/rag/retrieval.service';
import goldenDataset from '../tests/fixtures/golden_dataset.json';

interface BenchmarkResult {
  id: string;
  question: string;
  expected_concepts: string[];
  retrieved_text: string;
  citation_accuracy: number;
  retrieval_latency_ms: number;
  hallucination_detected: boolean;
}

interface RegressionReport {
  timestamp: string;
  total_questions: number;
  average_retrieval_latency_ms: number;
  average_citation_accuracy: number;
  hallucination_rate: number;
  results: BenchmarkResult[];
}

async function runRegression() {
  console.log('--- Starting Golden Benchmark Regression ---');
  const service = new RetrievalService();
  const results: BenchmarkResult[] = [];
  let totalLatency = 0;
  let totalCitations = 0;
  let totalHallucinations = 0;

  for (const q of goldenDataset) {
    console.log(`Running question: ${q.id}`);
    const start = performance.now();
    let retrievedText = '';
    
    try {
      const docs = await service.retrieveContext(q.question, 'mock_notebook', { exam: 'General', subject: 'General' }, 5);
      retrievedText = docs.map(d => d.text).join(' ');
    } catch (e) {
      console.error(`Error retrieving context for ${q.id}`, e);
    }
    
    const end = performance.now();
    const latency = end - start;
    
    // Very basic heuristic for evaluation
    let conceptsFound = 0;
    for (const concept of q.expected_concepts) {
      if (retrievedText.toLowerCase().includes(concept.toLowerCase())) {
        conceptsFound++;
      }
    }
    
    const citationAccuracy = q.expected_concepts.length > 0 ? (conceptsFound / q.expected_concepts.length) : 0;
    
    // Dummy hallucination check for now, in a real system this would use an LLM-as-a-judge
    const hallucinationDetected = citationAccuracy < 0.5; 
    
    results.push({
      id: q.id,
      question: q.question,
      expected_concepts: q.expected_concepts,
      retrieved_text: retrievedText.substring(0, 100) + '...',
      citation_accuracy: citationAccuracy,
      retrieval_latency_ms: latency,
      hallucination_detected: hallucinationDetected
    });

    totalLatency += latency;
    totalCitations += citationAccuracy;
    if (hallucinationDetected) totalHallucinations++;
  }

  const report: RegressionReport = {
    timestamp: new Date().toISOString(),
    total_questions: goldenDataset.length,
    average_retrieval_latency_ms: totalLatency / goldenDataset.length,
    average_citation_accuracy: totalCitations / goldenDataset.length,
    hallucination_rate: totalHallucinations / goldenDataset.length,
    results
  };

  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
  }
  
  const reportFile = path.join(reportsDir, `regression_report_${Date.now()}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\nRegression complete. Report saved to ${reportFile}`);
  console.log(`Avg Latency: ${report.average_retrieval_latency_ms.toFixed(2)}ms`);
  console.log(`Avg Citation Accuracy: ${(report.average_citation_accuracy * 100).toFixed(1)}%`);
  console.log(`Hallucination Rate: ${(report.hallucination_rate * 100).toFixed(1)}%`);
}

runRegression().catch(console.error);
