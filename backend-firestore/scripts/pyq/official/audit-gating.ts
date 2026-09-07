import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');
const configs = ['neet2025-code45', 'neet2026-code13', 'reneet2026-code50'];

let totalRows = 0;
let totalFigureQuarantined = 0;
let totalDroppedQuarantined = 0;
let totalEmbeddable = 0;

for (const cfg of configs) {
  const file = path.join(OUT_DIR, `${cfg}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  let figQ = 0;
  let droppedQ = 0;
  let embeddable = 0;

  for (const r of data.rows) {
    totalRows++;
    const qHasImg = /<image_\d+>/i.test(r.question || '');
    const optHasImg = (r.options || []).some((o: string) => /<image_\d+>/i.test(o));
    const isFigureDependent = qHasImg || optHasImg;
    const isDropped = r.answer_status === 'dropped';

    if (isFigureDependent) {
      figQ++;
      totalFigureQuarantined++;
    } else if (isDropped) {
      droppedQ++;
      totalDroppedQuarantined++;
    } else {
      embeddable++;
      totalEmbeddable++;
    }
  }

  console.log(`${cfg}: Total=${data.rows.length}, FigQuarantined=${figQ}, DroppedQuarantined=${droppedQ}, Embeddable=${embeddable}`);
}

console.log(`\nOVERALL:`);
console.log(`  Total rows: ${totalRows}`);
console.log(`  Figure quarantined: ${totalFigureQuarantined}`);
console.log(`  Dropped quarantined (non-figure): ${totalDroppedQuarantined}`);
console.log(`  Total embeddable: ${totalEmbeddable}`);
