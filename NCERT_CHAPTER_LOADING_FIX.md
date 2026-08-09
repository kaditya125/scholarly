# NCERT Chapter Loading Fix - Complete Guide

## Problem Summary

NCERT curriculum chapters (e.g., "Plant Kingdom") get stuck on **"Uploading chapter"** status indefinitely in the ChapterReader UI, preventing users from accessing the content.

## Root Causes

### 1. **Primary Cause: Firestore Security Rules (PERMISSION_DENIED)**

The frontend `ChapterReader` component subscribes to Firestore documents at `notebooks/{notebookId}/sources/{sourceId}` using `onSnapshot()`.

**Issue**: NCERT curriculum books are owned by the synthetic admin account `ncert-curriculum`, but the Firestore security rules were configured to only allow users to read their own notebooks.

**Result**: The client's `onSnapshot` request gets rejected with `PERMISSION_DENIED`, the error callback sets `sourceStatus` to `'FAILED'`, and the UI shows the preparation screen with "Force Retry" button.

### 2. **Secondary Cause: Backend Pipeline Fragility**

The `asyncGenerateAssets` function in `source.service.ts` had no top-level try/catch, causing unhandled promise rejections to leave the status permanently stuck at intermediate states like `'EXTRACTING_PDF'`.

## Fixes Already Implemented

### ✅ 1. Firestore Security Rules Updated (`backend-firestore/firestore.rules`)

Added `isCurriculumNb()` and `isCurriculumParent()` helper functions to whitelist read-only access to NCERT curriculum notebooks:

```javascript
function isCurriculumNb() {
  return isSignedIn() && notebookId.matches('^ncert-.*') && 
         (nb().owner == 'ncert-curriculum' || nb().userId == 'ncert-curriculum');
}

function isCurriculumParent() {
  return notebookId.matches('^ncert-.*') && 
         (parent().owner == 'ncert-curriculum' || parent().userId == 'ncert-curriculum');
}
```

These rules now allow any signed-in user to read NCERT curriculum notebooks and their subcollections (sources, assets, etc.).

### ✅ 2. Backend Pipeline Fortified (`source.service.ts`)

The `asyncGenerateAssets` function now has:
- Robust try/catch wrapper that cleanly handles pipeline failures
- Proper error status updates: `safeTerminalWrite(notebookId, sourceId, 'FAILED', { ... })`
- Protection against `READY_DEGRADED` state being accidentally overwritten

### ✅ 3. Frontend Error Handling (`ChapterReader.tsx`)

The `onSnapshot` subscription includes an error callback that:
- Logs the permission error
- Sets `sourceStatus` to `'FAILED'`
- Triggers the PreparingChapter component to show the "Force Retry" button

### ✅ 4. PreparingChapter Component (`PreparingChapter.tsx`)

Already has comprehensive status display including:
- Visual indication of which step failed (not just "everything is red")
- "Force Retry" button that calls the `/generate` endpoint
- Proper handling of `FAILED`, `READY`, `READY_DEGRADED` states

## What Still Needs to Be Done

### 🚨 **CRITICAL: Deploy Firestore Rules**

The updated `firestore.rules` file exists locally but hasn't been deployed to the live Firebase project. The frontend connects directly to Firebase, so the old rules are still being enforced.

**Deployment Command**:
```bash
cd backend-firestore
firebase deploy --only firestore:rules
```

**Prerequisites**:
- Firebase CLI must be installed: `npm install -g firebase-tools`
- Must be authenticated: `firebase login`
- Must have deployment permissions for the `schaolarly` Firebase project

### ⚠️ **RECOMMENDED: Restart Backend Server**

The updated `source.service.ts` code needs to be loaded into the running Node.js process.

**Steps**:
1. Stop the current backend process (Ctrl+C in the terminal running `npm run dev`)
2. Restart: `cd backend-firestore && npm run dev`

## Verification Steps

After deploying the Firestore rules and restarting the backend:

1. **Open an NCERT Chapter**:
   - Navigate to any NCERT curriculum book
   - Click on a chapter (e.g., "Plant Kingdom")

2. **Expected Behavior**:
   - The `onSnapshot` listener should successfully connect
   - `sourceStatus` should update from `''` → `'QUEUED'` (or current status)
   - If the chapter is already `READY`, the documentary article should load immediately
   - If the chapter is `QUEUED` or `FAILED`, the Force Retry should trigger generation

3. **Verify Firestore Access**:
   - Open browser DevTools → Console
   - Should see no `PERMISSION_DENIED` errors
   - Should see the snapshot callback receiving data

## Technical Details

### Firestore Rules Logic

The rules use the `notebookId.matches('^ncert-.*')` pattern to identify NCERT books and verify ownership by `ncert-curriculum`:

```javascript
// In notebooks collection:
allow read: if canRead();

function canRead() {
  return isSignedIn() && (
    isCurriculumNb() ||  // ← New: allows NCERT books
    isNbOwner() ||
    request.auth.uid in nb().get('editors', []) ||
    request.auth.uid in nb().get('viewers', [])
  );
}

// In subcollections (sources, assets, etc.):
match /{sub=**} {
  allow read: if isSignedIn() && (
    isCurriculumParent() ||  // ← New: allows NCERT subcollections
    parent().owner == request.auth.uid ||
    ...
  );
}
```

### Backend Error Handling

The `asyncGenerateAssets` function now properly catches and reports errors:

```typescript
try {
  // ... extraction and generation logic ...
  await this.safeTerminalWrite(notebookId, sourceId, hasDegraded ? 'READY_DEGRADED' : 'READY');
} catch (err: any) {
  console.error(`[Worker] asyncGenerateAssets completely failed for ${sourceId}:`, err);
  await this.safeTerminalWrite(notebookId, sourceId, 'FAILED', {
    failedAt: Date.now(),
    failureReason: 'PIPELINE_ERROR',
    errorDetails: err?.message || String(err)
  });
}
```

## Troubleshooting

### Issue: "Firebase login required"
```bash
# Solution:
firebase login
```

### Issue: "Permission denied to deploy rules"
- Verify you have the `Editor` or `Owner` role in the Firebase project
- Check the Firebase Console → Settings → Users and permissions

### Issue: "Backend still using old code"
- Kill all Node.js processes: `taskkill /F /IM node.exe` (Windows) or `pkill node` (Mac/Linux)
- Restart the backend: `npm run dev`

### Issue: "Chapter still stuck after deployment"
- Hard refresh the frontend (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache and reload
- Check browser DevTools → Network tab for Firestore WebSocket connections

## Current Status

- ✅ **Code fixes**: All implemented and committed
- ⏳ **Firestore rules deployment**: Pending (requires authenticated Firebase CLI)
- ⏳ **Backend restart**: Pending (backend may still be running old code)

Once the Firestore rules are deployed, NCERT chapters should load immediately without getting stuck.

## Related Files

- `backend-firestore/firestore.rules` - Updated security rules
- `backend-firestore/src/services/source.service.ts` - Fortified pipeline with error handling
- `frontend/src/components/reader/ChapterReader.tsx` - Error handling for permission denied
- `frontend/src/components/reader/PreparingChapter.tsx` - UI for generation status

---

**Last Updated**: 2026-07-25  
**Status**: Awaiting Firestore rules deployment
