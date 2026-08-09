# Podcast Video Generation - Phase 3 PoC

**Status:** Ready for testing  
**Budget Cap:** $500  
**Estimated Cost:** ~$2-3 per test run  
**Model:** Veo 3.1 Lite (720p)

---

## Quick Start

### Prerequisites

1. **Vertex AI Credentials**
   ```bash
   # Set your service account key path
   export GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
   
   # Or ensure FIREBASE_PROJECT_ID is set in .env
   ```

2. **Dependencies** (already installed)
   - `@google-cloud/vertexai` ✅
   - `fluent-ffmpeg` ✅
   - `firebase-admin` ✅

3. **FFmpeg** (already configured)
   - `ffmpeg-static` ✅
   - `ffprobe-static` ✅

---

## Run the PoC

### Test with Solar System Example

```bash
# Navigate to backend directory
cd backend-firestore

# Run the PoC script
npx tsx poc_video_generation.ts \
  --transcript ./test_transcript_solar_system.json \
  --output ./poc_output

# Expected output:
# - 6 video scenes generated (~44 seconds total)
# - Cost: ~$2.20 (6 scenes × 8s avg × $0.05/sec)
# - Time: ~2-4 minutes
# - Final video: ./poc_output/final_documentary.mp4
```

### With Audio Overlay

```bash
# If you have a podcast audio file
npx tsx poc_video_generation.ts \
  --transcript ./test_transcript_solar_system.json \
  --output ./poc_output \
  --audio ./path/to/audio.mp3
```

### With Real Podcast Transcript

```bash
# Use an actual podcast transcript from Firebase Storage
# 1. Download transcript.json from Firebase
# 2. Run with that transcript

npx tsx poc_video_generation.ts \
  --transcript ./downloaded_transcript.json \
  --output ./poc_output \
  --audio ./downloaded_audio.mp3
```

---

## Expected Output

### Console Output

```
======================================================================
  PODCAST VIDEO GENERATION - PHASE 3 POC
======================================================================

📄 Transcript: ./test_transcript_solar_system.json
📁 Output dir: ./poc_output
🎵 Audio: None (silent)
💰 Budget cap: $500
📊 Model: veo-3-1-lite
💵 Price: $0.03/sec

📖 Loading transcript...
✅ Loaded 6 segments

📹 Generating 6 video scenes...
⚡ Max concurrent: 3

🎬 Batch 1/2
[Scene 0] Generating 8s video...
[Scene 0] Calling Veo API...
[Scene 0] ✅ Generated in 18.2s
[Scene 0] 💰 Cost: $0.24 (Total: $0.24)

[Scene 1] Generating 5s video...
[Scene 1] ✅ Generated in 15.1s
[Scene 1] 💰 Cost: $0.15 (Total: $0.39)

...

🎬 Batch 2/2
...

🎞️  Stitching 6 scenes with FFmpeg...
✅ Video saved: ./poc_output/final_documentary.mp4

======================================================================
  POC RESULTS
======================================================================
✅ Success: 6/6 scenes
⏱️  Total time: 3.24 minutes
📹 Video duration: 44.0 seconds
💰 Total cost: $2.20
📊 Avg cost per scene: $0.37
⚡ Avg generation time: 16.8s
📁 Output: ./poc_output/final_documentary.mp4
======================================================================
```

### Generated Files

```
poc_output/
├── scene_0.mp4          # Individual scene videos
├── scene_1.mp4
├── scene_2.mp4
├── scene_3.mp4
├── scene_4.mp4
├── scene_5.mp4
├── final_documentary.mp4  # Stitched final video
└── poc_results.json      # Detailed results
```

---

## Cost Tracking

The script automatically tracks costs and enforces the $500 budget cap:

```typescript
// Budget enforcement (in script)
if (TOTAL_SPENT + cost > CONFIG.BUDGET_CAP) {
  throw new Error(`BUDGET EXCEEDED: Would cost $${(TOTAL_SPENT + cost).toFixed(2)}`);
}
```

**Cost Breakdown:**
- Veo 3.1 Lite (video only): $0.03/second
- Veo 3.1 Lite (video + audio): $0.05/second

**Test Run Estimates:**
- Solar System (44s): ~$1.32 - $2.20
- 10-min podcast (600s): ~$18 - $30
- Full PoC (5 docs): ~$90 - $150

---

## Testing Plan

### Phase 3A: Single Test Run

```bash
# Run 1: Solar System (short test)
npx tsx poc_video_generation.ts \
  --transcript ./test_transcript_solar_system.json \
  --output ./poc_test_1

# Expected: 6 scenes, ~$2, ~3 minutes
```

**Success Criteria:**
- ✅ All scenes generate successfully
- ✅ Cost < $3
- ✅ Generation time < 5 minutes
- ✅ Final video plays correctly
- ✅ No errors or crashes

### Phase 3B: Multiple Test Runs

```bash
# Run 2: Different chapter (if available)
npx tsx poc_video_generation.ts \
  --transcript ./another_transcript.json \
  --output ./poc_test_2

# Run 3: With audio overlay
npx tsx poc_video_generation.ts \
  --transcript ./test_transcript_solar_system.json \
  --output ./poc_test_3 \
  --audio ./test_audio.mp3

# Run 4-5: Full 10-minute podcasts
# (Budget permitting)
```

---

## Troubleshooting

### Error: "No video data returned from Veo API"

**Cause:** Veo API call failed or model not available

**Fix:**
1. Check Vertex AI is enabled in your GCP project
2. Verify `GOOGLE_APPLICATION_CREDENTIALS` is set
3. Ensure project has Veo 3.1 Lite access
4. Check quota limits

```bash
# Test Vertex AI access
gcloud auth list
gcloud config get-value project
```

### Error: "BUDGET EXCEEDED"

**Cause:** Cost would exceed $500 cap

**Fix:**
1. Check `TOTAL_SPENT` in console output
2. Adjust `BUDGET_CAP` in script if needed
3. Use shorter test transcripts

### Error: "FFmpeg command failed"

**Cause:** FFmpeg binary not found or concat failed

**Fix:**
1. Verify ffmpeg-static is installed
2. Check scene video files exist in output dir
3. Review FFmpeg error in console

---

## Next Steps After PoC

### If PoC Succeeds (Phase 4-5)

1. **Performance Benchmarking**
   - Measure generation times
   - Track actual costs
   - Test with different content types

2. **Quality Assessment**
   - User testing (10+ users)
   - Feedback collection
   - Comparison with expectations

3. **Cost Optimization**
   - Identify reduction strategies
   - Test shorter scenes
   - Evaluate Gemini Omni Flash

4. **Integration Planning**
   - Design production architecture
   - Define API endpoints
   - Create storage structure

5. **Final Report**
   - GO/NO-GO recommendation
   - Monetization strategy
   - Rollout timeline

### If PoC Fails

1. Document failure reasons
2. Identify technical blockers
3. Calculate actual costs vs estimates
4. Make NO-GO recommendation

---

## Configuration

### Modify Settings

Edit `poc_video_generation.ts`:

```typescript
const CONFIG = {
  MODEL: 'veo-3-1-lite',  // or 'gemini-omni-flash-preview'
  RESOLUTION: '720p',      // or '1080p' (costs more)
  MAX_SCENE_DURATION: 8,   // 4-8 seconds
  BUDGET_CAP: 500,         // Adjust as needed
  PRICE_PER_SECOND: 0.03,  // Update if using different model
};
```

### Switch to Gemini Omni Flash

```typescript
const CONFIG = {
  MODEL: 'gemini-omni-flash-preview',
  PRICE_PER_SECOND: 0.10,  // $0.10/sec
};
```

---

## Files in This PoC

```
backend-firestore/
├── poc_video_generation.ts              # Main PoC script
├── test_transcript_solar_system.json    # Sample test data
├── POC_VIDEO_GENERATION_README.md       # This file
└── poc_output/                          # Generated videos (created on run)
```

---

## Support

**Questions?** Check the Phase 2 Feasibility Report:
- `d:\scholarly\PODCAST_VIDEO_POC_PHASE2_FEASIBILITY.md`

**Issues?** Review the Phase 1 Audit Report:
- `d:\scholarly\PODCAST_VIDEO_POC_PHASE1_COMPLETE.md`

---

**Ready to run!** 🚀

Try the test command:
```bash
npx tsx poc_video_generation.ts --transcript ./test_transcript_solar_system.json --output ./poc_output
```
