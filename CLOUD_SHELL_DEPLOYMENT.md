# Deploy Firestore Rules from Google Cloud Shell

## You're in the right place! Just need to use the correct commands.

### Step 1: Create the rules file

Run this command in Cloud Shell to create the firestore.rules file:

```bash
cat > firestore.rules << 'EOF'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }
    function hasAdminRole() {
      return isSignedIn() && request.auth.token.role in
        ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer'];
    }

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

    match /user_stats/{userId} {
      allow read: if isSelf(userId) || hasAdminRole();
      allow write: if false;
    }

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

    match /chat_sessions/{sessionId} {
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;

      match /messages/{messageId} {
        allow read: if isSignedIn() &&
          get(/databases/$(database)/documents/chat_sessions/$(sessionId)).data.userId == request.auth.uid;
        allow write: if false;
      }
    }

    match /questions/{doc}        { allow read: if isSignedIn(); allow write: if false; }
    match /rooms/{doc}            { allow read: if isSignedIn(); allow write: if false; }
    match /discussions/{doc}      { allow read: if isSignedIn(); allow write: if false; }
    match /published_assets/{doc} { allow read: if isSignedIn(); allow write: if false; }
    match /leaderboard/{doc}      { allow read: if isSignedIn(); allow write: if false; }
    match /study_groups/{doc}     { allow read: if isSignedIn(); allow write: if false; }

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

    match /feature_flags/{doc}      { allow read, write: if false; }
    match /prompt_experiments/{doc} { allow read, write: if false; }
    match /system_config/{doc}      { allow read, write: if false; }
    match /feedback/{doc}           { allow read, write: if false; }

    match /presence/{uid} {
      allow read: if isSignedIn();
      allow write: if isSelf(uid);
    }

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

      match /typing/{typerId} {
        allow read: if isSignedIn() && request.auth.uid in participants();
        allow write: if isSelf(typerId) && request.auth.uid in participants();
      }
    }

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

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
EOF
```

### Step 2: Deploy the rules

```bash
gcloud firestore rules deploy firestore.rules
```

### Step 3: Verify deployment

```bash
gcloud firestore rules describe
```

That's it! The NCERT chapter loading issue should be fixed.
