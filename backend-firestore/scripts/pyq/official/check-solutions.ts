import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');
const configs = ['neet2025-code45', 'neet2026-code13', 'reneet2026-code50'];

let totalChecked = 0;
let totalMismatches = 0;

for (const cfg of configs) {
  const file = path.join(OUT_DIR, `${cfg}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const r of data.rows) {
    if (!r.solution) continue;
    // Regex for Allen answer indicator: "**Answer (n)**" or "**Answer: (n)**" or "Answer (n)"
    const m = r.solution.match(/Answer\s*\(?([1-4])\)?/i);
    if (m) {
      totalChecked++;
      const n = parseInt(m[1], 10);
      const expectedZeroIndex = n - 1;
      const actual = r.correct_option[0];
      if (expectedZeroIndex !== actual) {
        totalMismatches++;
        console.log(`MISMATCH in ${cfg} Q#${r.question_number}: Sol says (${n}) -> expected ${expectedZeroIndex}, actual ${actual}`);
        console.log(`  Sol snippet: ${r.solution.slice(0, 100)}`);
      }
    }
  }
}

console.log(`Answer index check across 3 configs: ${totalChecked} checked, ${totalMismatches} mismatches.`);
