/**
 * Measures ACTUAL loudness of audio files, because "the file exists and is the
 * expected size" proves nothing — a constant-bitrate MP3 of near-silence is the
 * same size as a full mix.
 *
 * Reports mean/max volume and integrated loudness (LUFS). Rules of thumb:
 *   mean_volume above about -35 dB  -> audible under speech
 *   mean_volume below about -45 dB  -> effectively inaudible
 *
 * Usage: node --import tsx src/scripts/measure_audio_levels.ts <file> [<file>...]
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

interface Levels {
  meanDb: number | null;
  maxDb: number | null;
  lufs: number | null;
}

function measure(file: string): Promise<Levels> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    ffmpeg()
      .input(file)
      // volumedetect gives mean/max; ebur128 gives integrated loudness.
      .audioFilters(['volumedetect', 'ebur128=peak=true'])
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('stderr', (line: string) => {
        stderr += line + '\n';
      })
      .on('error', reject)
      .on('end', () => {
        const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
        const max = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
        // Last "I:" line from ebur128 is the integrated value.
        const lufsAll = [...stderr.matchAll(/I:\s*(-?[\d.]+)\s*LUFS/g)];
        resolve({
          meanDb: mean ? parseFloat(mean[1]) : null,
          maxDb: max ? parseFloat(max[1]) : null,
          lufs: lufsAll.length ? parseFloat(lufsAll[lufsAll.length - 1][1]) : null,
        });
      })
      .run();
  });
}

function verdict(meanDb: number | null): string {
  if (meanDb === null) return 'unknown';
  if (meanDb <= -60) return 'SILENT';
  if (meanDb <= -45) return 'effectively INAUDIBLE';
  if (meanDb <= -35) return 'very quiet';
  return 'audible';
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Usage: measure_audio_levels.ts <file> [<file>...]');
    process.exit(1);
  }

  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.log(`\n${f}\n  MISSING`);
      continue;
    }
    const bytes = fs.statSync(f).size;
    try {
      const l = await measure(f);
      console.log(`\n${f}`);
      console.log(`  size      : ${bytes} bytes`);
      console.log(`  mean_volume: ${l.meanDb ?? '?'} dB   -> ${verdict(l.meanDb)}`);
      console.log(`  max_volume : ${l.maxDb ?? '?'} dB`);
      console.log(`  integrated : ${l.lufs ?? '?'} LUFS`);
    } catch (e: any) {
      console.log(`\n${f}\n  measure failed: ${e?.message}`);
    }
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
