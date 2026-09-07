import * as fs from 'fs';
import * as path from 'path';

const CONFIGS = [
  'neet2025-code45',
  'neet2026-code13',
  'reneet2026-code50',
];

const OUT_DIR = path.join(__dirname, 'out', 'neet-benchmark');

async function fetchAllRows(config: string) {
  let offset = 0;
  const length = 100;
  const allRows: any[] = [];
  let features: any = null;

  while (true) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=geekyrakshit%2Findian-entrance-exams-benchmark&config=${config}&split=validation&offset=${offset}&length=${length}`;
    console.log(`Fetching ${config} [offset ${offset}, length ${length}]...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    if (!features && data.features) {
      features = data.features;
    }
    const rows = data.rows || [];
    if (rows.length === 0) break;
    allRows.push(...rows.map((r: any) => r.row));
    offset += rows.length;
    if (offset >= data.num_rows_total || rows.length < length) {
      break;
    }
  }

  return { config, features, rows: allRows };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  for (const config of CONFIGS) {
    const cacheFile = path.join(OUT_DIR, `${config}.json`);
    let data: any;
    if (fs.existsSync(cacheFile)) {
      console.log(`Loading cached ${config} from ${cacheFile}`);
      data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } else {
      data = await fetchAllRows(config);
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
      console.log(`Saved ${data.rows.length} rows to ${cacheFile}`);
    }

    console.log(`\n=== CONFIG: ${config} ===`);
    console.log(`Total rows: ${data.rows.length}`);

    // Subject breakdown
    const subjectCounts: Record<string, number> = {};
    const answerStatusCounts: Record<string, number> = {};
    let solutionsCount = 0;
    let figuresCount = 0;
    const stems = new Set<string>();
    const stemCounts: Record<string, number> = {};

    for (const r of data.rows) {
      subjectCounts[r.subject] = (subjectCounts[r.subject] || 0) + 1;
      answerStatusCounts[r.answer_status] = (answerStatusCounts[r.answer_status] || 0) + 1;
      if (r.solution && r.solution.trim().length > 0) solutionsCount++;
      if (r.figures && r.figures.length > 0) figuresCount++;

      const normStem = (r.question || '').trim().toLowerCase().replace(/\s+/g, ' ');
      stems.add(normStem);
      stemCounts[normStem] = (stemCounts[normStem] || 0) + 1;
    }

    console.log('Subject counts:', subjectCounts);
    console.log('Answer status counts:', answerStatusCounts);
    console.log(`Solutions present: ${solutionsCount}`);
    console.log(`Figures present: ${figuresCount}`);
    console.log(`Distinct normalized stems: ${stems.size}`);

    const duplicates = Object.entries(stemCounts).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate stems in ${config}:`);
      for (const [stem, count] of duplicates) {
        console.log(`  Count: ${count}`);
        console.log(`  Stem: ${stem.slice(0, 100)}...`);
        const dupRows = data.rows.filter(
          (r: any) => (r.question || '').trim().toLowerCase().replace(/\s+/g, ' ') === stem
        );
        for (const dr of dupRows) {
          console.log(`    Q#${dr.question_number} [${dr.subject}]: ${JSON.stringify(dr.options)} (correct: ${JSON.stringify(dr.correct_option)})`);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
