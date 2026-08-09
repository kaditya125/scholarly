/**
 * ASCII renderer for a TimelineInspectionReport.
 *
 * Deliberately text-only: the primary debugging surface must work over SSH, in
 * CI logs, and before any UI exists. The admin API returns the structured
 * report; this renders the same data for a terminal.
 *
 * Pure string building — no I/O, so it is trivially testable.
 */

import { formatMs, type TimelineInspectionReport } from './TimelineInspector';

const WIDTH = 96;

export function renderReport(report: TimelineInspectionReport): string {
  const out: string[] = [];

  out.push(...renderSummary(report));
  out.push(...renderQuality(report));
  out.push(...renderValidation(report));
  out.push(...renderScenes(report));
  out.push(...renderEmotion(report));
  out.push(...renderSpeakers(report));
  out.push(...renderLearning(report));
  out.push(...renderMusic(report));
  out.push(...renderAmbience(report));
  out.push(...renderSfx(report));
  out.push(...renderPauses(report));
  out.push(...renderVisual(report));
  out.push(...renderAssets(report));

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderSummary(r: TimelineInspectionReport): string[] {
  const s = r.summary;
  return [
    banner('TIMELINE INSPECTION'),
    kv('Podcast', s.podcastId),
    kv('Timeline', `${s.timelineId}  (schema v${s.schemaVersion}, ${s.phase.toUpperCase()})`),
    kv('Producer plan', s.producerPlanId ?? '— none —'),
    kv('Title', s.title),
    kv('Language / genre', `${s.language} / ${s.genre} / ${s.narrativeStyle}`),
    kv('Cinematic', s.cinematicIntensity),
    kv('Duration', `${s.totalDurationLabel} (${s.totalDurationMs}ms)`),
    kv('Structure', `${s.sceneCount} scene(s), ${s.speakerCount} speaker(s), ${s.eventCount} event(s)`),
    ...(s.warnings.length
      ? ['', dim('Warnings:'), ...s.warnings.map((w) => `  ! ${w}`)]
      : []),
    '',
  ];
}

function renderQuality(r: TimelineInspectionReport): string[] {
  const lines = [banner(`QUALITY  —  score ${r.quality.score}/100`)];

  for (const m of r.quality.metrics) {
    const mark = m.status === 'good' ? '✓' : m.status === 'warn' ? '!' : '✗';
    const value = `${m.value}${m.unit}`;
    lines.push(`  ${mark} ${pad(m.label, 28)} ${pad(value, 10)} ${m.hint}`.trimEnd());
  }
  lines.push('');
  return lines;
}

function renderValidation(r: TimelineInspectionReport): string[] {
  const v = r.validation;
  if (v.valid && v.warnings.length === 0) {
    return [banner('VALIDATION'), '  ✓ all invariants satisfied', ''];
  }

  const lines = [banner('VALIDATION')];
  for (const e of v.errors) {
    lines.push(`  ✗ [${e.code}] ${e.message}`);
    if (e.path) lines.push(`      at ${e.path}`);
  }
  for (const w of v.warnings) {
    lines.push(`  ! [${w.code}] ${w.message}`);
    if (w.path) lines.push(`      at ${w.path}`);
  }
  lines.push('');
  return lines;
}

function renderScenes(r: TimelineInspectionReport): string[] {
  if (r.scenes.length === 0) return [];
  const lines = [banner('SCENE TIMELINE')];

  for (const s of r.scenes) {
    lines.push(
      `  ${pad(`#${s.index}`, 5)} ${pad(formatMs(s.startMs), 8)} ${pad(s.durationLabel, 8)} ` +
        `${bar(s.share)} ${pct(s.share)}  ${s.title}`
    );
    lines.push(
      `        ${dim(
        `${s.location} · ${s.timeOfDay} · ${s.environment} | ${s.emotion} ` +
          `(energy ${s.energyLevel}, tension ${s.tensionLevel}) | lines ${s.lineRange} (${s.lineCount}) | ` +
          `${s.transitionIn} → ${s.transitionOut}`
      )}`
    );
  }
  lines.push('');
  return lines;
}

function renderEmotion(r: TimelineInspectionReport): string[] {
  if (r.emotion.length === 0) return [];
  const lines = [banner('EMOTION CURVE')];
  for (const k of r.emotion) {
    lines.push(
      `  ${pad(formatMs(k.atMsApprox), 8)} ${pad(`${Math.round(k.atProgress * 100)}%`, 6)} ` +
        `${bar(k.intensity)} ${pad(String(k.intensity), 6)} ${k.emotion}  ${dim(k.sceneId)}`
    );
  }
  lines.push('');
  return lines;
}

function renderSpeakers(r: TimelineInspectionReport): string[] {
  if (r.speakers.length === 0) return [];
  const lines = [banner('SPEAKER TIMELINE')];

  for (const s of r.speakers) {
    lines.push(
      `  ${pad(s.displayName, 14)} ${pad(s.role, 16)} ${pad(`${s.gender}/${s.ageBand}`, 16)} ` +
        `${bar(s.lineShare)} ${pct(s.lineShare)} (${s.lineCount} lines, ${formatMs(s.speakingMs)})`
    );
    lines.push(
      `        ${dim(
        `${s.voiceProvider}:${s.voiceLabel ?? s.voiceId}` +
          ` · prosody ${s.supportsProsody ? 'yes' : 'NO'}` +
          ` · emotions: ${s.emotionsUsed.join(', ') || '—'}`
      )}`
    );
    if (s.outOfRange.length) {
      lines.push(`        ✗ out of range: ${s.outOfRange.join(', ')}`);
    }
  }
  lines.push('');
  return lines;
}

function renderLearning(r: TimelineInspectionReport): string[] {
  if (r.learning.length === 0) return [];
  const lines = [banner('LEARNING TIMELINE  (teaching order)')];

  r.learning.forEach((c, i) => {
    const flags = [
      c.emphasised ? 'EMPHASISED' : '',
      c.examWeight != null ? `exam ${c.examWeight}` : '',
      c.revisionPriority != null ? `revision ${c.revisionPriority}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(`  ${pad(`${i + 1}.`, 5)} ${pad(c.label, 32)} ${pad(c.bloomLevel, 12)} ${pad(c.difficulty, 14)} ${flags}`.trimEnd());
    if (c.prerequisites.length) {
      lines.push(`        ${dim(`requires: ${c.prerequisites.join(', ')}`)}`);
    }
  });
  lines.push('');
  return lines;
}

function renderMusic(r: TimelineInspectionReport): string[] {
  if (r.music.length === 0) return [banner('MUSIC TIMELINE'), '  (none)', ''];
  const lines = [banner('MUSIC TIMELINE')];
  for (const m of r.music) {
    lines.push(
      `  ${pad(formatMs(m.startMs), 8)}→${pad(formatMs(m.endMs), 8)} ${pad(m.label, 26)} ` +
        `${pad(`${m.volumeDb}dB`, 9)} ${assetMark(m.assetResolved)} ${m.assetId ?? ''}`
    );
    lines.push(`        ${dim(m.detail)}`);
  }
  lines.push('');
  return lines;
}

function renderAmbience(r: TimelineInspectionReport): string[] {
  if (r.ambience.length === 0) return [banner('AMBIENCE TIMELINE'), '  (none)', ''];
  const lines = [banner('AMBIENCE TIMELINE')];
  for (const a of r.ambience) {
    lines.push(
      `  ${pad(formatMs(a.startMs), 8)}→${pad(formatMs(a.endMs), 8)} ${pad(a.environmentId, 20)} ${a.detail}`
    );
    for (const l of a.layers) {
      lines.push(
        `        ${assetMark(l.resolved)} ${pad(l.layerRole, 9)} ${pad(`${l.volumeDb}dB`, 9)} ` +
          `${pad(l.loopBehavior, 15)} ${l.assetId}`
      );
    }
  }
  lines.push('');
  return lines;
}

function renderSfx(r: TimelineInspectionReport): string[] {
  if (r.sfx.length === 0) return [banner('SFX TIMELINE'), '  (none)', ''];
  const lines = [banner('SFX TIMELINE')];
  for (const s of r.sfx) {
    lines.push(
      `  ${pad(formatMs(s.startMs), 8)} ${pad(s.label, 14)} ${pad(`${s.volumeDb}dB`, 9)} ` +
        `${assetMark(s.assetResolved)} ${s.assetId ?? ''}`
    );
    lines.push(`        ${dim(s.detail)}`);
  }
  lines.push('');
  return lines;
}

function renderPauses(r: TimelineInspectionReport): string[] {
  if (r.pauses.length === 0) return [];
  const lines = [banner('PAUSE TIMELINE')];

  // Summarise by type — a full list is noise for a 400-line episode.
  const byType = new Map<string, { count: number; totalMs: number }>();
  for (const p of r.pauses) {
    const agg = byType.get(p.pauseType) ?? { count: 0, totalMs: 0 };
    agg.count += 1;
    agg.totalMs += p.durationMs;
    byType.set(p.pauseType, agg);
  }
  for (const [type, agg] of [...byType.entries()].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(
      `  ${pad(type, 16)} ${pad(String(agg.count), 6)} × avg ${Math.round(agg.totalMs / agg.count)}ms ` +
        `= ${formatMs(agg.totalMs)} total`
    );
  }
  lines.push('');
  return lines;
}

function renderVisual(r: TimelineInspectionReport): string[] {
  if (r.visual.length === 0) return [];
  const lines = [
    banner('VISUAL TIMELINE  (future renderers — not consumed in v1)'),
  ];
  for (const v of r.visual) {
    lines.push(
      `  ${pad(formatMs(v.startMs), 8)} ${pad(v.visualType, 20)} ${pad(v.cameraAngle, 12)} ` +
        `${pad(v.cameraMovement, 12)} ${pad(v.lighting, 13)} ${v.visualStyle}` +
        (v.characterId ? ` ${dim(`→ ${v.characterId}`)}` : '')
    );
    lines.push(`        ${dim(v.imagePromptPreview)}`);
  }
  lines.push('');
  return lines;
}

function renderAssets(r: TimelineInspectionReport): string[] {
  const a = r.assets;
  const lines = [banner('ASSET REFERENCES')];
  lines.push(`  referenced ${a.referenced} · resolved ${a.resolved} · missing ${a.missing.length}`);

  for (const [kind, stats] of Object.entries(a.byKind)) {
    lines.push(`    ${pad(kind, 12)} ${stats.referenced} referenced, ${stats.missing} missing`);
  }
  if (a.missing.length) {
    lines.push('', '  Missing:');
    for (const m of a.missing) {
      lines.push(`    ✗ ${m.kind}/${m.id}  ${dim(`used by ${m.usedBy.join(', ')}`)}`);
    }
  }
  if (a.degraded.length) {
    lines.push('', `  Already flagged degraded: ${a.degraded.map((d) => `${d.kind}/${d.id}`).join(', ')}`);
  }
  lines.push('');
  return lines;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function banner(text: string): string {
  const line = '─'.repeat(Math.max(0, WIDTH - text.length - 3));
  return `\n${text} ${line}`;
}

function kv(key: string, value: string): string {
  return `  ${pad(`${key}:`, 20)} ${value}`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

/** 10-cell proportional bar. */
function bar(fraction: number, cells = 10): string {
  const filled = Math.max(0, Math.min(cells, Math.round(fraction * cells)));
  return `[${'█'.repeat(filled)}${'·'.repeat(cells - filled)}]`;
}

function pct(fraction: number): string {
  return pad(`${Math.round(fraction * 100)}%`, 5);
}

function dim(s: string): string {
  return s;
}

function assetMark(resolved?: boolean): string {
  if (resolved === undefined) return ' ';
  return resolved ? '✓' : '✗';
}
