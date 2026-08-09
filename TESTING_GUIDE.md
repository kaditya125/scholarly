# Testing Guide - Article & YouTube Video Fixes

## Quick Test Checklist

### ✅ Pre-Test Setup
1. **Start Backend**:
   ```bash
   cd backend-firestore
   npm run dev
   ```
   Wait until you see: `🚀 Server running in development mode on port 8080`

2. **Deploy Firestore Indexes** (IMPORTANT!):
   ```bash
   cd backend-firestore
   firebase deploy --only firestore:indexes --project schaolarly-65fa0
   ```
   Or use the batch script:
   ```bash
   deploy-indexes.bat
   ```
   
   **Wait 5-15 minutes** for indexes to build. Check status:
   https://console.firebase.google.com/project/schaolarly-65fa0/firestore/indexes

3. **Start Frontend** (if not already running):
   ```bash
   cd frontend
   npm run dev
   ```

### 📋 Test Scenarios

#### Test 1: Correct Article for Each Chapter ✨
**Purpose**: Verify each chapter shows its own article (not another chapter's)

**Steps**:
1. Open application in browser
2. Navigate to **Biology** → **The Living World**
3. Click on the chapter
4. **Verify**:
   - Article title shows "The Living World"
   - Article content discusses living organisms, biodiversity
   - YouTube video is about living world/biology
5. Navigate to **Cell**
6. **Verify**:
   - Article title shows "Cell"
   - Article content discusses cell structure, organelles
   - YouTube video is about cells (different from Living World video!)
7. Navigate to **Physics** → **Motion in a Straight Line**
8. **Verify**:
   - Article title shows "Motion in a Straight Line"
   - Article content discusses velocity, acceleration
   - YouTube video is about motion/kinematics

**Expected Result**: ✅ Each chapter shows its own unique article and video

**Failure Case**: ❌ All chapters show the same article → Check console logs

---

#### Test 2: Backend Logs Verification 🔍
**Purpose**: Ensure backend is generating and fetching articles correctly

**Steps**:
1. Open backend terminal (where `npm run dev` is running)
2. In browser, click "Force Retry" on any chapter
3. **Watch for these logs**:
   ```
   [asyncGenerateAssets] The Living World: Extracted 15234 characters of text...
   [asyncGenerateAssets] The Living World: Generating DOCUMENTARY_ARTICLE...
   [asyncGenerateAssets] The Living World: ✓ Generated DOCUMENTARY_ARTICLE
   [YouTube] Fetching videos for: "The Living World" (subject: Science)
   [YouTube] Found 3 videos for "The Living World"
   ```

4. Navigate to the chapter
5. **Watch for these logs**:
   ```
   [bookLibrary] Searching for YouTube videos with title: "The Living World - Verified Videos"
   [bookLibrary] Found 3 YouTube videos for The Living World
   ```

**Expected Result**: ✅ Logs show correct chapter title throughout

**Failure Case**: ❌ No logs appear → Backend not starting correctly

---

#### Test 3: Frontend Console Logs 📱
**Purpose**: Verify frontend is fetching the correct article

**Steps**:
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Navigate to **The Living World** chapter
4. **Look for**:
   ```
   [chapterDocumentaryService] Fetching article for: "The Living World - Documentary Article" in notebook nb_...
   [chapterDocumentaryService] Found article for "The Living World - Documentary Article"
   ```

5. Navigate to **Cell** chapter
6. **Look for**:
   ```
   [chapterDocumentaryService] Fetching article for: "Cell - Documentary Article" in notebook nb_...
   [chapterDocumentaryService] Found article for "Cell - Documentary Article"
   ```

**Expected Result**: ✅ Each chapter fetches its own article by name

**Failure Case**: ❌ See warning "Composite index not found" → Indexes not deployed yet (client-side fallback will still work, but slower)

---

#### Test 4: Different YouTube Videos 🎥
**Purpose**: Confirm YouTube videos are chapter-specific

**Steps**:
1. Navigate to **The Living World**
2. Scroll to YouTube video section
3. **Note the video ID** (look at URL: `youtube.com/embed/VIDEO_ID`)
4. Navigate to **Cell**
5. Scroll to YouTube video section
6. **Compare video ID** - should be DIFFERENT
7. Test 3-4 more chapters from different subjects

**Expected Result**: ✅ Each chapter shows different YouTube video

**Failure Case**: ❌ All chapters show same video (pvN8A5bSLOA) → YouTube videos not generated yet. Click "Force Retry" to generate.

---

#### Test 5: Fallback Article Generation 🛡️
**Purpose**: Verify fallback works when AI generation fails

**Steps**:
1. Find a chapter that hasn't been generated yet
2. Click "Force Retry"
3. **If article generation fails**:
   - Should still show an article (fallback from summary)
   - Article quality will be lower but still readable
   - Backend logs will show: `"Creating fallback documentary article..."`

**Expected Result**: ✅ Even with failures, chapter shows some article content

**Failure Case**: ❌ Shows "Preparing..." forever → Check backend logs for errors

---

#### Test 6: Cross-Subject Testing 🧪
**Purpose**: Test chapters from multiple subjects

**Test Matrix**:
| Subject   | Chapter                     | Expected Article Topic | Expected Video Topic |
|-----------|----------------------------|----------------------|---------------------|
| Biology   | The Living World           | Biodiversity, organisms | Biology/Living World |
| Biology   | Cell                       | Cell structure, organelles | Cell biology |
| Physics   | Motion in a Straight Line  | Velocity, acceleration | Physics/Kinematics |
| Physics   | Laws of Motion             | Newton's laws, forces | Newton's laws |
| Chemistry | Structure of Atom          | Atomic structure, electrons | Atomic structure |

**Steps**:
1. Test each chapter in the table
2. Verify article title matches
3. Verify article content is relevant
4. Verify YouTube video is related

**Expected Result**: ✅ All chapters show correct content for their subject

---

## 🐛 Common Issues & Solutions

### Issue 1: "Preparing your learning experience..." stuck forever
**Causes**:
- Article not generated yet
- Article generation failed
- Firestore query timing out

**Solutions**:
1. Click "Force Retry"
2. Check backend logs for errors
3. Check browser console for Firestore errors
4. Verify backend server is running

---

### Issue 2: All chapters show the same article
**Causes**:
- Firestore composite indexes not deployed
- Query falling back to old behavior
- Cache not being invalidated

**Solutions**:
1. Deploy indexes: `firebase deploy --only firestore:indexes`
2. Clear browser cache: Ctrl+Shift+Delete
3. Restart backend server
4. Check console logs show: "Fetching article for: {correct chapter name}"

---

### Issue 3: All chapters show the same YouTube video (pvN8A5bSLOA)
**Causes**:
- YouTube videos not generated yet for chapters
- YouTube API quota exceeded
- YouTube fetch failed

**Solutions**:
1. Click "Force Retry" to generate videos
2. Check backend logs for YouTube API errors
3. Check YouTube API quota: https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas
4. If quota exceeded, wait 24 hours or increase quota

---

### Issue 4: Composite index error in console
**Message**: `"Composite index not found. Falling back to client-side filtering..."`

**Cause**: Firestore indexes not deployed or still building

**Solution**:
1. Deploy indexes: `firebase deploy --only firestore:indexes`
2. Wait 5-15 minutes for indexes to build
3. Check status: Firebase Console → Firestore → Indexes
4. **Note**: Client-side fallback still works, just slower

---

### Issue 5: Backend not starting / Port 8080 in use
**Error**: `Error: listen EADDRINUSE: address already in use :::8080`

**Solution**:
```bash
# Windows
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }

# Then restart
npm run dev
```

---

### Issue 6: Firebase authentication errors
**Error**: `Error: Could not load the default credentials`

**Solution**:
1. Check `.env` file has correct `FIREBASE_PROJECT_ID`
2. Verify service account key exists
3. Run: `firebase login`
4. Run: `firebase use schaolarly-65fa0`

---

## 📊 Success Metrics

After all fixes, you should see:

✅ **Article Accuracy**: 100% - each chapter shows its own article  
✅ **YouTube Variety**: Each chapter has unique video (not pvN8A5bSLOA)  
✅ **Load Time**: <2 seconds for article to appear  
✅ **Fallback Rate**: <10% of chapters need fallback articles  
✅ **Error Rate**: <1% of chapters fail to load  

---

## 🚀 Next Steps After Testing

1. **If all tests pass**:
   - Mark issue as resolved
   - Deploy to production
   - Monitor production logs for 24 hours

2. **If some tests fail**:
   - Check issue-specific solutions above
   - Review backend/frontend console logs
   - Check Firestore indexes status
   - Verify environment variables

3. **For production deployment**:
   - Deploy indexes: `firebase deploy --only firestore:indexes`
   - Wait for indexes to build (check Firebase Console)
   - Deploy backend: `npm run build && npm start`
   - Monitor logs: `tail -f logs/backend.log`

---

**Questions?** Check:
- `WRONG_ARTICLE_FIX.md` - Detailed technical explanation
- `ARTICLE_GENERATION_FIX.md` - Article generation details
- Backend console logs - Real-time debugging info
- Browser console logs - Frontend behavior

**Last Updated**: 2026-07-31
