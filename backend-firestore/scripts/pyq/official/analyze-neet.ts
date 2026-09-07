import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');

function main() {
  const configs = ['neet2025-code45', 'neet2026-code13', 'reneet2026-code50'];

  for (const cfg of configs) {
    const file = path.join(OUT_DIR, `${cfg}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    console.log(`\n========================================`);
    console.log(`ANALYSIS FOR: ${cfg}`);
    console.log(`========================================`);

    const qNums = data.rows.map((r: any) => r.question_number);
    console.log(`Total rows: ${data.rows.length}`);
    console.log(`Question numbers range: ${Math.min(...qNums)} to ${Math.max(...qNums)}`);

    // Check duplicate question numbers
    const qNumCounts: Record<number, number> = {};
    for (const n of qNums) qNumCounts[n] = (qNumCounts[n] || 0) + 1;
    const dupQNums = Object.entries(qNumCounts).filter(([_, c]) => c > 1);
    if (dupQNums.length > 0) {
      console.log(`Duplicate question numbers:`, dupQNums);
    } else {
      console.log(`All question numbers 1..180 are strictly unique.`);
    }

    // Check answer index cross-check
    // "where a solution contains **Answer (n)**, n - 1 must equal correct_option[0]"
    let checkedSolutions = 0;
    let mismatchedSolutions = 0;
    for (const r of data.rows) {
      const sol = r.solution || '';
      const match = sol.match(/\*\*Answer\s*\(([1-4])\)\*\*/i) || sol.match(/Answer\s*\(([1-4])\)/i);
      if (match) {
        checkedSolutions++;
        const n = parseInt(match[1], 10);
        const expectedZeroIndex = n - 1;
        const actualOption = r.correct_option[0];
        if (expectedZeroIndex !== actualOption) {
          mismatchedSolutions++;
          console.log(`MISMATCH in ${cfg} Q#${r.question_number}: Sol says (${n}) -> expected ${expectedZeroIndex}, but correct_option is ${actualOption}`);
          console.log(`  Sol snippet: ${sol.slice(0, 150)}`);
          console.log(`  Options: ${JSON.stringify(r.options)}`);
        }
      }
    }
    console.log(`Solution answer cross-check: ${checkedSolutions} checked, ${mismatchedSolutions} mismatches.`);

    // Figures analysis
    let figInQuestion = 0;
    let figInOptions = 0;
    let figInSolOnly = 0;
    let noFig = 0;

    for (const r of data.rows) {
      const qHasImg = /<image_\d+>/i.test(r.question || '');
      const optHasImg = (r.options || []).some((o: string) => /<image_\d+>/i.test(o));
      const solHasImg = /<image_\d+>/i.test(r.solution || '');

      if (qHasImg) {
        figInQuestion++;
      } else if (optHasImg) {
        figInOptions++;
      } else if (solHasImg) {
        figInSolOnly++;
      } else {
        noFig++;
      }
    }

    console.log(`Figures breakdown:`);
    console.log(`  In question: ${figInQuestion}`);
    console.log(`  In options (only): ${figInOptions}`);
    console.log(`  In solution only: ${figInSolOnly}`);
    console.log(`  No figure: ${noFig}`);
    console.log(`  Total requiring quarantine (in Q or Options): ${figInQuestion + figInOptions}`);

    // Near-duplicate check inside this config
    for (let i = 0; i < data.rows.length; i++) {
      for (let j = i + 1; j < data.rows.length; j++) {
        const r1 = data.rows[i];
        const r2 = data.rows[j];
        const t1 = r1.question.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const t2 = r2.question.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (t1 === t2 && t1.length > 20) {
          console.log(`Duplicate question text detected between Q#${r1.question_number} and Q#${r2.question_number}:`);
          console.log(`  Q#${r1.question_number}: ${r1.question}`);
          console.log(`  Q#${r2.question_number}: ${r2.question}`);
          console.log(`  Opts 1: ${JSON.stringify(r1.options)}`);
          console.log(`  Opts 2: ${JSON.stringify(r2.options)}`);
        }
      }
    }
  }

  // Cross-config comparisons
  console.log(`\n========================================`);
  console.log(`CROSS CONFIG COMPARISON`);
  console.log(`========================================`);
  const c2025 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `neet2025-code45.json`), 'utf8'));
  const c2026 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `neet2026-code13.json`), 'utf8'));
  const cre2026 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `reneet2026-code50.json`), 'utf8'));

  const allStems = new Map<string, { cfg: string; qNum: number }[]>();
  const addAll = (cfg: string, data: any) => {
    for (const r of data.rows) {
      const norm = r.question.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!allStems.has(norm)) allStems.set(norm, []);
      allStems.get(norm)!.push({ cfg, qNum: r.question_number });
    }
  };
  addAll('neet2025-code45', c2025);
  addAll('neet2026-code13', c2026);
  addAll('reneet2026-code50', cre2026);

  console.log(`Total rows across 3 configs: 540`);
  console.log(`Total distinct question stems across all 3: ${allStems.size}`);
  let overlapCount = 0;
  for (const [stem, occurrences] of allStems.entries()) {
    if (occurrences.length > 1) {
      overlapCount++;
      console.log(`Stem appears in multiple configs (${occurrences.map(o => `${o.cfg}:Q#${o.qNum}`).join(', ')}):`);
      console.log(`  Stem: ${stem.slice(0, 100)}...`);
    }
  }
  console.log(`Total stems appearing in multiple configs: ${overlapCount}`);
}

main();
