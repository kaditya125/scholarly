/**
 * Three worked example plans against the REAL SSC CGL syllabus, with synthetic mastery injected
 * in memory. Read-only: no mastery is written, no embeddings, no attempt records created.
 */
import 'dotenv/config';
import * as coverageSvc from '../../src/services/learning/syllabusCoverage.service';
import { generateDailyPlan } from '../../src/services/learning/studyPlanner.service';

const TODAY = new Date('2026-09-01T09:00:00Z');
const NOW = TODAY.getTime();
const DAY = 86_400_000;

(async () => {
  const real = await coverageSvc.getSyllabusCoverage('probe-empty', 'SSC_CGL');
  const leaves: any[] = [];
  const walk = (ns: any[]) => ns.forEach((n) => { if (n.isLeaf) leaves.push(n); walk(n.children); });
  walk(real.subjects);
  console.log(`real SSC CGL syllabus: ${leaves.length} addressable leaves\n`);

  const scenarios: Array<[string, (i: number) => any]> = [
    ['1. BRAND NEW STUDENT (nothing attempted)', () => ({})],
    ['2. STRUGGLING STUDENT (weak across the board)', (i) =>
      i < 12 ? { state: 'WEAK', attempts: 6 + i, masteryScore: 0.15 + i * 0.01, accuracy: 0.28, lastSeenAt: NOW - (3 + i) * DAY } : {}],
    ['3. MIXED STUDENT (some mastered, some weak, some new)', (i) =>
      i % 5 === 0 ? { state: 'MASTERED', attempts: 8, masteryScore: 0.93, accuracy: 0.9, lastSeenAt: NOW - 30 * DAY }
      : i % 5 === 1 ? { state: 'WEAK', attempts: 7, masteryScore: 0.22, accuracy: 0.29, lastSeenAt: NOW - 6 * DAY }
      : i % 5 === 2 ? { state: 'LEARNING', attempts: 2, masteryScore: 0.62, accuracy: 0.5, lastSeenAt: NOW - 8 * DAY }
      : {}],
  ];

  for (const [title, shape] of scenarios) {
    const patched = JSON.parse(JSON.stringify(real));
    let i = 0;
    const apply = (ns: any[]) => ns.forEach((n) => { if (n.isLeaf) Object.assign(n, shape(i++)); apply(n.children); });
    apply(patched.subjects);
    const t: any = { addressable: 0, untouched: 0, weak: 0, learning: 0, strong: 0, mastered: 0 };
    const count = (ns: any[]) => ns.forEach((n) => { if (n.isLeaf) { t.addressable++; t[String(n.state).toLowerCase()]++; } count(n.children); });
    count(patched.subjects);
    patched.totals = t;

    const plan = await generateDailyPlan({
      userId: 'demo', examId: 'SSC_CGL', examDate: '2026-11-15', dailyMinutes: 120, today: TODAY,
      loadCoverage: async () => patched,
    });

    console.log(`\n${'='.repeat(72)}\n${title}`);
    console.log(`exam in ${plan.daysUntilExam} days · budget ${plan.budgetMinutes} min · planned ${plan.plannedMinutes} min`);
    console.log(`outlook: ${t.untouched} untouched, ~${plan.outlook.estimatedDaysToCover} days to cover` +
      (plan.outlook.note ? `\n  NOTE: ${plan.outlook.note}` : ''));
    plan.tasks.forEach((task, n) => {
      console.log(`  ${n + 1}. [${task.activity.padEnd(8)}] ${task.label.slice(0, 44).padEnd(46)} ${String(task.estimatedMinutes).padStart(2)}min  ${task.priority}`);
      console.log(`     why: ${task.reasons.join(' · ')}`);
    });
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
