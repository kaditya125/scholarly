# Podcast Generation Troubleshooting Guide

## 🔴 Current Issues Identified

### Issue #1: Backend Not Running ❌
**Symptom:** Podcasts show "Failed" immediately  
**Cause:** Backend server is not running  
**Impact:** Frontend cannot connect to API

### Issue #2: No Notebooks in Database ⚠️
**Symptom:** No content to generate podcasts from  
**Cause:** No chapters/documents uploaded yet  
**Impact:** Even if backend runs, podcasts would fail due to empty content

---

## ✅ **SOLUTION: Step-by-Step Fix**

### Step 1: Start Backend (REQUIRED!)

```bash
# Terminal 1 - Backend
cd d:\scholarly\backend-firestore
npm run dev
```

**✅ Success indicators:**
```
[Server] Scholarly Backend listening on port 8080
[Worker] BackgroundWorker started
[Worker] MediaWorker started
[TTS] Initialized with provider: google-cloud
[TTS] Voice configuration loaded: 6 voices
[TTS] Circuit breaker enabled
```

**❌ If you see errors:**
- `EADDRINUSE`: Port 8080 is already in use
  - Fix: Kill process using port 8080 or change PORT in .env
- `Redis connection failed`: Redis is down
  - Fix: Set `DISABLE_WORKERS=true` temporarily in .env
- `Firebase auth error`: Credentials issue
  - Fix: Check FIREBASE_* variables in .env

### Step 2: Verify Backend is Running

**Open in browser:**
```
http://localhost:8080/api/health
```

**Should see:**
```json
{"status":"ok"}
```

**Or try:**
```bash
curl http://localhost:8080/api/health
```

### Step 3: Start Frontend

```bash
# Terminal 2 - Frontend
cd d:\scholarly\frontend
npm run dev
```

**Should see:**
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 4: Upload a Chapter/Document

**Before generating podcasts, you need content:**

1. Go to your app: `http://localhost:5173`
2. Log in
3. **Upload a chapter/PDF document**
4. Wait for processing to complete
5. **Then** try generating a podcast

---

## 🔍 **Diagnostic Commands**

### Check if Backend is Running

```bash
# Windows
netstat -ano | findstr :8080

# Should show: TCP    0.0.0.0:8080    LISTENING
```

### Check Backend Logs

```bash
cd backend-firestore
npm run dev
# Watch for errors in terminal
```

### Check if Notebooks Exist

```bash
cd backend-firestore
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
admin.firestore().collection('notebooks').limit(1).get()
  .then(snap => console.log('Notebooks found:', snap.size))
  .then(() => process.exit());
"
```

### Check if Frontend Can Connect

**Open browser console (F12) and run:**
```javascript
fetch('http://localhost:8080/api/health')
  .then(r => r.json())
  .then(d => console.log('Backend:', d))
  .catch(e => console.error('Cannot connect:', e))
```

---

## 📋 **Common Error Messages**

### "Failed to fetch" in Browser Console

**Cause:** Backend not running or CORS issue  
**Fix:**
1. Start backend
2. Check CORS_ORIGINS in backend .env includes frontend URL
3. Current setting should have: `http://localhost:5173`

### "notebookId is required"

**Cause:** No notebook selected or notebook doesn't exist  
**Fix:** Upload a chapter first, then try generating podcast

### Stuck at "PENDING" Forever

**Cause:** Workers not running  
**Fix:**
1. Check `DISABLE_WORKERS=false` in backend .env
2. Check Redis connection is working
3. Restart backend

### "Unauthorized"

**Cause:** Not logged in or token expired  
**Fix:** Log out and log back in

---

## 🎯 **Complete Setup Checklist**

Before generating podcasts, verify:

- [ ] ✅ Backend is running (`http://localhost:8080/api/health` works)
- [ ] ✅ Frontend is running (`http://localhost:5173` loads)
- [ ] ✅ You are logged in
- [ ] ✅ At least one notebook/chapter exists
- [ ] ✅ `DISABLE_WORKERS=false` in backend .env
- [ ] ✅ Redis is connected (or workers disabled)
- [ ] ✅ Google Cloud TTS credentials exist (`secrets/vertex-sa.json`)
- [ ] ✅ Browser console shows no errors

---

## 🚀 **Quick Test After Fix**

### 1. Verify Backend Health

```bash
curl http://localhost:8080/api/health
# Should return: {"status":"ok"}
```

### 2. Check if You're Logged In

Open browser console (F12):
```javascript
// Should show your user info
console.log('User:', window.localStorage)
```

### 3. Upload a Test Chapter

1. Go to your app
2. Upload a small PDF
3. Wait for processing
4. Status should change to "READY"

### 4. Generate Podcast

1. Go to Podcasts page
2. Click "+ New podcast"
3. Select the uploaded chapter
4. Click "Generate"
5. Watch status change: PENDING → PLANNING → SCRIPTING → SYNTHESIZING → READY

---

## 📊 **Expected Timeline**

| Stage | Duration | Status |
|-------|----------|--------|
| Request | Instant | 202 Accepted |
| QUEUED | <5 seconds | Job in queue |
| PLANNING | 5-15 seconds | Analyzing content |
| SCRIPTING | 20-60 seconds | Writing dialogue |
| SYNTHESIZING | 30-120 seconds | TTS generation |
| STITCHING | 10-30 seconds | FFmpeg merging |
| UPLOADING | 5-10 seconds | Firebase Storage |
| **READY** | **~1-4 minutes total** | **✅ Podcast ready** |

---

## ⚠️ **If Still Failing**

### Check Backend Terminal for Errors

Look for:
```
[PodcastEngine] Error: ...
[TTS] Synthesis failed: ...
[Worker] Job failed: ...
```

### Check Browser Console (F12 → Console)

Look for:
```
POST http://localhost:8080/api/podcasts/generate 500 (Internal Server Error)
```

### Check Network Tab (F12 → Network)

1. Filter by "XHR"
2. Click on "generate" request
3. Look at:
   - **Request Headers:** Should have Authorization token
   - **Request Payload:** Should match format
   - **Response:** Shows actual error

### Get Request/Response Details

**In browser console:**
```javascript
// Enable detailed logging
localStorage.setItem('debug', 'api:*')
```

---

## 🔧 **Emergency Fixes**

### Fix #1: Port Already in Use

```bash
# Find process using port 8080
netstat -ano | findstr :8080

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Or change port in backend .env
PORT=8081
```

### Fix #2: Redis Connection Failing

```bash
# Temporarily disable workers
# In backend .env:
DISABLE_WORKERS=true

# Restart backend
```

### Fix #3: TTS Credentials Missing

```bash
# Check if file exists
dir backend-firestore\secrets\vertex-sa.json

# If missing, download from Google Cloud Console
# Service Accounts → scholarly-grok → Keys → Create Key
```

---

## 📝 **What Should Work Now**

After following steps above:

1. ✅ Backend responds to health check
2. ✅ Frontend can connect to backend
3. ✅ Notebooks exist in database
4. ✅ Podcast generation creates documents
5. ✅ Workers process jobs
6. ✅ TTS synthesis works
7. ✅ Audio files get created
8. ✅ Status reaches READY

---

## 🎬 **Full Workflow**

```
User clicks "Generate Podcast"
    ↓
Frontend sends POST /api/podcasts/generate
    ↓
Backend validates request
    ↓
Creates podcast document (PENDING)
    ↓
Creates job document (QUEUED)
    ↓
Worker picks up job
    ↓
PLANNING → Extract content
    ↓
SCRIPTING → Generate dialogue
    ↓
SYNTHESIZING → TTS for each line
    ↓
STITCHING → FFmpeg merge
    ↓
UPLOADING → Firebase Storage
    ↓
Status: READY ✅
    ↓
User can play audio
```

---

**Status:** 🔴 Backend not running  
**Priority:** Critical - Must start backend first  
**Date:** 2026-07-31

**Start here:** Run `cd backend-firestore && npm run dev`
