import { buildJEEMainCorpus } from '../corpus/jee-main-corpus';

const normText = (s: string): string => {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const legacy = buildJEEMainCorpus();
console.log('Total in jee-main-corpus.ts:', legacy.length);

const map = new Map<string, any[]>();
for (const q of legacy) {
  const norm = normText(q.questionText || '');
  if (!map.has(norm)) map.set(norm, []);
  map.get(norm)!.push(q);
}

console.log('Unique normalized questions in jee-main-corpus.ts:', map.size);
let dups = 0;
for (const [norm, list] of map.entries()) {
  if (list.length > 1) {
    dups++;
    if (dups <= 3) {
      console.log(`Duplicate example [${list.length}x]: ${norm.slice(0, 80)}`);
      list.forEach(item => console.log(`   Year: ${item.year} | Session: ${item.session} | Shift: ${item.shift} | Q: ${item.questionNumber}`));
    }
  }
}
console.log(`Duplicate groups in jee-main-corpus.ts: ${dups}`);
console.log(`Duplicate rate in jee-main-corpus.ts: ${(((legacy.length - map.size) / legacy.length) * 100).toFixed(2)}%`);
