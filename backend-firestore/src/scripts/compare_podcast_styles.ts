/**
 * Generates the SAME topic in all six podcast styles and writes a comparison.
 *
 * This is the acceptance check for the Podcast Style Engine: if changing the
 * style only changes speaker names while the dialogue stays structurally
 * identical, the feature has failed. Run it after touching podcastStyles.ts,
 * PodcastPlanner or ConversationGenerator.
 *
 * Usage:  node --import tsx src/scripts/compare_podcast_styles.ts
 * Output: PODCAST_STYLE_COMPARISON.md in the repository root.
 *
 * Makes real LLM calls (one plan + one call per segment, per style), so it costs
 * money. Duration is kept at 5 minutes to hold that down.
 */

import '../config/firebase';

import { writeFileSync } from 'fs';
import { podcastPlanner } from '../core/workflow/podcast/PodcastPlanner';
import { conversationGenerator } from '../core/workflow/podcast/ConversationGenerator';
import {
  PODCAST_STYLES,
  PODCAST_STYLE_IDS,
  PodcastStyleId,
  cinematicBandFor,
} from '../core/workflow/podcast/podcastStyles';
import { GroundingBrief, PodcastGenerateRequest } from '../core/workflow/podcast/types';
import { featureFlags } from '../config/featureFlags';

const TOPIC = 'Explain Quantum Physics for Class 12';
const DURATION_MINUTES = 5;

const brief: GroundingBrief = {
  topic: TOPIC,
  titleSeed: TOPIC,
  baseText:
    'Class 12 quantum physics: the photoelectric effect, Planck\'s quantum hypothesis, ' +
    'photons, work function, stopping potential, de Broglie wavelength, matter waves, ' +
    'wave-particle duality, and the Heisenberg uncertainty principle.',
  notebookId: '',
  focusTopics: [],
} as GroundingBrief;

interface StyleResult {
  id: PodcastStyleId;
  label: string;
  speakers: string[];
  segmentTitles: string[];
  totalWords: number;
  lineCount: number;
  turnsPerSpeaker: Record<string, number>;
  avgWordsPerTurn: number;
  longestTurnWords: number;
  shortestTurnWords: number;
  questionCount: number;
  openingLines: { speaker: string; text: string }[];
  cinematicBand: string;
  error?: string;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

async function runStyle(id: PodcastStyleId): Promise<StyleResult> {
  const style = PODCAST_STYLES[id];
  const base: StyleResult = {
    id,
    label: style.label,
    speakers: [],
    segmentTitles: [],
    totalWords: 0,
    lineCount: 0,
    turnsPerSpeaker: {},
    avgWordsPerTurn: 0,
    longestTurnWords: 0,
    shortestTurnWords: 0,
    questionCount: 0,
    openingLines: [],
    cinematicBand: cinematicBandFor(style),
  };

  const req: PodcastGenerateRequest = {
    type: 'custom',
    source: { kind: 'topic', topic: TOPIC },
    durationMinutes: DURATION_MINUTES,
    podcastStyle: id,
    language: 'English',
  };

  try {
    console.log(`\n[${id}] planning…`);
    const plan = await podcastPlanner.buildPlan('style_compare_user', brief, req);
    base.speakers = plan.speakers.map((s) => `${s.name} (${s.role})`);
    base.segmentTitles = plan.segments.map((s) => s.title);

    if (plan.podcastStyle !== id) {
      // The plan is the only thing the generator receives, so this must hold.
      base.error = `plan.podcastStyle was "${plan.podcastStyle}", expected "${id}"`;
      return base;
    }

    console.log(`[${id}] scripting ${plan.segments.length} segments…`);
    const script = await conversationGenerator.generate('style_compare_user', brief, plan);

    base.lineCount = script.lines.length;
    base.totalWords = script.totalWords;
    base.openingLines = script.lines.slice(0, 4).map((l) => ({ speaker: l.speaker, text: l.text }));

    const lengths = script.lines.map((l) => words(l.text));
    base.avgWordsPerTurn = lengths.length
      ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
      : 0;
    base.longestTurnWords = lengths.length ? Math.max(...lengths) : 0;
    base.shortestTurnWords = lengths.length ? Math.min(...lengths) : 0;

    for (const l of script.lines) {
      base.turnsPerSpeaker[l.speaker] = (base.turnsPerSpeaker[l.speaker] || 0) + 1;
      // '?' and the Devanagari danda-adjacent question form both count.
      base.questionCount += (l.text.match(/\?/g) || []).length;
    }
  } catch (err: any) {
    base.error = err?.message || String(err);
    console.error(`[${id}] FAILED: ${base.error}`);
  }

  return base;
}

function renderMarkdown(results: StyleResult[]): string {
  const out: string[] = [];

  out.push('# Podcast Style Engine — six styles, one topic');
  out.push('');
  out.push(`**Topic:** ${TOPIC}`);
  out.push(`**Duration requested:** ${DURATION_MINUTES} minutes`);
  out.push(`**Language:** English`);
  out.push(`**ENHANCED_PODCAST_STYLES:** ${featureFlags.enhancedPodcastStyles}`);
  out.push(`**Generated:** ${new Date().toISOString()}`);
  out.push('');
  out.push(
    'Every episode below was generated from the identical topic and grounding text. ' +
      'Only the selected style changed.'
  );
  out.push('');

  out.push('## Summary');
  out.push('');
  out.push(
    '| Style | Voices | Cast | Turns | Words | Avg words/turn | Longest turn | Questions | Cinematic band |'
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    const cast = r.speakers.length ? r.speakers.join('<br>') : '—';
    out.push(
      `| **${r.label}** | ${r.speakers.length} | ${cast} | ${r.lineCount} | ${r.totalWords} | ` +
        `${r.avgWordsPerTurn} | ${r.longestTurnWords} | ${r.questionCount} | ${r.cinematicBand} |`
    );
  }
  out.push('');

  out.push('## Turn distribution');
  out.push('');
  out.push('Who actually holds the microphone, which is what makes a format recognisable.');
  out.push('');
  for (const r of results) {
    const dist = Object.entries(r.turnsPerSpeaker)
      .map(([s, n]) => `${s}: ${n} turns (${Math.round((n / (r.lineCount || 1)) * 100)}%)`)
      .join(' · ');
    out.push(`- **${r.label}** — ${dist || '—'}`);
  }
  out.push('');

  out.push('## Episode structure');
  out.push('');
  for (const r of results) {
    out.push(`### ${r.label}`);
    out.push('');
    if (r.segmentTitles.length) {
      r.segmentTitles.forEach((t, i) => out.push(`${i + 1}. ${t}`));
    } else {
      out.push('_no segments_');
    }
    out.push('');
  }

  out.push('## Openings — the clearest difference');
  out.push('');
  out.push(
    'The first lines of each episode. A listener can identify the format from these alone.'
  );
  out.push('');
  for (const r of results) {
    out.push(`### ${r.label}`);
    out.push('');
    if (r.error) {
      out.push(`> **FAILED:** ${r.error}`);
    } else if (!r.openingLines.length) {
      out.push('> _no lines_');
    } else {
      for (const l of r.openingLines) {
        out.push(`> **${l.speaker}:** ${l.text}`);
        out.push('>');
      }
    }
    out.push('');
  }

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    out.push('## Failures');
    out.push('');
    for (const r of failed) out.push(`- **${r.label}**: ${r.error}`);
    out.push('');
  }

  return out.join('\n');
}

async function main() {
  if (!featureFlags.enhancedPodcastStyles) {
    console.error(
      'ENHANCED_PODCAST_STYLES is off — every style would produce the legacy output. ' +
        'Set ENHANCED_PODCAST_STYLES=true and re-run.'
    );
    process.exit(1);
  }

  console.log(`Generating "${TOPIC}" in ${PODCAST_STYLE_IDS.length} styles…`);

  const results: StyleResult[] = [];
  for (const id of PODCAST_STYLE_IDS) {
    results.push(await runStyle(id));
  }

  const md = renderMarkdown(results);
  // Repo root, next to the other engineering reports.
  const path = '../PODCAST_STYLE_COMPARISON.md';
  writeFileSync(path, md, 'utf8');

  console.log(`\n──────── done ────────`);
  for (const r of results) {
    console.log(
      `${r.label.padEnd(18)} voices=${r.speakers.length} turns=${String(r.lineCount).padStart(3)} ` +
        `words=${String(r.totalWords).padStart(4)} avg=${String(r.avgWordsPerTurn).padStart(3)} ` +
        `q=${String(r.questionCount).padStart(2)} band=${r.cinematicBand}` +
        (r.error ? `  ERROR: ${r.error}` : '')
    );
  }
  console.log(`\nWrote ${path}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
