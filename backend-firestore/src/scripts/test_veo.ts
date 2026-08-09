/**
 * ONE Veo 3 generation (PREMIUM ~$4-6 from credits). Run only with cost consent.
 * Usage: npx tsx src/scripts/test_veo.ts "your prompt here"
 */
import { veoVideoService } from '../services/ai/veo-video.service';

async function run() {
  const prompt = process.argv.slice(2).join(' ') ||
    'A clear 3D educational animation of Newton\'s cradle demonstrating conservation of momentum, clean studio background.';
  console.log('=== Veo 3 test generation (billed ~$4-6) ===');
  console.log('prompt:', prompt);
  const t = Date.now();
  try {
    const res = await veoVideoService.generateVideo(prompt, { sampleCount: 1 });
    console.log(`\nDONE in ${Math.round((Date.now() - t) / 1000)}s`);
    console.log('video URIs:', res.videoUris.length ? res.videoUris.join('\n') : '(none — check raw)');
    if (!res.videoUris.length) console.log('raw:', JSON.stringify(res.raw).slice(0, 600));
  } catch (e: any) {
    console.error('Veo generation failed:', e?.message || e);
  }
  process.exit(0);
}
run();
