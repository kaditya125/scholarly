@echo off
REM Deploy Firestore indexes to production
REM Requires Firebase CLI to be installed and authenticated
REM
REM The project is `schaolarly` - it matches FIREBASE_PROJECT_ID on the server and the
REM authDomain baked into the built frontend. It is NOT `schaolarly-65fa0`, which this
REM script pointed at until 2026-09-02 and which appears nowhere else in the repo; a
REM deploy sent there would have silently missed the live database entirely.
REM
REM
REM DATABASE: this project has TWO Firestore databases - `default` (the one the app uses,
REM 54 collections) and `(default)` (holds only platform/presence). firebase.json had no
REM `database` key until 2026-09-03, so every index deploy landed on `(default)` and the
REM live database got none. firebase.json now names `default` explicitly; do not remove it.
REM This deploy is additive only so long as firestore.indexes.json stays a superset of
REM what is live. If the CLI ever offers to DELETE indexes, say no and reconcile by hand
REM - never pass --force here.

echo Deploying Firestore indexes...
firebase deploy --only firestore:indexes --project schaolarly

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Indexes deployed successfully!
    echo.
    echo Note: Index creation can take several minutes to complete.
    echo Check the Firebase Console to monitor index build progress:
    echo https://console.firebase.google.com/project/schaolarly/firestore/indexes
) else (
    echo.
    echo ❌ Index deployment failed!
    echo.
    echo Common issues:
    echo 1. Firebase CLI not installed: npm install -g firebase-tools
    echo 2. Not authenticated: firebase login
    echo 3. Project not selected: firebase use schaolarly
)

pause
