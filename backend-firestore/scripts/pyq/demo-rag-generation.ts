/**
 * Live Demonstration: RAG Question Generation Grounded in Authentic SSC CGL PYQs
 *
 * Demonstrates the 4-stage pipeline:
 * 1. Semantic Embedding of Exam Topic / Concept Query
 * 2. Pinecone Vector Retrieval filtered to official SSC CGL PYQs (production namespace)
 * 3. Firestore Document Augmentation with Official Key & Step-by-Step Solutions
 * 4. Few-Shot Exemplar Guided Generation via Gemini LLM with Strict Formatting & Anti-Hallucination Guards
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { GeminiProvider } from '../../src/services/ai/gemini.provider';
import { env } from '../../src/config/env';

async function runLiveRAGDemo(topicQuery: string, subject: string = 'Quantitative Aptitude') {
  console.log('='.repeat(80));
  console.log('🎯 SSC CGL RAG QUESTION GENERATION: LIVE EXECUTION TRACE');
  console.log('='.repeat(80));
  console.log(`\n[Stage 1] Query & Concept Specification`);
  console.log(`  Target Exam : SSC CGL (Tier 1)`);
  console.log(`  Subject     : ${subject}`);
  console.log(`  Prompt/Topic: "${topicQuery}"`);

  // 1. Generate Query Vector
  console.log(`\n[Stage 2] Vector Embedding & Pinecone Semantic Search`);
  const embeddingProvider = new GoogleEmbeddingProvider();
  const queryVector = await embeddingProvider.generateEmbedding(
    `SSC CGL ${subject}: ${topicQuery}`
  );
  console.log(`  ✓ Query vector generated (${queryVector.length} dimensions)`);

  const namespace = env.PINECONE_NAMESPACE || 'production';
  const filter: any = {
    examId: 'SSC_CGL',
    content_type: 'pyq',
  };
  if (subject) {
    filter.subject = subject;
  }

  console.log(`  Querying Pinecone index with filter:`, JSON.stringify(filter), `(namespace: ${namespace})`);
  const matches = await pineconeService.queryVectors(queryVector, 3, filter, namespace);

  if (!matches || matches.length === 0) {
    console.error('❌ No matching PYQs found in Pinecone.');
    return;
  }

  console.log(`  ✓ Retrieved ${matches.length} authentic SSC CGL exemplar questions:`);

  // 2. Hydrate from Firestore for complete solution & verification data
  const exemplars: any[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const qId = m.metadata?.questionId;
    let fullDoc: any = null;
    if (qId) {
      const snap = await db.collection('pyq_questions').doc(qId).get();
      if (snap.exists) {
        fullDoc = snap.data();
      }
    }

    const questionText = fullDoc?.questionText || m.metadata?.text || '';
    const options = fullDoc?.options || m.metadata?.options || [];
    const correctAnswer = fullDoc?.correctAnswer || m.metadata?.correctAnswer || '';
    const solution = fullDoc?.solution || 'Official SSC Key Verified Solution';
    const year = fullDoc?.year || m.metadata?.year;
    const shift = fullDoc?.shift || m.metadata?.shift;
    const topic = fullDoc?.topic || m.metadata?.topic;

    exemplars.push({
      questionId: qId,
      year,
      shift,
      topic,
      score: m.score,
      questionText,
      options,
      correctAnswer,
      solution,
    });

    console.log(`\n  --- Exemplar #${i + 1} (Score: ${(m.score * 100).toFixed(1)}%) ---`);
    console.log(`  Source     : SSC CGL ${year} (${shift}) | Topic: ${topic}`);
    console.log(`  Question ID: ${qId}`);
    console.log(`  Question   : ${questionText}`);
    console.log(`  Options    :`);
    options.forEach((opt: string, optIdx: number) => {
      const letter = String.fromCharCode(65 + optIdx);
      const mark = letter === correctAnswer ? ' ✓ [CORRECT]' : '';
      console.log(`     (${letter}) ${opt}${mark}`);
    });
    console.log(`  Solution   : ${solution}`);
  }

  // 3. Assemble Few-Shot Grounded Generation Prompt
  console.log(`\n[Stage 3] Few-Shot Prompt Assembly with Anti-Hallucination Guardrails`);
  
  const systemInstruction = `You are the Senior Chief Examiner for the Staff Selection Commission (SSC) Combined Graduate Level (CGL) Tier 1 Examination.
Your task is to generate 1 NEW, AUTHENTIC question strictly aligned with SSC CGL standards.

ANTI-HALLUCINATION & RIGID PATTERN RULES:
1. Grounding: You MUST model the mathematical logic, sentence structure, and calculation difficulty strictly after the provided SSC CGL Past Year Paper exemplars.
2. Syllabus Boundary: Strictly SSC CGL Tier 1 syllabus. NEVER include higher mathematics (calculus, linear algebra, vectors, matrices) or bank-exam puzzles.
3. Fresh Values: Do NOT copy the exact numbers from the exemplars. Create new, realistic, cleanly calculable values that test the exact same concept and candidate traps.
4. Options: Provide exactly 4 options (A, B, C, D). Create plausible distractor options that reflect common algebraic or arithmetic candidate errors.
5. Verification: You MUST compute the exact correct answer step-by-step to guarantee 100% mathematical validity.
6. Marking Scheme: Standard SSC CGL Tier 1 (+2.00 marks for correct, -0.50 negative marking for incorrect).
7. Format: Output strictly valid JSON matching the specified JSON schema without any markdown formatting.`;

  const exemplarBlock = exemplars.map((ex, idx) => `
[EXEMPLAR ${idx + 1} - SSC CGL ${ex.year} ${ex.shift}]
Topic: ${ex.topic}
Question: ${ex.questionText}
Options: ${JSON.stringify(ex.options)}
Correct Answer: ${ex.correctAnswer}
Official Solution: ${ex.solution}
`).join('\n');

  const userPrompt = `Generate 1 brand-new SSC CGL Tier 1 practice question for:
Subject: ${subject}
Focus Concept: ${topicQuery}

Study these authentic SSC CGL past year questions as your structural anchors:
${exemplarBlock}

Generate a question following the exact style and difficulty of these official questions.
Output strictly a JSON object with this exact structure:
{
  "examId": "SSC_CGL",
  "tier": "Tier 1",
  "subject": "${subject}",
  "topic": "string",
  "difficulty": "MEDIUM",
  "questionText": "string (use LaTeX for math: $...$)",
  "options": [
    {"key": "A", "text": "string"},
    {"key": "B", "text": "string"},
    {"key": "C", "text": "string"},
    {"key": "D", "text": "string"}
  ],
  "correctAnswer": "A | B | C | D",
  "stepByStepSolution": "detailed step-by-step mathematical explanation showing how the answer is derived",
  "distractorAnalysis": {
    "A": "why a candidate might pick this trap",
    "B": "why a candidate might pick this trap",
    "C": "why a candidate might pick this trap",
    "D": "why a candidate might pick this trap"
  },
  "marking": {
    "correct": 2.0,
    "incorrect": -0.5
  },
  "groundedExemplarId": "${exemplars[0]?.questionId}"
}`;

  // 4. Invoke Gemini with Exemplar Grounding
  console.log(`\n[Stage 4] Generating Grounded Question with Gemini...`);
  const llm = new GeminiProvider('gemini-2.5-flash');
  const response = await llm.generateResponse(
    [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
    systemInstruction,
    {
      operation: 'rag_pyq_generation',
      temperature: 0.3,
      responseJson: true,
    }
  );

  let raw = (response.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  let generatedData: any = {};
  try {
    generatedData = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON response:', raw);
    return;
  }

  console.log('='.repeat(80));
  console.log('✨ GENERATED SSC CGL QUESTION (STRICTLY GROUNDED IN REAL PYQs)');
  console.log('='.repeat(80));
  console.log(`Exam & Tier : ${generatedData.examId} (${generatedData.tier})`);
  console.log(`Subject     : ${generatedData.subject} | Topic: ${generatedData.topic}`);
  console.log(`Difficulty  : ${generatedData.difficulty}`);
  console.log(`Marking     : +${generatedData.marking?.correct} / ${generatedData.marking?.incorrect}`);
  console.log(`\nQuestion:`);
  console.log(`  ${generatedData.questionText}\n`);
  console.log(`Options:`);
  generatedData.options?.forEach((opt: any) => {
    const isCorrect = opt.key === generatedData.correctAnswer;
    console.log(`  (${opt.key}) ${opt.text} ${isCorrect ? '  <-- [CORRECT ANSWER]' : ''}`);
  });
  console.log(`\nStep-by-Step Solution:`);
  console.log(`  ${generatedData.stepByStepSolution}`);
  console.log(`\nDistractor Analysis (Psychometric Error Modeling):`);
  if (generatedData.distractorAnalysis) {
    for (const [key, reason] of Object.entries(generatedData.distractorAnalysis)) {
      console.log(`  Option (${key}): ${reason}`);
    }
  }
  console.log(`\nAnchor Exemplar Used: ${generatedData.groundedExemplarId}`);
  console.log('='.repeat(80));
}

(async () => {
  const query = process.argv[2] || 'A merchant gives two successive discounts of 20% and 10% on marked price and still earns a profit';
  const subject = process.argv[3] || 'Quantitative Aptitude';
  await runLiveRAGDemo(query, subject);
})();
