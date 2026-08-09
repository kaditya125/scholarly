/**
 * Measures loudness in fixed windows across a file, to see WHERE audio exists.
 *
 * A single mean/max for a 5-minute file hides everything: an intro sting plus
 * 300s of silence measures much the same as a sustained bed. This slices the
 * timeline so "music only plays at the beginning" becomes a measurement.
 *
 * Usage: node --import tsx src/scripts/measure_over_time.ts <file> [windowSec]
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

/**
 * Duration without ffprobe — only the ffmpeg binary ships with ffmpeg-static, so
 * decode once and read the reported time from stderr.
 */
function duration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let err = '';
    ffmpeg()
      .input(file)
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('stderr', (l: string) => (err += l + '\n'))
      .on('error', reject)
      .on('end', () => {
        // Last "time=HH:MM:SS.xx" line is the decoded length.
        const all = [...err.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)];
        if (!all.length) return resolve(0);
        const m = all[all.length - 1];
        resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
      })
      .run();
  });
}

function windowLevel(file: string, startSec: number, lenSec: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let err = '';
    ffmpeg()
      .input(file)
      .inputOptions(['-ss', String(startSec), '-t', String(lenSec)])
      .audioFilters(['volumedetect'])
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('stderr', (l: string) => (err += l + '\n'))
      .on('error', reject)
      .on('end', () => {
        const m = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
        resolve(m ? parseFloat(m[1]) : null);
      })
      .run();
  });
}

function bar(db: number | null): string {
  if (db === null) return '?';
  if (db <= -70) return '                    (silence)';
  // -70..0 dB mapped to 0..20 chars
  const n = Math.max(0, Math.min(20, Math.round(((db + 70) / 70) * 20)));
  return '#'.repeat(n).padEnd(20, ' ');
}

async function main() {
  const file = process.argv[2];
  const win = Number(process.argv[3] || 20);
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: measure_over_time.ts <file> [windowSec]');
    process.exit(1);
  }

  const total = await duration(file);
  console.log(`\n${file}`);
  console.log(`duration ${total.toFixed(1)}s, ${win}s windows\n`);
  console.log('   time      mean dB   level');

  let audible = 0;
  let windows = 0;
  for (let t = 0; t < total; t += win) {
    const len = Math.min(win, total - t);
    if (len < 1) break;
    const db = await windowLevel(file, t, len);
    windows++;
    if (db !== null && db > -50) audible++;
    const mm = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    console.log(`  ${mm}  ${String(db ?? '?').padStart(8)}   ${bar(db)}`);
  }

  console.log(
    `\n${audible}/${windows} windows have audible content (> -50 dB) ` +
      `= ${Math.round((audible / windows) * 100)}% of the episode`
  );
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
