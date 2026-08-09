/**
 * Batch timeline validation — the Step 5/6 harness.
 *
 * Two modes, because the two useful questions are different:
 *
 *   --stored          Score every timeline already persisted for a user. This is
 *                     what you run after shadow mode has been on for a while;
 *                     it validates REAL timelines from REAL podcasts.
 *
 *   --synthetic       Run the Director over the 20 built-in topics using
 *                     synthetic scripts. No API calls, no cost, fully
 *                     deterministic. Validates the PLANNING LOGIC in isolation.
 *
 * Usage:
 *   npm run validate:timelines -- --synthetic
 *   npm run validate:timelines -- --stored -u <uid>
 *   npm run validate:timelines -- --stored -u <uid> --json out.json
 *
 * The synthetic mode is what makes this runnable without a live environment.
 * It cannot tell you whether the AI's creative judgement is good on real
 * content — only a human listening to real timelines can — but it will catch
 * every structural defect before you spend money finding them.
 */

import 'dotenv/config';
import fs from 'fs';
import {
  VALIDATION_TOPICS,
  type ValidationTopic,
} from '../core/director/inspector/timelineTopics';
import {
  timelineQualityScorer,
  WEAK_THRESHOLD,
  type QualityDimension,
  type QualityReport,
} from '../core/director/inspector/TimelineQualityScorer';
import { syntheticDirect } from '../core/director/inspector/syntheticDirect';
import type { MasterTimeline } from '../core/director/schema/timeline.schema';

// NOTE: `timelineRepository` is imported LAZILY inside stored mode only. Loading
// it at module scope pulls in Firestore, the notification queue and a Redis
// connection, which would make the offline synthetic sweep depend on live
// infrastructure it does not use.

interface Args {
  mode: 'stored' | 'synthetic';
  userId?: string;
  limit: number;
  json?: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (...flags: string[]): string | undefined => {
    for (const f of flags) {
      const i = argv.indexOf(f);
      if (i >= 0) return argv[i + 1];
    }
    return undefined;
  };
  return {
    mode: argv.includes('--stored') ? 'stored' : 'synthetic',
    userId: get('-u', '--user'),
    limit: Number.parseInt(get('--limit') || '', 10) || 20,
    json: get('--json'),
    verbose: argv.includes('-v') || argv.includes('--verbose'),
  };
}

// ---------------------------------------------------------------------------
// Synthetic script generation
// ---------------------------------------------------------------------------

/**
 * Build a plausible multi-scene script for a topic.
 *
 * Deliberately formulaic: the point is to exercise scene segmentation, emotion
 * arcs and trigger matching, not to produce good prose. Each script includes
 * a definition (to trigger comprehension pauses), a setting cue (ambience) and
 * at least one SFX trigger word, so all planners have something to do.
 */
function syntheticScript(topic: ValidationTopic): Array<{
  speaker: string;
  text: string;
}> {
  const env = topic.expect.environments[0] ?? 'abstract';
  const lines: Array<{ speaker: string; text: string }> = [];

  const isMulti = topic.style === 'multi_speaker' || topic.style === 'interview';
  const a = isMulti ? (topic.style === 'interview' ? 'Host' : 'Dr. Alvarez') : 'Narrator';
  const b = topic.style === 'interview' ? 'Dr. Okafor' : 'Professor Chen';

  // Scene 1 — introduction
  lines.push({
    speaker: a,
    text: `Welcome. Today we are exploring ${topic.title.toLowerCase()}.`,
  });
  lines.push({
    speaker: a,
    text: `To understand this properly, we need to start in the ${env}, where the story really begins.`,
  });

  // Scene 2 — definition (should trigger a comprehension pause)
  lines.push({
    speaker: isMulti ? b : a,
    text:
      `The key term here is defined as follows: it is the mechanism by which ` +
      `energy, information, and structure are exchanged across a boundary.`,
  });
  lines.push({
    speaker: isMulti ? b : a,
    text: `That definition matters because everything that follows depends on it.`,
  });

  // Scene 3 — development, with an SFX trigger
  lines.push({
    speaker: a,
    text:
      topic.expect.sfxAppropriate
        ? `Imagine the door opening as the first researchers walked in, papers in hand.`
        : `Consider what that means at scale, across millions of interactions.`,
  });
  lines.push({
    speaker: isMulti ? b : a,
    text: `The evidence accumulated slowly, and then all at once.`,
  });

  // Scene 4 — complication / tension
  lines.push({
    speaker: a,
    text: `But there was a problem nobody had anticipated, and it changed everything.`,
  });
  lines.push({
    speaker: isMulti ? b : a,
    text: `For a while it looked as though the whole idea might collapse entirely.`,
  });

  // Scene 5 — resolution
  lines.push({
    speaker: a,
    text: `In the end, the resolution came from an unexpected direction.`,
  });
  lines.push({
    speaker: a,
    text: `And that is why ${topic.title.toLowerCase()} still matters today. Thank you for listening.`,
  });

  return lines;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  label: string;
  report: QualityReport | null;
  error?: string;
}

function printTable(rows: Row[]): void {
  const dims: QualityDimension[] = [
    'scenes',
    'emotion',
    'voice',
    'genderAge',
    'music',
    'ambience',
    'sfx',
    'timing',
    'learning',
    'continuity',
  ];
  const short: Record<QualityDimension, string> = {
    scenes: 'SCN',
    emotion: 'EMO',
    voice: 'VOI',
    genderAge: 'G/A',
    music: 'MUS',
    ambience: 'AMB',
    sfx: 'SFX',
    timing: 'TIM',
    learning: 'LRN',
    continuity: 'CON',
  };

  console.log('');
  console.log(
    '  ' +
      'TOPIC'.padEnd(30) +
      dims.map((d) => short[d].padStart(5)).join('') +
      '  OVERALL'
  );
  console.log('  ' + '─'.repeat(30 + dims.length * 5 + 9));

  for (const row of rows) {
    if (!row.report) {
      console.log('  ' + row.label.slice(0, 29).padEnd(30) + `  FAILED: ${row.error}`);
      continue;
    }
    const byDim = new Map(row.report.dimensions.map((d) => [d.dimension, d.score]));
    console.log(
      '  ' +
        row.label.slice(0, 29).padEnd(30) +
        dims.map((d) => String(Math.round(byDim.get(d) ?? 0)).padStart(5)).join('') +
        '  ' +
        row.report.overall.toFixed(1).padStart(7)
    );
  }
  console.log('  ' + '─'.repeat(30 + dims.length * 5 + 9));

  // Aggregate per dimension — this is what tells you WHICH planner needs work.
  const scored = rows.filter((r) => r.report).map((r) => r.report as QualityReport);
  if (scored.length === 0) return;

  const avg = (d: QualityDimension): number => {
    const vals = scored.map(
      (r) => r.dimensions.find((x) => x.dimension === d)?.score ?? 0
    );
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };

  console.log(
    '  ' +
      'MEAN'.padEnd(30) +
      dims.map((d) => String(Math.round(avg(d))).padStart(5)).join('') +
      '  ' +
      (scored.reduce((s, r) => s + r.overall, 0) / scored.length).toFixed(1).padStart(7)
  );
  console.log('');

  // ── Weakest dimensions across the batch ──
  const weakCounts = new Map<QualityDimension, number>();
  for (const r of scored) {
    for (const w of r.weakest) weakCounts.set(w, (weakCounts.get(w) ?? 0) + 1);
  }
  if (weakCounts.size > 0) {
    console.log(`  DIMENSIONS BELOW ${WEAK_THRESHOLD} (count of timelines affected)`);
    for (const [dim, count] of [...weakCounts].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${dim.padEnd(14)} ${count}/${scored.length}`);
    }
    console.log('');
  }

  // ── Most common findings ──
  const findingCounts = new Map<string, number>();
  for (const r of scored) {
    for (const d of r.dimensions) {
      for (const f of d.findings) {
        // Strip specific ids/numbers so similar findings group together.
        const key = `${d.dimension}: ${f.replace(/\b\d+(\.\d+)?\b/g, 'N').replace(/'[^']*'/g, "'X'")}`;
        findingCounts.set(key, (findingCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const top = [...findingCounts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length > 0) {
    console.log('  MOST COMMON FINDINGS');
    for (const [finding, count] of top) {
      console.log(`    [${String(count).padStart(2)}×] ${finding}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('');
  console.log('═'.repeat(78));
  console.log('  TIMELINE VALIDATION BATCH');
  console.log('═'.repeat(78));
  console.log(`  mode  : ${args.mode}`);
  if (args.userId) console.log(`  user  : ${args.userId}`);
  console.log(`  limit : ${args.limit}`);

  const rows: Row[] = [];

  if (args.mode === 'synthetic') {
    console.log(`  topics: ${VALIDATION_TOPICS.length}`);
    console.log('');
    console.log('  NOTE: synthetic scripts exercise the planners deterministically.');
    console.log('  They validate STRUCTURE, not the AI\'s judgement on real content.');

    for (const topic of VALIDATION_TOPICS.slice(0, args.limit)) {
      const lines = syntheticScript(topic);
      try {
        const result = await syntheticDirect({
          podcastId: `synthetic_${topic.id}`,
          userId: 'synthetic-validator',
          title: topic.title,
          lines,
          // 'balanced' so ambience and SFX planners actually run — 'subtle'
          // suppresses both and would leave two dimensions untested.
          cinematicIntensity: 'balanced',
        });
        rows.push({
          id: topic.id,
          label: `${topic.id} ${topic.title}`,
          report: result ? timelineQualityScorer.score(result) : null,
          error: result ? undefined : 'dry run returned no timeline',
        });
      } catch (error) {
        rows.push({
          id: topic.id,
          label: `${topic.id} ${topic.title}`,
          report: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } else {
    if (!args.userId) {
      console.error('\n  --stored requires -u <userId>\n');
      process.exit(1);
    }
    const { timelineRepository } = await import(
      '../repositories/timeline.repository'
    );
    const timelines: MasterTimeline[] = await timelineRepository.listTimelinesForUser(
      args.userId,
      args.limit
    );
    console.log(`  found : ${timelines.length} stored timeline(s)`);
    console.log('');

    for (const t of timelines) {
      rows.push({
        id: t.podcastId,
        label: `${t.podcastId.slice(0, 20)} ${t.meta?.title ?? ''}`,
        report: timelineQualityScorer.score(t),
      });
    }
  }

  printTable(rows);

  // ── Verbose findings ──
  if (args.verbose) {
    for (const row of rows) {
      if (!row.report) continue;
      const withFindings = row.report.dimensions.filter((d) => d.findings.length > 0);
      if (withFindings.length === 0) continue;
      console.log(`  ── ${row.label}`);
      for (const d of withFindings) {
        console.log(`     ${d.dimension} (${d.score})`);
        for (const f of d.findings) console.log(`       · ${f}`);
      }
      console.log('');
    }
  }

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`  JSON written to ${args.json}`);
    console.log('');
  }

  const scored = rows.filter((r) => r.report);
  console.log(`  scored ${scored.length}/${rows.length} timeline(s)`);
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[validateTimelines] Fatal error:', error);
    process.exit(1);
  });
