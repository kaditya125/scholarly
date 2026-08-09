# Deploy Firestore Rules via Firebase Console

## Quick Deployment Steps

Since the Firebase CLI requires interactive authentication, the easiest way to deploy the rules is through the Firebase Console web interface.

### Step 1: Open Firebase Console
1. Go to: https://console.firebase.google.com/project/schaolarly/firestore/rules
2. Log in with your Firebase account (the one with access to the `schaolarly` project)

### Step 2: Copy the Rules
The complete rules file is located at: `backend-firestore/firestore.rules`

**OR** copy from the code block below (same content):

```
rules_version = '2';

// ============================================================================
// Scholarly AI — Firestore Security Rules (least privilege)
//
// IMPORTANT: The backend uses the Firebase Admin SDK, which BYPASSES these rules.
// These rules exist to protect against ANY direct client (Web SDK) access:
// the safe default is "deny", with narrow owner-scoped allowances for the
// collections whose ownership fields are known from the data model.
// ============================================================================

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }
    function hasAdminRole() {
      return isSignedIn() && request.auth.token.role in
        ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer'];
    }

    // ---- Users: a user may read/write only their own profile document ----
    match /users/{userId} {
      allow read, write: if isSelf(userId);

      match /notifications/{notificationId} {
        allow read, update: if isSelf(userId);
        allow create, delete: if false;
      }
      
      match /notification_preferences/{docId} {
        allow read, write: if isSelf(userId);
      }
    }

    // ---- Gamification stats: owner (or admin) read; writes only via backend ----
    match /user_stats/{userId} {
      allow read: if isSelf(userId) || hasAdminRole();
      allow write: if false;
    }

    // ---- Notebooks + subcollections: owner / editor / viewer scoped ----
    match /notebooks/{notebookId} {
      function nb() { return resource.data; }
      function isNbOwner() {
        return isSignedIn() && (nb().owner == request.auth.uid || nb().userId == request.auth.uid);
      }
      function isCurriculumNb() {
        return isSignedIn() && notebookId.matches('^ncert-.*') && (nb().owner == 'ncert-curriculum' || nb().userId == 'ncert-curriculum');
      }
      function canRead() {
        return isSignedIn() && (
          isCurriculumNb() ||
          isNbOwner() ||
          request.auth.uid in nb().get('editors', []) ||
          request.auth.uid in nb().get('viewers', [])
        );
      }
      function canWrite() {
        return isSignedIn() && (isNbOwner() || request.auth.uid in nb().get('editors', []));
      }

      allow read: if canRead();
      allow create: if isSignedIn() && request.resource.data.owner == request.auth.uid;
      allow update: if canWrite();
      allow delete: if isNbOwner();

      // Subcollections (sources, timeline, assets, kg_nodes, kg_edges, documents):
      // read follows notebook membership; writes go through the backend Admin SDK.
      match /{sub=**} {
        function parent() {
          return get(/databases/$(database)/documents/notebooks/$(notebookId)).data;
        }
        function isCurriculumParent() {
          return notebookId.matches('^ncert-.*') && (parent().owner == 'ncert-curriculum' || parent().userId == 'ncert-curriculum');
        }
        allow read: if isSignedIn() && (
          isCurriculumParent() ||
          parent().owner == request.auth.uid ||
          parent().userId == request.auth.uid ||
          request.auth.uid in parent().get('editors', []) ||
          request.auth.uid in parent().get('viewers', [])
        );
        allow write: if false;
      }
    }

    // ---- Chat sessions: owner-only; messages inherit ownership ----
    match /chat_sessions/{sessionId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;

      match /messages/{messageId} {
        allow read: if isSignedIn() &&
          get(/databases/$(database)/documents/chat_sessions/$(sessionId)).data.userId == request.auth.uid;
        allow write: if false;
      }
    }

    // ---- Reference / community read-only data: signed-in read, backend write ----
    match /questions/{doc}        { allow read: if isSignedIn(); allow write: if false; }
    match /rooms/{doc}            { allow read: if isSignedIn(); allow write: if false; }
    match /discussions/{doc}      { allow read: if isSignedIn(); allow write: if false; }
    match /published_assets/{doc} { allow read: if isSignedIn(); allow write: if false; }
    match /leaderboard/{doc}      { allow read: if isSignedIn(); allow write: if false; }
    match /study_groups/{doc}     { allow read: if isSignedIn(); allow write: if false; }

    // ---- Podcasts: owner read-only (backend writes) ----
    match /podcasts/{podcastId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;
      
      match /{sub=**} {
        allow read: if isSignedIn() && get(/databases/$(database)/documents/podcasts/$(podcastId)).data.userId == request.auth.uid;
        allow write: if false;
      }
    }

    match /podcast_jobs/{jobId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;
    }

    // ---- Admin / config / telemetry: no direct client access (backend only) ----
    match /feature_flags/{doc}      { allow read, write: if false; }
    match /prompt_experiments/{doc} { allow read, write: if false; }
    match /system_config/{doc}      { allow read, write: if false; }
    match /feedback/{doc}           { allow read, write: if false; }

    // ========================================================================
    // Collaboration platform (connections / DMs / study groups / channels).
    //
    // The backend (Admin SDK) owns ALL writes. These rules grant realtime READ
    // access (onSnapshot) strictly scoped to conversation participants / group
    // members, so clients can listen for changes and refetch enriched data
    // through the backend. Message content is fetched via the API; clients only
    // need to observe the metadata docs to know when something changed.
    // ========================================================================

    // Presence: any signed-in user may read online status; a user writes only their own doc.
    match /presence/{uid} {
      allow read: if isSignedIn();
      allow write: if isSelf(uid);
    }

    // Direct messages: only the two participants may read the conversation + messages.
    match /dmConversations/{convId} {
      function participants() {
        return get(/databases/$(database)/documents/dmConversations/$(convId)).data.users;
      }

      allow read: if isSignedIn() && request.auth.uid in resource.data.users;
      allow write: if false;

      match /messages/{messageId} {
        allow read: if isSignedIn() && request.auth.uid in participants();
        allow write: if false;
      }

      // Typing indicators: participants read; a user writes only their own typing doc.
      match /typing/{typerId} {
        allow read: if isSignedIn() && request.auth.uid in participants();
        allow write: if isSelf(typerId) && request.auth.uid in participants();
      }
    }

    // Study groups: only members may read the group, its channels/messages, and read-state.
    match /studyGroups/{groupId} {
      function isGroupMember() {
        return isSignedIn() &&
          request.auth.uid in
            get(/databases/$(database)/documents/studyGroups/$(groupId)).data.memberIds;
      }

      allow read: if isSignedIn() && request.auth.uid in resource.data.memberIds;
      allow write: if false;

      match /channels/{channelId} {
        allow read: if isGroupMember();
        allow write: if false;

        match /messages/{messageId} {
          allow read: if isGroupMember();
          allow write: if false;
        }

        // Typing indicators: members read; a user writes only their own typing doc.
        match /typing/{typerId} {
          allow read: if isGroupMember();
          allow write: if isSelf(typerId) && isGroupMember();
        }
      }

      match /reads/{uid} {
        allow read: if isSelf(uid);
        allow write: if false;
      }
    }

    // ---- Default deny for anything not explicitly matched above ----
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 3: Paste and Publish
1. In the Firebase Console rules editor, **select all existing text** (Ctrl+A) and **delete it**
2. **Paste the new rules** from above
3. Click the **"Publish"** button in the top-right corner
4. Confirm the deployment

### Step 4: Verify Deployment
After publishing, you should see a success message. The new rules are now live!

### Step 5: Test the Fix
1. **Restart your backend server** (if running):
   ```bash
   # Press Ctrl+C in the terminal running the backend
   cd backend-firestore
   npm run dev
   ```

2. **Hard refresh your frontend** (Ctrl+Shift+R in Chrome/Edge, Cmd+Shift+R on Mac)

3. **Open an NCERT chapter**:
   - Navigate to any NCERT curriculum book
   - Click on a chapter (e.g., "Plant Kingdom")
   - The chapter should now load without getting stuck on "Uploading chapter"

## What Changed in the Rules?

The key additions are two new helper functions:

### `isCurriculumNb()` - Identifies NCERT notebooks
```javascript
function isCurriculumNb() {
  return isSignedIn() && 
         notebookId.matches('^ncert-.*') && 
         (nb().owner == 'ncert-curriculum' || nb().userId == 'ncert-curriculum');
}
```

### `isCurriculumParent()` - Identifies NCERT subcollections
```javascript
function isCurriculumParent() {
  return notebookId.matches('^ncert-.*') && 
         (parent().owner == 'ncert-curriculum' || parent().userId == 'ncert-curriculum');
}
```

These functions are used in the `canRead()` function and subcollection rules to grant read access to NCERT curriculum content for all signed-in users.

## Troubleshooting

### "Access Denied" in Firebase Console
- Ensure you're logged in with an account that has Editor or Owner permissions for the `schaolarly` project
- Check Firebase Console → Settings → Users and permissions

### Rules Don't Apply After Publishing
- Wait 30-60 seconds for the rules to propagate globally
- Hard refresh your browser (clear cache)
- Check the browser DevTools → Console for any Firestore errors

### Chapter Still Stuck After Deployment
- Verify the rules were actually deployed (check the Firebase Console rules editor - it should show your changes)
- Ensure your frontend is using the correct Firebase project ID
- Check that the backend server was restarted to pick up the new code

## Alternative: Firebase CLI Deployment

If you prefer using the command line:

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Authenticate
firebase login

# Deploy rules only
cd backend-firestore
firebase deploy --only firestore:rules
```

This requires interactive browser authentication.

---

**Need Help?** 
- Firebase Console: https://console.firebase.google.com/project/schaolarly
- Documentation: See `NCERT_CHAPTER_LOADING_FIX.md` for complete technical details
