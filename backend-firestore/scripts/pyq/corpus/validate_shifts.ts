import * as fs from 'fs';
import * as path from 'path';

const shiftsDir = path.resolve(__dirname, 'authentic', 'shifts');
console.log('Checking shiftsDir:', shiftsDir);
if (!fs.existsSync(shiftsDir)) {
  console.error('shiftsDir does not exist!');
  process.exit(1);
}

const files = fs.readdirSync(shiftsDir).filter((f) => f.endsWith('.json'));
console.log(`Found ${files.length} authentic shift files.`);

let totalQs = 0;
const years: Record<number, number> = {};

for (const f of files) {
  const data = JSON.parse(fs.readFileSync(path.join(shiftsDir, f), 'utf-8'));
  const count = data.questions ? data.questions.length : 0;
  totalQs += count;
  years[data.year] = (years[data.year] || 0) + count;
}

console.log(`Total Genuine Historical Questions: ${totalQs}`);
for (const y of Object.keys(years).sort()) {
  console.log(`  Year ${y}: ${years[Number(y)]} questions`);
}

// Sample 1 question
const sampleFile = path.join(shiftsDir, files[0]);
const sampleData = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
console.log('\nSample from', files[0]);
console.log('Paper:', sampleData.paperTitle);
console.log('Q1 text:', sampleData.questions[0].questionText.slice(0, 100));
console.log('Q1 answer:', sampleData.questions[0].correctAnswer);
