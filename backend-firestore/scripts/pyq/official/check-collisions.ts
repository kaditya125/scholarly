import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { pyqExtractorService } from '../../../src/services/pyq/pyqExtractor.service';

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');

async function main() {
  console.log('Loading existing NEET questions from Firestore...');
  const snap = await db.collection('pyq_questions').where('examId', '==', 'NEET_UG').get();
  console.log(`Loaded ${snap.size} existing NEET questions.`);

  const existingHashes = new Set<string>();
  const existingTexts = new Set<string>();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.contentHash) existingHashes.add(d.contentHash);
    const normText = (d.questionText || '').trim().toLowerCase().replace(/\s+/g, ' ');
    existingTexts.add(normText);
  }

  const configs = ['neet2025-code45', 'neet2026-code13', 'reneet2026-code50'];
  let hashCollisions = 0;
  let textCollisions = 0;

  for (const cfg of configs) {
    const file = path.join(OUT_DIR, `${cfg}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    for (const r of data.rows) {
      const normText = pyqExtractorService.normalizeMathAndScienceNotation(r.question);
      const normOpts = (r.options || []).map((o: string) => pyqExtractorService.normalizeMathAndScienceNotation(o));
      const hash = pyqExtractorService.generateQuestionHash('NEET_UG', normText, normOpts, r.question_number);

      const normTextSimple = normText.trim().toLowerCase().replace(/\s+/g, ' ');

      if (existingHashes.has(hash)) {
        hashCollisions++;
        console.log(`Hash collision in ${cfg} Q#${r.question_number}: hash=${hash}`);
      }
      if (existingTexts.has(normTextSimple)) {
        textCollisions++;
        console.log(`Text collision in ${cfg} Q#${r.question_number}: ${normText.slice(0, 80)}`);
      }
    }
  }

  console.log(`\nCollision check results:`);
  console.log(`  Hash collisions: ${hashCollisions}`);
  console.log(`  Text collisions: ${textCollisions}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
