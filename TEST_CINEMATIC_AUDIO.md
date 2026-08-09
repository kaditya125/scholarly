# Test Cinematic Audio Integration

**Status:** ✅ Ready to Test  
**Date:** 2026-08-06

---

## What's Enabled

I've enabled the following features in your `.env`:

```bash
# AI Director - Creates timelines for cinematic rendering
AI_DIRECTOR_ENABLED=true
AI_DIRECTOR_SHADOW_MODE=true
AI_PRODUCER_ENABLED=true

# Cinematic Audio - Renders in shadow mode (logs only)
CINEMATIC_AUDIO_ENABLED=false
```

**What this means:**
- ✅ AI Director will create `MasterTimeline` documents
- ✅ CinematicShadowRunner will load and render them
- ✅ Render stats will be logged
- ✅ Audio will NOT replace AudioComposer output (shadow mode)
- ✅ Zero production risk - users get normal podcasts

---

## Quick Start Test

### 1. Start the Backend

```bash
cd d:\scholarly\backend-firestore
npm run serve
```

**Wait for:** `Server listening on port 8080`

### 2. Start the Frontend

```bash
cd d:\scholarly\frontend
npm run dev
```

**Wait for:** `Local: http://localhost:5173`

### 3. Create a Test Podcast

Open browser to `http://localhost:5173` and:

1. Sign in (or create account)
2. Click "Create Podcast"
3. Use any prompt (e.g., "Explain photosynthesis in 5 minutes")
4. Select duration: 5 minutes
5. Click "Generate"

### 4. Watch the Logs

In the backend terminal, watch for these stages:

**Expected log flow:**
```
[PodcastEngine] PLANNING stage completed
[PodcastEngine] SCRIPTING stage completed
[ShadowMode] Planning artifacts stored
  ↳ scenes: X
  ↳ voiceEvents: X
  ↳ musicEvents: X
  ↳ inspect: npm run inspect:timeline -- -u <uid> -p <podcastId>
[PodcastEngine] SYNTHESIZING chunks completed
[PodcastEngine] STITCHING stage completed
[CinematicShadow] Starting cinematic render
  ↳ scenes: X
  ↳ voiceEvents: X
  ↳ musicEvents: X
  ↳ ambienceEvents: X
  ↳ sfxEvents: X
[CinematicShadow] Progress: initializing (0%)
[CinematicShadow] Progress: warming_assets (5%)
[CinematicShadow] Progress: synthesizing_voice (10%)
[VoiceEngine] Synthesis complete
[MusicEngine] Some music cues were skipped (asset unresolved)
[AmbienceEngine] Some ambience layers were skipped (asset unresolved)
[SFXEngine] Some SFX cues were skipped (asset unresolved)
[AudioMixer] Filter graph built
[CinematicShadow] Render complete
  ↳ renderTimeMs: ~30000
  ↳ voiceCues: X
  ↳ musicCues: X (skipped because asset library empty)
  ↳ warnings: X
[PodcastEngine] UPLOADING stage completed
[PodcastEngine] DONE
```

---

## What to Look For

### ✅ Success Indicators

**1. Timeline Created:**
```
[ShadowMode] Planning artifacts stored
```

**2. Cinematic Render Attempted:**
```
[CinematicShadow] Starting cinematic render
```

**3. Graceful Degradation:**
```
[MusicEngine] Some music cues were skipped
[AmbienceEngine] Some ambience layers were skipped
[SFXEngine] Some SFX cues were skipped
```
This is **expected** because asset library is empty!

**4. Render Completed:**
```
[CinematicShadow] Render complete
  ↳ shadowMode: true
  ↳ renderTimeMs: ~30000
```

**5. Normal Podcast Served:**
```
[PodcastEngine] DONE
status: READY
```

### ⚠️ What's Missing (Expected)

**Asset library is empty**, so you'll see:
- Music events planned but **skipped** during render
- Ambience events planned but **skipped**
- SFX events planned but **skipped**
- Final audio is **voice-only** (same as AudioComposer)

**This is correct behavior!** The system gracefully degrades to voice-only when assets are missing.

---

## Inspect the Timeline

After the podcast completes, you can inspect the timeline:

```bash
cd d:\scholarly\backend-firestore

# Get user ID and podcast ID from logs, then:
npm run inspect:timeline -- -u <userId> -p <podcastId>
```

**What you'll see:**
- Scene breakdown
- Voice events with emotion tags
- Music cues (with requirements but no resolved assets)
- Ambience layers (planned but unresolved)
- SFX cues (planned but unresolved)
- Timing information
- Validation results

---

## Next Steps After This Test

### If Test Succeeds

You'll have validated:
- ✅ AI Director integration works
- ✅ Timeline creation successful
- ✅ CinematicShadowRunner runs without errors
- ✅ Graceful degradation handles missing assets
- ✅ No breaking changes to existing flow

**Next milestone:** Generate asset library ($5, 30 minutes)

```bash
npm run generate:assets -- --execute
```

### If Test Fails

**Check logs for errors:**
```bash
# Look for ERROR or FAILED in logs
grep -i "error\|failed" backend-firestore/logs/*.log

# Check specific components
grep "ShadowMode" logs/*.log
grep "CinematicShadow" logs/*.log
grep "CinematicAudioRenderer" logs/*.log
```

**Common issues:**

**Issue 1:** No timeline created
```
[CinematicShadow] No timeline found; skipping render
```
**Cause:** AI Director didn't run or failed  
**Check:** Look for `[ShadowMode]` logs  
**Fix:** Check AI Director errors in logs

**Issue 2:** Build errors
```
TypeError: Cannot read property 'X' of undefined
```
**Cause:** Import or type issue  
**Fix:** Run `npm run build` and check TypeScript errors

**Issue 3:** Podcast generation fails
```
[PodcastEngine] generation failed
```
**Cause:** Unrelated to cinematic audio  
**Fix:** Check the specific error message

---

## Monitoring Commands

### Real-time Log Watching

**Terminal 1 (Backend logs):**
```bash
cd d:\scholarly\backend-firestore
npm run serve
```

**Terminal 2 (Log grep):**
```bash
cd d:\scholarly\backend-firestore

# Watch cinematic render progress
tail -f logs/*.log | grep -i "cinematic\|shadow"

# Or specific components
tail -f logs/*.log | grep -i "voiceengine\|musicengine\|mixer"
```

### Post-Generation Analysis

```bash
# Summary of cinematic render
grep "CinematicShadow" logs/*.log

# Check degradation
grep "skipped" logs/*.log

# Render timing
grep "renderTimeMs" logs/*.log

# Warnings
grep "warnings" logs/*.log
```

---

## Success Criteria

**This test is successful if:**

1. ✅ Podcast generates normally (status: READY)
2. ✅ Timeline created (check `[ShadowMode]` logs)
3. ✅ Cinematic render attempted (check `[CinematicShadow]` logs)
4. ✅ Graceful degradation worked (assets skipped, not failed)
5. ✅ Render completed (check `Render complete` log)
6. ✅ User receives normal podcast (voice-only)

**If all 6 criteria pass → Integration successful!**

---

## Configuration Summary

**Current Setup:**

| Feature | Status | Effect |
|---------|--------|--------|
| AI Director | ✅ Enabled | Creates timelines |
| Shadow Mode | ✅ Enabled | Timelines stored, rendering observed |
| AI Producer | ✅ Enabled | Pedagogical layer active |
| Cinematic Render | ✅ Shadow | Runs in background, logs only |
| Asset Library | ❌ Empty | Music/ambience/SFX skipped |
| Emotion Voices | ❌ Disabled | Standard TTS only |

**Safe to test:** YES - Zero production impact

---

## Ready to Test?

**Run these commands:**

```bash
# Terminal 1: Backend
cd d:\scholarly\backend-firestore
npm run serve

# Terminal 2: Frontend
cd d:\scholarly\frontend
npm run dev

# Browser: http://localhost:5173
# Create a podcast and watch the logs!
```

**Expected outcome:** Normal podcast generation + cinematic render logs + graceful degradation messages

**Time:** ~5 minutes  
**Cost:** $0 (using existing TTS)  
**Risk:** Zero (shadow mode)

---

Good luck with the test! Let me know what you see in the logs. 🚀

