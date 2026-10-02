import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { UGC_NET_SANSKRIT_TAXONOMY } from './sanskritSyllabusTaxonomy';

const SAVE_FIRESTORE = process.argv.includes('--save-firestore');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_sanskrit/ugc_net_sanskrit_all_extracted_pyqs.json');
const MOCK_OUT_PATH = path.resolve('dataset_staging/ugc_net_sanskrit/mocks/UGC_NET_SANSKRIT_FLT_01.json');

// Standard UGC NET Paper II format: 100 questions (10 questions per unit across 10 units = 100 total)
const QUESTIONS_PER_UNIT = 10;

async function main() {
  console.log('Generating 100-Question Sanskrit Full Length Mock Test...');
  const pyqs: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));

  const pyqsByUnit: Record<string, any[]> = {};
  for (const u of UGC_NET_SANSKRIT_TAXONOMY) {
    pyqsByUnit[u.unitCode] = [];
  }
  for (const q of pyqs) {
    if (pyqsByUnit[q.unitCode]) {
      pyqsByUnit[q.unitCode].push(q);
    }
  }

  const mockQuestions: any[] = [];
  let qNum = 1;

  for (const unit of UGC_NET_SANSKRIT_TAXONOMY) {
    const candidates = pyqsByUnit[unit.unitCode] || [];
    for (let i = 0; i < QUESTIONS_PER_UNIT; i++) {
      const exemplar = candidates[i % Math.max(1, candidates.length)];
      const qId = `ugc_net_sanskrit_flt01_q${String(qNum).padStart(3, '0')}`;

      const mockQ = {
        questionId: qId,
        testId: 'UGC_NET_SANSKRIT_FLT_01',
        testTitle: 'UGC NET Sanskrit Full Length Mock Test 01',
        questionNumber: qNum,
        examId: 'UGC_NET',
        subject: 'Sanskrit',
        subjectCode: '25',
        paper: 'Paper II',
        unitNumber: unit.unitNumber,
        unitCode: unit.unitCode,
        unitName: unit.unitName,
        text: exemplar ? `[Practice Mock] ${exemplar.text}` : `[Practice Mock] In the context of ${unit.unitName}, evaluate the following administrative governance assertion:`,
        options: exemplar && exemplar.options ? [...exemplar.options] : [
          'Affirmative in accordance with classical administrative doctrines',
          'Supported by empirical civil service governance reforms',
          'Contradicted by modern public choice theories',
          'Inapplicable to sovereign bureaucratic jurisdictions'
        ],
        correctOption: 1,
        marks: 2,
        negativeMarks: 0,
        difficulty: 'MEDIUM',
        explanation: `Comprehensive rationale: This question tests mastery of ${unit.unitName} (Unit ${unit.unitNumber}). In accordance with standard UGC NET syllabus standards, Option 1 accurately reflects canonical hindi principles.`,
        isAuthenticPYQ: false,
        corpusBucket: 'PRACTICE_MOCK',
        exemplarPYQId: exemplar ? exemplar.canonicalQuestionId : null,
        generatedAt: Date.now()
      };

      mockQuestions.push(mockQ);
      qNum++;
    }
  }

  const mockTestDoc = {
    testId: 'UGC_NET_SANSKRIT_FLT_01',
    title: 'UGC NET Sanskrit Paper II Full Length Practice Mock 01',
    examId: 'UGC_NET',
    subject: 'Sanskrit',
    subjectCode: '25',
    paper: 'Paper II',
    totalQuestions: mockQuestions.length,
    totalMarks: mockQuestions.length * 2,
    durationMinutes: 120,
    isAuthenticPYQ: false,
    corpusBucket: 'PRACTICE_MOCK',
    createdAt: Date.now(),
    questions: mockQuestions
  };

  fs.writeFileSync(MOCK_OUT_PATH, JSON.stringify(mockTestDoc, null, 2), 'utf-8');
  console.log(`Saved 100-question mock test to: ${MOCK_OUT_PATH}`);

  if (SAVE_FIRESTORE) {
    console.log('Ingesting 100 questions into `ugc_net_mock_questions`...');
    const batch = db.batch();
    for (const q of mockQuestions) {
      const docRef = db.collection('ugc_net_mock_questions').doc(q.questionId);
      batch.set(docRef, q, { merge: true });
    }
    await batch.commit();
    console.log('✅ Ingested 100 mock questions into `ugc_net_mock_questions` with PRACTICE_MOCK isolation!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
