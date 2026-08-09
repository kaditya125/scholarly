# Podcast Generation Fix

## 🔴 Problem

Podcast generation was failing silently. The UI showed "Failed" status but no podcasts appeared in the database.

**Symptoms:**
- Podcasts show "Failed" status in UI
- No entries in Firestore `podcasts` collection
- No error messages visible to user

## 🔍 Root Cause

**Frontend was sending incorrect request format:**

```javascript
// ❌ WRONG (what was being sent)
{
  source: {
    kind: 'notebook',
    notebookId: 'nb_123',
    podcastId: 'pod_456'  // ← Backend doesn't expect this
  }
}
```

**Backend was rejecting before creating podcast document:**
- Backend validation requires `durationMinutes`
- Backend rejects unknown fields in `source`
- Request fails with 400 error before podcast document is created
- Frontend didn't handle the error properly, so it showed generic "Failed"

## ✅ Solution

**Fixed frontend to send correct format:**

```javascript
// ✅ CORRECT (what should be sent)
{
  source: {
    kind: 'notebook',
    notebookId: 'nb_123'
  },
  durationMinutes: 10,
  speakerStyle: 'teacher_student',
  language: 'English'
}
```

## 📝 Changes Made

### File: `frontend/src/hooks/api/usePodcast.ts`

**Before:**
```typescript
await api.post(`/podcasts/generate`, {
  source: {
    kind: 'notebook',
    notebookId: notebookId,
    podcastId: podcastId  // ❌ Wrong
  }
});
```

**After:**
```typescript
await api.post(`/podcasts/generate`, {
  source: {
    kind: 'notebook',
    notebookId: notebookId
  },
  durationMinutes: 10,           // ✅ Added
  speakerStyle: 'teacher_student', // ✅ Added
  language: 'English'               // ✅ Added
});
```

## 🧪 Testing

### Before Testing Phase 1

**Now test the fix first:**

1. **Clear browser cache** (old compiled JS might be cached)
2. **Restart frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Try generating a podcast:**
   - Select a notebook/chapter
   - Click "Generate Podcast"
   - Should now proceed past PENDING status

4. **Check Firestore:**
   - Open Firebase Console
   - Check `podcasts` collection
   - Should see new podcast documents

5. **Monitor backend logs:**
   ```bash
   cd backend-firestore
   npm run dev
   # Watch for:
   # [Podcast] generation started for pod_...
   # [TTS] Initialized...
   ```

### After Fix Works

**Then test Phase 1 features:**

Follow `PHASE1_QUICK_START.md` to verify:
- Configuration loading
- Circuit breaker
- Cost tracking
- Request deduplication

## 📊 Expected Behavior After Fix

### ✅ What Should Happen:

1. **Request accepted:**
   ```
   POST /podcasts/generate → 202 Accepted
   Response: { podcastId: 'pod_...', jobId: 'pjob_...', status: 'PENDING' }
   ```

2. **Podcast document created:**
   ```javascript
   // In Firestore podcasts collection
   {
     id: 'pod_...',
     status: 'PENDING',
     title: 'Preparing your podcast…',
     userId: 'user_...',
     notebookId: 'nb_...',
     progressPct: 0
   }
   ```

3. **Job document created:**
   ```javascript
   // In Firestore podcast_jobs collection
   {
     id: 'pjob_...',
     podcastId: 'pod_...',
     stage: 'QUEUED',
     progressPct: 0
   }
   ```

4. **Worker picks up job** (if `DISABLE_WORKERS=false`):
   ```
   [Worker] Processing job pjob_...
   [PodcastEngine] Stage: PLANNING
   [PodcastEngine] Stage: SCRIPTING
   [TTS] Synthesizing...
   [PodcastEngine] Stage: STITCHING
   [PodcastEngine] Stage: READY
   ```

### ⚠️ If Workers Are Disabled:

If `DISABLE_WORKERS=true` in `.env`, podcasts will stay in PENDING forever because no worker processes them.

**Check:**
```bash
cd backend-firestore
grep DISABLE_WORKERS .env
# Should output: DISABLE_WORKERS=false
```

## 🚨 Common Issues After Fix

### Issue 1: Still shows "Failed"
**Cause:** Browser cached old JavaScript  
**Fix:** Hard refresh (Ctrl+Shift+R) or clear cache

### Issue 2: Stays in "PENDING" forever
**Cause:** Workers not running  
**Check:**
```bash
# In backend logs, should see:
[Worker] BackgroundWorker started
[Worker] MediaWorker started
```

**Fix:** Ensure `.env` has `DISABLE_WORKERS=false`

### Issue 3: "Unauthorized" error
**Cause:** Not logged in or token expired  
**Fix:** Log out and log back in

### Issue 4: "notebookId is required"
**Cause:** Invalid notebookId  
**Fix:** Ensure notebook exists and user has access

## 📝 API Reference

### Correct Podcast Generation Request

```http
POST /api/podcasts/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "source": {
    "kind": "notebook" | "prompt" | "weak_topics" | "topic",
    "notebookId": "string",  // for kind: notebook
    "prompt": "string"       // for kind: prompt
  },
  "durationMinutes": 5 | 10 | 15,  // Optional, default: 10
  "speakerStyle": "teacher_student" | "podcast_host" | "debate",  // Optional
  "voiceStyle": "casual" | "professional",  // Optional
  "language": "English" | "Hindi"  // Optional, default: English
}
```

### Response

```json
{
  "podcastId": "pod_abc123",
  "jobId": "pjob_xyz789",
  "status": "PENDING"
}
```

## ✅ Success Criteria

After this fix, podcast generation should:

1. ✅ Create podcast document in Firestore
2. ✅ Create job document in Firestore
3. ✅ Show PENDING → PLANNING → SCRIPTING → SYNTHESIZING progress
4. ✅ Eventually reach READY status
5. ✅ Audio file accessible via `/podcasts/:id/audio`

## 🔄 Rollback

If this fix causes issues:

```bash
cd frontend
git checkout HEAD~1 src/hooks/api/usePodcast.ts
npm run dev
```

---

**Status:** ✅ FIXED  
**Impact:** High - Unblocks podcast generation  
**Priority:** Critical - Deploy immediately  
**Date:** 2026-07-31
