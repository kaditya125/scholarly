/**
 * PODCAST VIDEO GENERATION - PHASE 3 POC
 * 
 * Isolated proof-of-concept script for generating video documentaries
 * from existing podcast transcripts using Veo 3.1 Lite.
 * 
 * IMPORTANT: This is a standalone PoC script. It does NOT modify
 * production code or interfere with existing podcast generation.
 * 
 * Requirements:
 * - Vertex AI credentials (GOOGLE_APPLICATION_CREDENTIALS)
 * - FFmpeg installed (already available in project)
 * - Firebase Storage access
 * 
 * Usage:
 *   npx tsx poc_video_generation.ts --transcript-path <path> --output-dir <dir>
 * 
 * Budget: $500 cap (tracked in script)
 * Estimated cost per 10-min doc: ~$30 (Veo 3.1 Lite)
 */

import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import dotenv from 'dotenv';

// Set FFmpeg paths
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

// ============================================================================
// TYPES
// ============================================================================

interface TranscriptSegment {
  segmentId: number;
  chapterIndex: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  citations?: { source: string; score: number }[];
}

interface VideoScene {
  sceneId: number;
  prompt: string;
  duration: number;  // in seconds
  startMs: number;
  endMs: number;
  videoPath: string;
  cost: number;
  generationTimeMs: number;
}

interface PoCResult {
  success: boolean;
  totalScenes: number;
  totalDurationSec: number;
  totalCost: number;
  totalGenerationTimeMs: number;
  outputVideoPath: string;
  scenes: VideoScene[];
  errors: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const CONFIG = {
  PROJECT_ID: process.env.GOOGLE_VERTEX_PROJECT || 'eng-cache-501514-q4',
  LOCATION: 'us-central1',  // Veo uses regional endpoints
  MODEL: 'veo-3.1-lite-generate-001',
  RESOLUTION: '720p',
  ASPECT_RATIO: '16:9',
  WITH_AUDIO: false,  // We'll overlay podcast audio separately
  MAX_SCENE_DURATION: 8,  // Veo 3.1 Lite supports 4, 6, 8 seconds
  BUDGET_CAP: 500,  // $500 budget cap
  PRICE_PER_SECOND: 0.03,  // Veo 3.1 Lite pricing: $0.03/sec (video-only)
  CREDENTIALS_PATH: process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/vertex-sa.json',
  STORAGE_BUCKET: process.env.VEO_OUTPUT_BUCKET || 'gs://eng-cache-501514-q4-veo/',  // From .env
};

let TOTAL_SPENT = 0;  // Track cumulative cost

// ============================================================================
// API CLIENT
// ============================================================================

// For Veo 3.1 Lite, we use Vertex AI PredictLongRunning API
// No client initialization needed - we'll use axios with service account auth
console.log('📊 Video Generation API: Veo 3.1 Lite (PredictLongRunning)');

// ============================================================================
// SCENE PROMPT GENERATION
// ============================================================================

async function generateScenePrompt(segment: TranscriptSegment): Promise<string> {
  // For PoC, we'll use simple heuristic prompts
  // In production, this would call Gemini to convert narration → visual description
  
  const text = segment.text.toLowerCase();
  
  // Educational science prompts based on content
  if (text.includes('solar system') || text.includes('sun') || text.includes('planet')) {
    return `Educational space documentary scene: ${segment.text}. Realistic, scientific visualization with accurate planetary details. Cinematic camera movement.`;
  }
  
  if (text.includes('photosynthesis') || text.includes('plant') || text.includes('chlorophyll')) {
    return `Educational biology scene: ${segment.text}. Microscopic view transitioning to macro plant structure. Scientific accuracy, vivid colors.`;
  }
  
  if (text.includes('cell') || text.includes('dna') || text.includes('mitochondria')) {
    return `Educational cellular biology scene: ${segment.text}. 3D animated cell structure with labeled organelles. Scientific illustration style.`;
  }
  
  // Generic educational prompt
  return `Educational documentary scene illustrating: ${segment.text}. Clear, engaging visuals suitable for students. Cinematic quality, educational style.`;
}

// ============================================================================
// VIDEO GENERATION (VEO 3.1 LITE)
// ============================================================================


async function generateVideoScene(
  prompt: string,
  durationSec: number,
  sceneId: number,
  outputDir: string
): Promise<{ videoPath: string; cost: number; generationTimeMs: number }> {
  
  const startTime = Date.now();
  
  // Clamp duration to model limits (Veo 3.1 Lite: 4, 6, 8 seconds)
  const duration = Math.min(Math.max(4, Math.ceil(durationSec)), CONFIG.MAX_SCENE_DURATION);
  
  console.log(`[Scene ${sceneId}] Generating ${duration}s video...`);
  console.log(`[Scene ${sceneId}] Prompt: ${prompt.substring(0, 100)}...`);
  
  try {
    // Calculate cost BEFORE generation
    const cost = duration * CONFIG.PRICE_PER_SECOND;
    
    // Budget check
    if (TOTAL_SPENT + cost > CONFIG.BUDGET_CAP) {
      throw new Error(`BUDGET EXCEEDED: Would cost $${(TOTAL_SPENT + cost).toFixed(2)}, cap is $${CONFIG.BUDGET_CAP}`);
    }
    
    // Use Veo 3.1 Lite via PredictLongRunning API
    const axios = require('axios');
    const { GoogleAuth } = require('google-auth-library');
    
    const auth = new GoogleAuth({
      keyFilename: CONFIG.CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    // Submit long-running prediction job
    const submitEndpoint = `https://${CONFIG.LOCATION}-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${CONFIG.LOCATION}/publishers/google/models/${CONFIG.MODEL}:predictLongRunning`;
    
    const requestBody = {
      instances: [{
        prompt: prompt,
      }],
      parameters: {
        storageUri: CONFIG.STORAGE_BUCKET,
        sampleCount: 1,
      },
    };
    
    console.log(`[Scene ${sceneId}] Submitting to Veo API...`);
    const submitResponse = await axios.post(submitEndpoint, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    
    const operationName = submitResponse.data.name;
    if (!operationName) {
      throw new Error('No operation name returned from Veo API');
    }
    
    console.log(`[Scene ${sceneId}] Job submitted, polling for completion...`);
    
    // Poll for completion using fetchPredictOperation
    const pollEndpoint = `https://${CONFIG.LOCATION}-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${CONFIG.LOCATION}/publishers/google/models/${CONFIG.MODEL}:fetchPredictOperation`;
    
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max
    let done = false;
    let videoUri: string | null = null;
    
    while (!done && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const pollResponse = await axios.post(pollEndpoint, {
        operationName: operationName,
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      done = pollResponse.data.done;
      
      if (done) {
        console.log(`[Scene ${sceneId}] ✓ Complete (${attempts} polls, ${attempts * 5}s)`);
        
        if (pollResponse.data.error) {
          throw new Error(`Veo generation failed: ${JSON.stringify(pollResponse.data.error)}`);
        }
        
        const response = pollResponse.data.response;
        const videos = response?.videos;
        
        if (!videos || videos.length === 0) {
          throw new Error('No videos in completed operation');
        }
        
        videoUri = videos[0].gcsUri;
        
        if (!videoUri) {
          throw new Error('No GCS URI in video response');
        }
      } else if (attempts % 10 === 0) {
        console.log(`[Scene ${sceneId}] Polling... (${attempts}/${maxAttempts})`);
      }
    }
    
    if (!done) {
      throw new Error(`Generation timed out after ${maxAttempts * 5} seconds`);
    }
    
    // Download video from GCS URI
    console.log(`[Scene ${sceneId}] Downloading from: ${videoUri}`);
    const { Storage } = require('@google-cloud/storage');
    const storage = new Storage({
      keyFilename: CONFIG.CREDENTIALS_PATH,
      projectId: CONFIG.PROJECT_ID,
    });
    
    // Parse GCS URI: gs://bucket-name/path/to/file.mp4
    const uriMatch = videoUri!.match(/^gs:\/\/([^\/]+)\/(.+)$/);
    if (!uriMatch) {
      throw new Error(`Invalid GCS URI format: ${videoUri}`);
    }
    
    const [, bucketName, filePath] = uriMatch;
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    const videoPath = path.join(outputDir, `scene_${sceneId}.mp4`);
    await file.download({ destination: videoPath });
    
    const generationTimeMs = Date.now() - startTime;
    TOTAL_SPENT += cost;
    
    console.log(`[Scene ${sceneId}] ✅ Generated in ${(generationTimeMs / 1000).toFixed(1)}s`);
    console.log(`[Scene ${sceneId}] 💰 Cost: $${cost.toFixed(2)} (Total: $${TOTAL_SPENT.toFixed(2)})`);
    
    return { videoPath, cost, generationTimeMs };
    
  } catch (error: any) {
    console.error(`[Scene ${sceneId}] ❌ Error:`, error.message);
    if (error.response?.data) {
      console.error(`[Scene ${sceneId}] API Response:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// ============================================================================
// BATCH SCENE GENERATION (PARALLEL)
// ============================================================================

async function generateScenesParallel(
  segments: TranscriptSegment[],
  outputDir: string,
  maxConcurrent: number = 3
): Promise<VideoScene[]> {
  
  const scenes: VideoScene[] = [];
  const errors: string[] = [];
  
  console.log(`\n📹 Generating ${segments.length} video scenes...`);
  console.log(`⚡ Max concurrent: ${maxConcurrent}`);
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < segments.length; i += maxConcurrent) {
    const batch = segments.slice(i, i + maxConcurrent);
    
    console.log(`\n🎬 Batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(segments.length / maxConcurrent)}`);
    
    const batchPromises = batch.map(async (segment) => {
      try {
        const prompt = await generateScenePrompt(segment);
        const durationSec = (segment.endMs - segment.startMs) / 1000;
        
        const { videoPath, cost, generationTimeMs } = await generateVideoScene(
          prompt,
          durationSec,
          segment.segmentId,
          outputDir
        );
        
        return {
          sceneId: segment.segmentId,
          prompt,
          duration: durationSec,
          startMs: segment.startMs,
          endMs: segment.endMs,
          videoPath,
          cost,
          generationTimeMs,
        };
      } catch (error: any) {
        errors.push(`Scene ${segment.segmentId}: ${error.message}`);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    scenes.push(...batchResults.filter(Boolean) as VideoScene[]);
  }
  
  if (errors.length > 0) {
    console.warn(`\n⚠️  ${errors.length} scenes failed:`);
    errors.forEach(e => console.warn(`   ${e}`));
  }
  
  return scenes;
}

// ============================================================================
// VIDEO STITCHING WITH FFMPEG
// ============================================================================

async function stitchVideos(
  scenes: VideoScene[],
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  
  return new Promise((resolve, reject) => {
    console.log(`\n🎞️  Stitching ${scenes.length} scenes with FFmpeg...`);
    
    // Sort scenes by startMs
    const sortedScenes = [...scenes].sort((a, b) => a.startMs - b.startMs);
    
    // Create FFmpeg concat file
    const concatList = sortedScenes.map(s => `file '${s.videoPath}'`).join('\n');
    const concatPath = path.join(path.dirname(outputPath), 'concat_list.txt');
    fs.writeFileSync(concatPath, concatList);
    
    let command = ffmpeg();
    
    // Concat videos
    command = command
      .input(concatPath)
      .inputOptions(['-f', 'concat', '-safe', '0']);
    
    // Overlay audio if provided
    if (audioPath && fs.existsSync(audioPath)) {
      console.log(`🎵 Overlaying podcast audio: ${audioPath}`);
      command = command
        .input(audioPath)
        .outputOptions(['-c:v', 'copy', '-c:a', 'aac', '-shortest']);
    } else {
      command = command.outputOptions(['-c', 'copy']);
    }
    
    command
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
        console.log(`✅ Video saved: ${outputPath}`);
        // Cleanup concat file
        fs.unlinkSync(concatPath);
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err);
        reject(err);
      })
      .run();
  });
}

// ============================================================================
// MAIN POC FUNCTION
// ============================================================================

async function runPoCVideoGeneration(
  transcriptPath: string,
  outputDir: string,
  audioPath?: string
): Promise<PoCResult> {
  
  console.log('\n' + '='.repeat(70));
  console.log('  PODCAST VIDEO GENERATION - PHASE 3 POC');
  console.log('='.repeat(70));
  console.log(`\n📄 Transcript: ${transcriptPath}`);
  console.log(`📁 Output dir: ${outputDir}`);
  console.log(`🎵 Audio: ${audioPath || 'None (silent)'}`);
  console.log(`💰 Budget cap: $${CONFIG.BUDGET_CAP}`);
  console.log(`📊 Model: ${CONFIG.MODEL}`);
  console.log(`💵 Price: $${CONFIG.PRICE_PER_SECOND}/sec\n`);
  
  const startTime = Date.now();
  const errors: string[] = [];
  
  try {
    // Step 1: Load transcript
    console.log('📖 Loading transcript...');
    const transcript: TranscriptSegment[] = JSON.parse(
      fs.readFileSync(transcriptPath, 'utf-8')
    );
    
    console.log(`✅ Loaded ${transcript.length} segments`);
    
    // Step 2: Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Step 3: Generate video scenes (run sequentially to avoid quota limits)
    const scenes = await generateScenesParallel(transcript, outputDir, 1);  // Changed from 3 to 1
    
    if (scenes.length === 0) {
      throw new Error('No scenes were generated successfully');
    }
    
    // Step 4: Stitch videos
    const outputVideoPath = path.join(outputDir, 'final_documentary.mp4');
    await stitchVideos(scenes, audioPath || null, outputVideoPath);
    
    // Step 5: Calculate results
    const totalDurationSec = scenes.reduce((sum, s) => sum + s.duration, 0);
    const totalCost = scenes.reduce((sum, s) => sum + s.cost, 0);
    const totalGenerationTimeMs = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(70));
    console.log('  POC RESULTS');
    console.log('='.repeat(70));
    console.log(`✅ Success: ${scenes.length}/${transcript.length} scenes`);
    console.log(`⏱️  Total time: ${(totalGenerationTimeMs / 1000 / 60).toFixed(2)} minutes`);
    console.log(`📹 Video duration: ${totalDurationSec.toFixed(1)} seconds`);
    console.log(`💰 Total cost: $${totalCost.toFixed(2)}`);
    console.log(`📊 Avg cost per scene: $${(totalCost / scenes.length).toFixed(2)}`);
    console.log(`⚡ Avg generation time: ${(scenes.reduce((s, sc) => s + sc.generationTimeMs, 0) / scenes.length / 1000).toFixed(1)}s`);
    console.log(`📁 Output: ${outputVideoPath}`);
    console.log('='.repeat(70) + '\n');
    
    return {
      success: true,
      totalScenes: scenes.length,
      totalDurationSec,
      totalCost,
      totalGenerationTimeMs,
      outputVideoPath,
      scenes,
      errors,
    };
    
  } catch (error: any) {
    console.error('\n❌ POC FAILED:', error.message);
    
    return {
      success: false,
      totalScenes: 0,
      totalDurationSec: 0,
      totalCost: TOTAL_SPENT,
      totalGenerationTimeMs: Date.now() - startTime,
      outputVideoPath: '',
      scenes: [],
      errors: [error.message],
    };
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Podcast Video Generation - Phase 3 PoC (Gemini Omni Flash via Vertex AI)

Usage:
  npx tsx poc_video_generation.ts --transcript <path> --output <dir> [--audio <path>]

Options:
  --transcript <path>   Path to transcript.json file (required)
  --output <dir>        Output directory for videos (required)
  --audio <path>        Path to podcast audio.mp3 (optional)
  --help                Show this help

Example:
  npx tsx poc_video_generation.ts \\
    --transcript ./test_transcript.json \\
    --output ./poc_output \\
    --audio ./test_audio.mp3

Environment Variables Required:
  GOOGLE_VERTEX_PROJECT - Your Vertex AI project ID
  GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON
    `);
    process.exit(0);
  }
  
  const transcriptPath = args[args.indexOf('--transcript') + 1];
  const outputDir = args[args.indexOf('--output') + 1];
  const audioPath = args.includes('--audio') ? args[args.indexOf('--audio') + 1] : undefined;
  
  if (!transcriptPath || !outputDir) {
    console.error('❌ Error: --transcript and --output are required');
    process.exit(1);
  }
  
  if (!fs.existsSync(transcriptPath)) {
    console.error(`❌ Error: Transcript file not found: ${transcriptPath}`);
    process.exit(1);
  }
  
  // Check for credentials file
  if (!fs.existsSync(CONFIG.CREDENTIALS_PATH)) {
    console.error(`❌ Error: Credentials file not found: ${CONFIG.CREDENTIALS_PATH}`);
    console.error(`\nPlease ensure the service account key exists at:`);
    console.error(`  ${path.resolve(CONFIG.CREDENTIALS_PATH)}`);
    console.error(`\nYour .env file should specify:`);
    console.error(`  GOOGLE_APPLICATION_CREDENTIALS="${CONFIG.CREDENTIALS_PATH}"`);
    console.error(`  GOOGLE_VERTEX_PROJECT="${CONFIG.PROJECT_ID}"`);
    process.exit(1);
  }
  
  console.log(`✅ Using Vertex AI PredictLongRunning API`);
  console.log(`✅ Service Account: ${CONFIG.CREDENTIALS_PATH}`);
  console.log(`✅ Project: ${CONFIG.PROJECT_ID}`);
  console.log(`✅ Location: ${CONFIG.LOCATION}`);
  console.log(`✅ Model: ${CONFIG.MODEL}\n`);
  
  // Initialize Firebase Admin (for future storage access if needed)
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  
  const result = await runPoCVideoGeneration(transcriptPath, outputDir, audioPath);
  
  // Save results to JSON
  const resultsPath = path.join(outputDir, 'poc_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));
  console.log(`📊 Results saved: ${resultsPath}`);
  
  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { runPoCVideoGeneration, generateScenePrompt, generateVideoScene };
