/**
 * Explains why a podcast got no SFX cues.
 *
 * SFX are keyword-triggered: SFXPlanner only emits a cue when a line contains one
 * of the patterns in sfxTriggers.ts. This checks the real script against those
 * patterns and, separately, whether an asset exists for the categories that DID
 * match — the two failure modes look identical from the outside.
 *
 * Usage: node --import tsx src/scripts/why_no_sfx.ts <podcastId>
 */

import '../config/firebase';

import { timelineRepository } from '../repositories/timeline.repository';
import { assetRegistry } from '../core/assets/AssetRegistry';
import { SFX_TRIGGERS, matchTriggers } from '../core/director/knowledge/sfxTriggers';

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: why_no_sfx.ts <podcastId>');
    process.exit(1);
  }

  const t: any = await timelineRepository.getTimeline(podcastId);
  if (!t) {
    console.log('no timeline');
    process.exit(1);
  }

  // The spoken text lives on the voice track.
  const lines: string[] = (t.tracks.voice.events || []).map((e: any) => String(e.text || ''));
  const script = lines.join('\n').toLowerCase();
  console.log(`\n=== ${podcastId} ===`);
  console.log(`${lines.length} spoken lines, ${script.length} chars\n`);

  // Use the REAL matcher, per line, exactly as SFXPlanner does. A naive
  // `script.includes(pattern)` over the whole text reports matches the planner
  // would reject — it was what made "rough terrain" look like a rain cue.
  console.log('TRIGGER MATCHES IN THIS SCRIPT (real per-line matcher)');
  const hitCategories = new Set<string>();
  let hits = 0;
  lines.forEach((text, i) => {
    const m = matchTriggers(text);
    if (!m) return;
    hits++;
    hitCategories.add(m.trigger.category);
    const snippet = text.replace(/\s+/g, ' ').slice(0, 70);
    console.log(
      `  line ${String(i).padStart(2)}  ${m.trigger.category.padEnd(10)} via "${m.matchedPattern}"  — ${snippet}…`
    );
  });
  if (hits === 0) {
    console.log('  (none) — no line matches any trigger, so 0 SFX cues are planned.');
  }

  // Show what a naive substring match WOULD have claimed, to make the difference
  // in false positives visible.
  const naive = SFX_TRIGGERS.filter((t) =>
    t.patterns.some((p) => script.includes(p.toLowerCase()))
  ).length;
  console.log(
    `\n  boundary-aware line matches: ${hits}   naive substring groups: ${naive}` +
      `${naive > hits ? '  <- the difference is false positives now rejected' : ''}`
  );

  // Which dramatic words ARE present but have no trigger at all?
  const unmapped = [
    'landing', 'landed', 'touchdown', 'descent', 'engine', 'thrust', 'ignition',
    'countdown', 'alarm', 'radio', 'static', 'beep', 'hatch', 'ladder',
    'silence', 'orbit', 'module', 'spacecraft', 'antenna', 'switch',
  ].filter((w) => script.includes(w));

  console.log('\nDRAMATIC WORDS PRESENT BUT WITH NO TRIGGER DEFINED');
  console.log(unmapped.length ? `  ${unmapped.join(', ')}` : '  (none)');

  // Asset availability for every category the trigger table can produce.
  console.log('\nASSET AVAILABILITY PER SFX CATEGORY');
  const rows: any[] = await assetRegistry.listByKind('sfx' as any, 500);
  const have = new Set(rows.map((r) => String(r.category ?? r.requirement?.category ?? '')));
  const allCategories = [...new Set(SFX_TRIGGERS.map((s) => s.category))].sort();
  for (const c of allCategories) {
    const ok = have.has(c);
    const flag = hitCategories.has(c) ? ' <- matched in this script' : '';
    console.log(`  ${ok ? 'have  ' : 'MISSING'} ${String(c).padEnd(10)}${flag}`);
  }

  console.log(`\nregistry sfx categories: ${[...have].sort().join(', ')}`);
  console.log(
    `\nSUMMARY: ${hits} trigger group(s) matched. ` +
      `${allCategories.filter((c) => !have.has(c)).length}/${allCategories.length} categories have NO asset.`
  );
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
