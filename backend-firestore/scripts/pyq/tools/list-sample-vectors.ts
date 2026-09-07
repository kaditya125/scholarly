import 'dotenv/config';
import { pyqRepository } from '../../../src/repositories/pyq.repository';

async function listSampleVectors() {
  console.log('Fetching sample vector IDs from Firestore (pyq_questions)...');
  
  const upsc = await pyqRepository.listQuestions({
    examId: 'UPSC_CSE',
    vectorIndexed: true,
    limit: 5,
  });

  console.log(`\n=== UPSC CSE Vector IDs (Pinecone index: edtech-ai-rag | namespace: production) ===`);
  console.log(`Found ${upsc.length} indexed questions:`);
  upsc.forEach((q, idx) => {
    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    console.log(`[${idx + 1}] Vector ID : ${vectorId}`);
    console.log(`    Question ID: ${q.questionId}`);
    console.log(`    Year       : ${q.year} | Paper: ${q.paper || q.shift} | Subject: ${q.subject}`);
    console.log(`    Topic      : ${q.topic}`);
    console.log(`    Snippet    : ${q.questionText.slice(0, 90)}...\n`);
  });

  const bpsc = await pyqRepository.listQuestions({
    examId: 'BPSC_CCE',
    vectorIndexed: true,
    limit: 5,
  });

  console.log(`=== BPSC CCE Vector IDs (Pinecone index: edtech-ai-rag | namespace: production) ===`);
  console.log(`Found ${bpsc.length} indexed questions:`);
  bpsc.forEach((q, idx) => {
    const vectorId = `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    console.log(`[${idx + 1}] Vector ID : ${vectorId}`);
    console.log(`    Question ID: ${q.questionId}`);
    console.log(`    Year       : ${q.year} | Paper: ${q.paper || q.shift} | Subject: ${q.subject}`);
    console.log(`    Topic      : ${q.topic}`);
    console.log(`    Snippet    : ${q.questionText.slice(0, 90)}...\n`);
  });

  process.exit(0);
}

listSampleVectors().catch((err) => {
  console.error(err);
  process.exit(1);
});
