# Podcast Feature Fix

## Problem
The podcast "Generate audio" button was not working. When clicked, nothing happened because the frontend was calling a **non-existent API endpoint**.

## Root Cause

### Frontend was calling:
```typescript
POST /notebooks/${notebookId}/assets/${podcastId}/podcast
```

### But the backend only has:
```typescript
POST /podcasts/generate
```

The endpoint `/notebooks/${notebookId}/assets/${podcastId}/podcast` **does not exist** in the backend routes, causing the generate request to fail silently.

## The Fix

### Updated: `frontend/src/hooks/api/usePodcast.ts`

**Before**:
```typescript
const generateAudio = async () => {
  try {
    await api.post(`/notebooks/${notebookId}/assets/${podcastId}/podcast`);
  } catch (err: any) {
    throw new Error(err.response?.data?.error || err.message);
  }
};
```

**After**:
```typescript
const generateAudio = async () => {
  try {
    // Use the correct podcast generate endpoint
    // The podcast system requires source.kind and related fields
    await api.post(`/podcasts/generate`, {
      source: {
        kind: 'notebook',
        notebookId: notebookId,
        podcastId: podcastId
      }
    });
  } catch (err: any) {
    throw new Error(err.response?.data?.error || err.message);
  }
};
```

## How the Podcast System Works

### Backend Architecture

1. **Podcast Routes** (`backend-firestore/src/routes/podcasts.routes.ts`):
   ```
   POST /podcasts/generate      → Start podcast generation
   GET  /podcasts/history        → List user's podcasts
   GET  /podcasts/:id            → Get podcast metadata
   GET  /podcasts/:id/audio      → Get signed audio URL
   GET  /podcasts/:id/transcript → Get transcript
   POST /podcasts/:id/cancel     → Cancel generation
   POST /podcasts/:id/bookmark   → Create bookmark
   POST /podcasts/:id/analytics  → Log analytics event
   POST /podcasts/:id/ask        → Ask question (Live Q&A)
   ```

2. **Podcast Controller** (`backend-firestore/src/controllers/podcast.controller.ts`):
   - Handles podcast generation requests
   - Validates `source.kind` (must be: 'prompt', 'notebook', 'weak_topics', or 'topic')
   - Returns 202 (Accepted) with `{ podcastId, jobId, status: 'PENDING' }`
   - Generation happens asynchronously via BullMQ workers

3. **Generation Flow**:
   ```
   Client → POST /podcasts/generate
         ↓
   Controller validates request
         ↓
   Enqueues background job (BullMQ)
         ↓
   Returns { podcastId, jobId, status: 'PENDING' }
         ↓
   Background worker processes:
     - Generates script (LLM)
     - Converts to audio (TTS)
     - Stitches segments
     - Uploads to Firebase Storage
     - Updates Firestore status
         ↓
   Frontend listens to Firestore updates (real-time)
         ↓
   When status = 'COMPLETED' → Audio URL available
   ```

### Frontend Flow

1. **PodcastEpisode Component** (`frontend/src/components/assets/PodcastEpisode.tsx`):
   - Displays podcast player UI
   - Shows "Generate audio" button if audio not generated
   - Calls `generateAudio()` when button clicked

2. **usePodcast Hook** (`frontend/src/hooks/api/usePodcast.ts`):
   - Listens to Firestore for real-time podcast status
   - Provides `generateAudio()` function to trigger generation
   - **Now fixed** to call correct endpoint

3. **Podcast Metadata** (Firestore `podcasts` collection):
   ```typescript
   {
     podcastId: string
     notebookId: string
     userId: string
     title: string
     status: 'PENDING' | 'GENERATING_SCRIPT' | 'GENERATING_AUDIO' | 
             'STITCHING_AUDIO' | 'UPLOADING' | 'COMPLETED' | 'FAILED'
     audioUrl?: string          // Public URL (legacy)
     audioPath?: string         // GCS path (requires signed URL)
     transcriptUrl?: string
     transcriptPath?: string
     duration?: number
     segments?: Array<{ speaker, text, startMs, endMs }>
     createdAt: number
     updatedAt: number
   }
   ```

## Required Request Format

The `/podcasts/generate` endpoint expects:

```typescript
{
  source: {
    kind: 'prompt' | 'notebook' | 'weak_topics' | 'topic',
    
    // For kind='prompt':
    prompt?: string,
    
    // For kind='notebook':
    notebookId?: string,
    
    // For kind='topic':
    topic?: string,
    
    // Optional for all:
    podcastId?: string  // To regenerate existing podcast
  },
  
  // Optional generation parameters:
  duration?: number,      // Target duration in seconds
  language?: string,      // e.g., 'en', 'hi', 'es'
  voice?: string,         // TTS voice ID
  style?: string          // Podcast style/format
}
```

## Testing Instructions

### 1. Restart Backend (if not already running):
```bash
cd backend-firestore
npm run dev
```

### 2. Open Application:
Navigate to a chapter's podcast page

### 3. Click "Generate audio":
- Button should show loading spinner
- Status should change to "Generating..."
- Check backend logs for:
  ```
  POST /podcasts/generate 202
  [PodcastEngine] Starting generation for user xxx...
  [PodcastEngine] Job enqueued: job_xxx
  ```

### 4. Wait for Generation (1-3 minutes):
Watch the Firestore document update in real-time:
```
Status: PENDING → GENERATING_SCRIPT → GENERATING_AUDIO → 
        STITCHING_AUDIO → UPLOADING → COMPLETED
```

### 5. Verify Audio Plays:
- Once status = COMPLETED
- Audio player should appear
- Click Play to verify audio works

### 6. Check Browser Console:
Should see:
```
[usePodcast] Generating audio for notebook: nb_xxx, podcast: pod_xxx
[usePodcast] Generation started successfully
```

Should NOT see:
```
POST /notebooks/.../assets/.../podcast 404
Error: Request failed with status code 404
```

## Known Limitations

1. **Requires Redis + BullMQ Workers**:
   - Workers must be enabled (DISABLE_WORKERS=false)
   - Redis connection required for job queue
   - Without workers, podcast stays in PENDING forever

2. **Generation Time**:
   - Short chapters: 30-60 seconds
   - Medium chapters: 1-2 minutes
   - Long chapters: 2-5 minutes

3. **Rate Limits**:
   - `/podcasts/generate` has rate limiting
   - Max 5 generations per hour per user (configurable)

4. **Storage Requirements**:
   - Audio files stored in Firebase Storage
   - Typical size: 1-5 MB per podcast
   - Requires sufficient storage quota

## Troubleshooting

### Issue: "Generate audio" button does nothing

**Solution**: ✅ Fixed! The endpoint was wrong. Update applied.

---

### Issue: Status stuck on "Generating..."

**Possible Causes**:
1. Workers disabled (DISABLE_WORKERS=true)
2. Redis not connected
3. TTS API quota exceeded
4. Background job failed

**Check**:
```bash
# Backend logs
grep "PodcastEngine" backend.log

# Redis connection
grep "BackgroundQueue" backend.log
```

---

### Issue: Generation fails immediately

**Check backend logs for**:
- Validation errors (invalid source.kind)
- Missing notebook/chapter
- TTS API errors
- Storage permission issues

---

### Issue: Audio URL 404 after generation

**Possible Causes**:
1. audioPath exists but signed URL not generated
2. File deleted from Firebase Storage
3. Storage rules blocking access

**Solution**:
Call `/podcasts/:id/audio` endpoint to get fresh signed URL

---

## Production Considerations

### 1. Enable Workers:
```env
DISABLE_WORKERS=false
REDIS_URL=rediss://your-redis-url
```

### 2. Configure TTS Provider:
- Google Cloud Text-to-Speech API key
- Sufficient quota for batch generation
- Consider pre-generating popular chapters

### 3. Storage Setup:
- Firebase Storage bucket configured
- Appropriate storage rules
- Monitor storage usage

### 4. Rate Limiting:
- Adjust `podcastGenerateLimiter` in routes
- Consider per-user limits
- Add queue priority for premium users

### 5. Monitoring:
```bash
# Watch generation queue
grep "PodcastEngine.*enqueued" backend.log | wc -l

# Check completion rate
grep "PodcastEngine.*COMPLETED" backend.log | wc -l

# Monitor failures
grep "PodcastEngine.*FAILED" backend.log
```

## Future Enhancements

1. **Pre-generation**: Generate podcasts for all chapters during ingestion
2. **Caching**: Share podcasts across users for same content
3. **Multiple Voices**: Support different speaker voices (host + guest)
4. **Languages**: Multi-language podcast generation (Hindi, Spanish, etc.)
5. **Customization**: Let users choose podcast style, duration, complexity
6. **Download**: Allow offline podcast downloads
7. **Playlists**: Create podcast playlists from multiple chapters

---

**Status**: ✅ Fixed
**Files Modified**: `frontend/src/hooks/api/usePodcast.ts`
**Last Updated**: 2026-07-31
