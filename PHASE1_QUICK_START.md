# Phase 1 Quick Start Guide

## 🎯 TL;DR

**Status:** ✅ Phase 1 Complete - 50/50 tests passed  
**Next Step:** End-to-end testing  
**Time Required:** 1-2 hours

---

## Quick Test (5 minutes)

### 1. Verify Files Exist

```bash
cd backend-firestore

# Check new files
ls config/tts.config.json
ls src/services/ai/middleware/tts.circuit-breaker.ts
ls src/services/ai/costTracking.service.ts

# All should exist ✅
```

### 2. Run Structure Test

```bash
node test-phase1.js
# Should show: ✅ Passed: 50, ❌ Failed: 0
```

### 3. Check Configuration

```bash
cat config/tts.config.json | grep "provider"
# Should output: "provider": "google-cloud"
```

---

## Full E2E Test (1-2 hours)

### Step 1: Configure (2 minutes)

Add to `backend-firestore/.env`:
```bash
TTS_PROVIDER=google-cloud
TTS_MONTHLY_BUDGET=500.00
TTS_COST_LIMIT_PER_PODCAST=1.00
```

### Step 2: Start Backend (30 seconds)

```bash
cd backend-firestore
npm run dev
```

### Step 3: Watch Logs (1 minute)

Look for Phase 1 startup messages:
```
[TTS] Initialized with provider: google-cloud
[TTS] Voice configuration loaded: 6 voices
[TTS] Circuit breaker enabled
```

✅ If you see these, Phase 1 is loaded correctly!

### Step 4: Generate Test Podcast (10-15 minutes)

**Via UI:**
1. Open your app
2. Go to podcast generation
3. Select a notebook/chapter
4. Click "Generate Podcast"
5. Wait for completion

**Via API:**
```bash
curl -X POST http://localhost:8080/api/podcasts/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {
      "kind": "notebook",
      "notebookId": "YOUR_NOTEBOOK_ID"
    },
    "durationMinutes": 10,
    "speakerStyle": "teacher_student"
  }'
```

### Step 5: Verify Logs (2 minutes)

During generation, check logs for:

✅ **Configuration Loading:**
```
[TTS] Synthesizing: {
  speaker: 'Host',
  voice: 'en-US-Journey-F',
  characterCount: 1234,
  estimatedCost: 0.0198
}
```

✅ **Cost Tracking:**
```
[CostTracking] Tracked TTS synthesis {
  userId: 'user123',
  characterCount: 1234,
  estimatedCost: 0.0198,
  month: '2026-07'
}
```

### Step 6: Check Firestore (2 minutes)

Open Firebase Console → Firestore Database:

✅ **Check `podcast_costs` collection:**
- Should have new entries
- Each entry should have: userId, podcastId, characterCount, estimatedCost

✅ **Check `podcast_monthly_costs` collection:**
- Document ID: `{userId}_2026-07`
- Should have: totalCost, totalCharacters, totalRequests

### Step 7: Test Deduplication (5 minutes)

1. Start generating a podcast
2. **While it's still generating**, send the exact same request again
3. Check response - should immediately return same `podcastId`
4. Check logs for:
```
[PodcastEngine] Deduplication: returning existing in-progress podcast
```

---

## What Success Looks Like

### ✅ All Green
- Startup logs show configuration loaded
- Podcast generates successfully
- Cost entries in Firestore
- Deduplication works
- No errors in logs

### ⚠️ Yellow Flags (Non-Critical)
- Budget warning (over 80%) - just monitoring
- Circuit breaker opened - might indicate API issues, check credentials

### ❌ Red Flags (Need Fixing)
- TypeScript compilation errors
- TTS synthesis failures
- Firestore permission errors
- No cost tracking entries

---

## Common Issues & Fixes

### Issue: "Cannot find module 'cockatiel'"
**Fix:**
```bash
cd backend-firestore
npm install
```

### Issue: No logs showing Phase 1 features
**Fix:**
```bash
# Check if using old cached build
npm run build
pm2 restart backend

# Or if using npm run dev, restart it
```

### Issue: Firestore permission errors
**Fix:**
1. Check `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
2. Verify service account has Firestore write permissions
3. Test Firestore connection manually

### Issue: TTS synthesis fails immediately
**Fix:**
1. Check Google Cloud TTS API is enabled
2. Verify service account has TTS permissions
3. Check API quota limits

---

## Quick Commands Reference

```bash
# Run structure test
node test-phase1.js

# Start backend
cd backend-firestore && npm run dev

# Check logs (if using pm2)
pm2 logs backend

# Restart backend (if using pm2)
pm2 restart backend

# Build TypeScript
npm run build

# Check Firestore cost entries (Firebase CLI)
firebase firestore:get podcast_costs
```

---

## Success Checklist

Before considering Phase 1 complete:

- [ ] Structure test passes (50/50)
- [ ] Backend starts without errors
- [ ] Configuration loads correctly
- [ ] Test podcast generates successfully
- [ ] Cost tracking entries in Firestore
- [ ] Monthly aggregate updates correctly
- [ ] Deduplication works (duplicate request returns existing ID)
- [ ] Logs show Phase 1 features
- [ ] No increase in generation time
- [ ] No new errors in production

**Current Status:** 1/10 complete (structure test only)

---

## Time Estimates

| Task | Time | Status |
|------|------|--------|
| Structure test | 2 min | ✅ Done |
| Configuration | 2 min | ⏳ Pending |
| Backend restart | 1 min | ⏳ Pending |
| Generate test podcast | 10 min | ⏳ Pending |
| Verify logs | 2 min | ⏳ Pending |
| Check Firestore | 2 min | ⏳ Pending |
| Test deduplication | 5 min | ⏳ Pending |
| **Total** | **~25 min** | **1/7 done** |

---

## What's Next?

### After E2E Testing Passes:

**Option 1: Deploy to Production** (Recommended)
- Timeline: 1 day
- Risk: Low
- Benefits: Immediate cost visibility and reliability improvements

**Option 2: Start Phase 2** (Provider Abstraction)
- Timeline: 2-4 weeks
- Risk: Medium
- Benefits: Future-proof for multiple TTS providers

**Option 3: Monitor & Optimize** (Conservative)
- Timeline: 1-2 weeks
- Risk: Very low
- Benefits: Collect production data before next phase

---

## Need Help?

**Documentation:**
- Full implementation guide: `PODCAST_PHASE1_IMPLEMENTATION.md`
- Test results: `PODCAST_PHASE1_TEST_RESULTS.md`
- Architecture audit: `PODCAST_ARCHITECTURE_AUDIT_REPORT.md`

**Rollback:**
If anything goes wrong, see rollback section in `PHASE1_VALIDATION_SUMMARY.md`

---

**Ready to test?** Just follow Step 1-7 above! 🚀

**Last Updated:** 2026-07-31
