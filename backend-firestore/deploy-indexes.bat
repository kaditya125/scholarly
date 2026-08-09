@echo off
REM Deploy Firestore indexes to production
REM Requires Firebase CLI to be installed and authenticated

echo Deploying Firestore indexes...
firebase deploy --only firestore:indexes --project schaolarly-65fa0

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Indexes deployed successfully!
    echo.
    echo Note: Index creation can take several minutes to complete.
    echo Check the Firebase Console to monitor index build progress:
    echo https://console.firebase.google.com/project/schaolarly-65fa0/firestore/indexes
) else (
    echo.
    echo ❌ Index deployment failed!
    echo.
    echo Common issues:
    echo 1. Firebase CLI not installed: npm install -g firebase-tools
    echo 2. Not authenticated: firebase login
    echo 3. Project not selected: firebase use schaolarly-65fa0
)

pause
