/**
 * Finds WHICH stage of the mix filter graph destroys the background level.
 *
 * The full graph binds cues correctly and ffmpeg reports success, yet the
 * background measures about -82 dB (silent) while the source assets measure
 * -25 dB. This renders the same asset through the graph stage by stage and
 * measures after each, so the attenuation can be attributed instead of guessed.
 *
 * Usage: node --import tsx src/scripts/isolate_mix_attenuation.ts <asset.wav>
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const FMT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
const DUR = 20; // seconds — enough to measure, fast to render
const OUT_DIR = path.join(process.cwd(), 'temp', 'attenuation_probe');

function measure(file: string): Promise<{ mean: number | null; max: number | null }> {
  return new Promise((resolve, reject) => {
    let err = '';
    ffmpeg()
      .input(file)
      .audioFilters(['volumedetect'])
      .format('null')
      .output(process.platform === 'win32' ? 'NUL' : '/dev/null')
      .on('stderr', (l: string) => (err += l + '\n'))
      .on('error', reject)
      .on('end', () => {
        const m = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
        const x = err.match(/max_volume:\s*(-?[\d.]+) dB/);
        resolve({ mean: m ? parseFloat(m[1]) : null, max: x ? parseFloat(x[1]) : null });
      })
      .run();
  });
}

/** Render a filter_complex with N lavfi silent inputs after the asset. */
function render(
  label: string,
  asset: string,
  filterComplex: string,
  silentInputs: number
): Promise<string> {
  const out = path.join(OUT_DIR, `${label}.mp3`);
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg().input(asset);
    for (let i = 0; i < silentInputs; i++) {
      cmd.input('anullsrc=r=48000:cl=stereo').inputFormat('lavfi');
    }
    cmd
      .complexFilter(filterComplex, 'out')
      .outputOptions(['-t', String(DUR), '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '48000', '-ac', '2'])
      .output(out)
      .on('error', (e: Error) => reject(new Error(`${label}: ${e.message}`)))
      .on('end', () => resolve(out))
      .run();
  });
}

async function main() {
  const asset = process.argv[2];
  if (!asset || !fs.existsSync(asset)) {
    console.error('Usage: isolate_mix_attenuation.ts <asset.wav>');
    process.exit(1);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = await measure(asset);
  console.log(`\nSOURCE ${path.basename(asset)}`);
  console.log(`  mean=${base.mean} dB  max=${base.max} dB\n`);

  // Use the REAL intro-cue geometry from the failing episode: -7.5 dB, 6s long,
  // no loop, placed at 0ms. If this alone is silent, the per-cue chain is the bug.
  const vol = Math.pow(10, -7.5 / 20); // ~0.42

  const stages: { label: string; filter: string; silent: number; note: string }[] = [
    {
      label: 'A_volume_only',
      silent: 0,
      note: 'asset + volume(-7.5dB)  [expected ~ -32 dB]',
      filter: `[0:a]${FMT},volume=${vol}[out]`,
    },
    {
      label: 'A2_plus_atrim_asetpts',
      silent: 0,
      note: '+ atrim=0:6,asetpts=N/SR  (as the real graph does)',
      filter: `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR[out]`,
    },
    {
      label: 'A3_plus_fades',
      silent: 0,
      note: '+ afade in 1.2s / out at 3.5s for 2.5s',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=3.5:d=2.5[out]`,
    },
    {
      label: 'A4_plus_adelay0',
      silent: 0,
      note: '+ adelay=0|0',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=3.5:d=2.5,adelay=0|0[out]`,
    },
    {
      label: 'A3a_fadeIN_only',
      silent: 0,
      note: 'only afade=t=in:st=0:d=1.2',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR,` +
        `afade=t=in:st=0:d=1.2[out]`,
    },
    {
      label: 'A3b_fadeOUT_only',
      silent: 0,
      note: 'only afade=t=out:st=3.5:d=2.5',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR,` +
        `afade=t=out:st=3.5:d=2.5[out]`,
    },
    {
      label: 'A3c_fades_BEFORE_asetpts',
      silent: 0,
      note: 'same fades but applied BEFORE asetpts (PTS still original)',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=3.5:d=2.5,asetpts=N/SR[out]`,
    },
    {
      label: 'A5_aloop_bed',
      silent: 0,
      note: 'bed geometry: aloop=loop=2:size=2e9 then atrim=0:191.2  [the real bed]',
      filter:
        `[0:a]${FMT},aloop=loop=2:size=2e9,volume=${Math.pow(10, -13 / 20)},` +
        `atrim=0:191.2,asetpts=N/SR,adelay=6000|6000[out]`,
    },
    {
      label: 'FIX_asetpts_N_SR_TB',
      silent: 0,
      note: 'THE FIX: asetpts=N/SR/TB (correct audio PTS rebase) then the same fades',
      filter:
        `[0:a]${FMT},volume=${vol},atrim=0:6,asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=1.2,afade=t=out:st=3.5:d=2.5[out]`,
    },
    {
      label: 'FIX_bed_asetpts_N_SR_TB',
      silent: 0,
      note: 'THE FIX on the real bed geometry (loop + long fades)',
      filter:
        `[0:a]${FMT},aloop=loop=2:size=2e9,volume=${Math.pow(10, -13 / 20)},` +
        `atrim=0:191.2,asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=2,afade=t=out:st=189.7:d=1.5,adelay=6000|6000[out]`,
    },
    {
      label: 'A6_aloop_bed_with_fades',
      silent: 0,
      note: 'bed geometry WITH the real fades (in 2.0s, out at 189.7s for 1.5s)',
      filter:
        `[0:a]${FMT},aloop=loop=2:size=2e9,volume=${Math.pow(10, -13 / 20)},` +
        `atrim=0:191.2,asetpts=N/SR,` +
        `afade=t=in:st=0:d=2,afade=t=out:st=189.7:d=1.5,adelay=6000|6000[out]`,
    },
    {
      label: 'B_amix3_background',
      silent: 2,
      note: '+ amix(inputs=3, normalize=0) with 2 silent placeholders',
      filter:
        `[0:a]${FMT},volume=${vol}[m];` +
        `[1:a]${FMT}[s1];[2:a]${FMT}[s2];` +
        `[m][s1][s2]amix=inputs=3:duration=first:normalize=0[out]`,
    },
    {
      label: 'C_sidechain_silent_voice',
      silent: 3,
      note: '+ sidechaincompress triggered by a SILENT voice',
      filter:
        `[0:a]${FMT},volume=${vol}[m];` +
        `[1:a]${FMT}[s1];[2:a]${FMT}[s2];` +
        `[m][s1][s2]amix=inputs=3:duration=first:normalize=0[bg];` +
        `[3:a]${FMT}[sc];` +
        `[bg][sc]sidechaincompress=threshold=0.01:ratio=3.4:attack=120:release=400:makeup=1[out]`,
    },
    {
      label: 'D_final_amix2',
      silent: 4,
      note: '+ amix(inputs=2) with the silent voice bus',
      filter:
        `[0:a]${FMT},volume=${vol}[m];` +
        `[1:a]${FMT}[s1];[2:a]${FMT}[s2];` +
        `[m][s1][s2]amix=inputs=3:duration=first:normalize=0[bg];` +
        `[3:a]${FMT}[sc];` +
        `[bg][sc]sidechaincompress=threshold=0.01:ratio=3.4:attack=120:release=400:makeup=1[duck];` +
        `[4:a]${FMT}[v];` +
        `[v][duck]amix=inputs=2:duration=first:normalize=0[out]`,
    },
    {
      label: 'E_plus_loudnorm',
      silent: 4,
      note: '+ loudnorm(I=-16) mastering  [the full chain]',
      filter:
        `[0:a]${FMT},volume=${vol}[m];` +
        `[1:a]${FMT}[s1];[2:a]${FMT}[s2];` +
        `[m][s1][s2]amix=inputs=3:duration=first:normalize=0[bg];` +
        `[3:a]${FMT}[sc];` +
        `[bg][sc]sidechaincompress=threshold=0.01:ratio=3.4:attack=120:release=400:makeup=1[duck];` +
        `[4:a]${FMT}[v];` +
        `[v][duck]amix=inputs=2:duration=first:normalize=0[pre];` +
        `[pre]loudnorm=I=-16:TP=-1:LRA=11[out]`,
    },
  ];

  let prev: number | null = base.mean;
  for (const st of stages) {
    try {
      const out = await render(st.label, asset, st.filter, st.silent);
      const lv = await measure(out);
      const delta = prev !== null && lv.mean !== null ? (lv.mean - prev).toFixed(1) : '?';
      console.log(`${st.label}`);
      console.log(`  ${st.note}`);
      console.log(`  mean=${lv.mean} dB  max=${lv.max} dB   (change from previous stage: ${delta} dB)`);
      if (lv.mean !== null && lv.mean <= -60) {
        console.log(`  >>> THIS STAGE SILENCES THE BACKGROUND`);
      }
      console.log('');
      prev = lv.mean;
    } catch (e: any) {
      console.log(`${st.label}\n  RENDER FAILED: ${e?.message}\n`);
    }
  }

  console.log(`probe files in ${OUT_DIR}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
