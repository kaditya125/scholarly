# 🚀 Start Podcast System - Quick Guide

## ⚡ Quick Start (Copy & Paste)

### Terminal 1: Start Backend

```bash
cd d:\scholarly\backend-firestore
npm run dev
```

**Wait for:**
```
✅ [Server] Listening on port 8080
✅ [Worker] BackgroundWorker started
✅ [TTS] Initialized with provider: google-cloud
```

### Terminal 2: Start Frontend

```bash
cd d:\scholarly\frontend
npm run dev
```

**Wait for:**
```
✅ Local: http://localhost:5173/
```

### Browser: Test Health

Open: `http://localhost:8080/api/health`

**Should show:** `{"status":"ok"}`

---

## 📋 **Current Status**

Based on diagnostic:

| Component | Status | Action Needed |
|-----------|--------|---------------|
| Backend | ❌ NOT RUNNING | ⚠️ START BACKEND FIRST |
| Frontend | ❓ Unknown | Start after backend |
| Notebooks | ❌ EMPTY | Upload a chapter |
| Workers | ✅ Enabled | Good to go |
| TTS Credentials | ✅ Found | Good to go |

---

## 🎯 **What You Need to Do NOW**

### Step 1: Open TWO Terminals

**Terminal 1 (Backend):**
```bash
cd d:\scholarly\backend-firestore
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd d:\scholarly\frontend  
npm run dev
```

### Step 2: Upload a Chapter

1. Open `http://localhost:5173` in browser
2. Log in
3. Go to your notebooks/documents page
4. **Upload a PDF/chapter**
5. Wait for "READY" status

### Step 3: Try Generating Podcast

1. Go to Podcasts page
2. Click "+ New podcast"
3. Select uploaded chapter
4. Click "Generate"

---

## ✅ **Success Indicators**

After starting both servers:

### Backend Terminal Should Show:
```
[Server] Scholarly Backend listening on port 8080
[Worker] BackgroundWorker started
[Worker] MediaWorker started  
[TTS] Initialized with provider: google-cloud
[TTS] Voice configuration loaded: 6 voices
[TTS] Circuit breaker enabled: 5 consecutive failures → 60s cooldown
```

### Frontend Terminal Should Show:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### Browser Should Show:
- No errors in console (F12)
- App loads correctly
- Can log in

---

## ⚠️ **Common Startup Issues**

### Error: "Port 8080 is already in use"

**Fix:**
```bash
# Kill existing process
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Then try again
npm run dev
```

### Error: "Redis connection failed"

**Fix:**
```bash
# In backend .env, add:
DISABLE_WORKERS=true

# Then restart
```

### Error: "Cannot connect to backend"

**Check:**
1. Backend terminal is running
2. No error messages in backend
3. `http://localhost:8080/api/health` works

---

## 📊 **After Both Running**

You should have:

- ✅ Backend running on `http://localhost:8080`
- ✅ Frontend running on `http://localhost:5173`  
- ✅ No errors in either terminal
- ✅ Health check returns `{"status":"ok"}`
- ✅ Can log in to app
- ✅ Can upload documents
- ✅ Can generate podcasts

---

## 🎬 **Complete Workflow**

```
1. Start Backend   → npm run dev in backend-firestore
2. Start Frontend  → npm run dev in frontend
3. Upload Chapter  → PDF/document in app
4. Generate Podcast → Select chapter, click generate
5. Wait (~2-4 min) → Watch status progress
6. Play Audio      → Click play when READY
```

---

## 📞 **Need Help?**

If still having issues:

1. **Share backend terminal output** (first 50 lines after start)
2. **Share browser console errors** (F12 → Console tab)
3. **Share network errors** (F12 → Network tab → filter XHR)

---

## 🔄 **Restart Instructions**

If something breaks:

### Restart Backend:
```bash
# In backend terminal: Press Ctrl+C
# Then:
npm run dev
```

### Restart Frontend:
```bash
# In frontend terminal: Press Ctrl+C
# Then:
npm run dev
```

### Restart Both:
```bash
# Close both terminals
# Open new terminals
# Follow "Quick Start" above
```

---

**Current Issue:** Backend not running  
**Fix:** Run the commands in Terminal 1 above  
**Time:** 2 minutes to start both servers  

**👉 START HERE:** Open Terminal 1 and run backend!
