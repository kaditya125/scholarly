const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);

const scenes = ['scene_0.mp4', 'scene_1.mp4', 'scene_2.mp4'];
const outputPath = path.join(__dirname, 'poc_output', 'demo_solar_system.mp4');

console.log('Stitching 3 video scenes...');

const concatList = scenes.map(s => `file '${s}'`).join('\n');
const concatPath = path.join(__dirname, 'poc_output', 'concat.txt');
require('fs').writeFileSync(concatPath, concatList);

ffmpeg()
  .input(concatPath)
  .inputOptions(['-f', 'concat', '-safe', '0'])
  .outputOptions(['-c', 'copy'])
  .output(outputPath)
  .on('start', (cmd) => {
    console.log('FFmpeg command:', cmd);
  })
  .on('progress', (progress) => {
    if (progress.percent) {
      console.log(`Progress: ${progress.percent.toFixed(1)}%`);
    }
  })
  .on('end', () => {
    console.log('✅ Video saved:', outputPath);
    require('fs').unlinkSync(concatPath);
  })
  .on('error', (err) => {
    console.error('❌ FFmpeg error:', err.message);
    process.exit(1);
  })
  .run();
