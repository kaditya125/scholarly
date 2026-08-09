#!/bin/bash
# Firestore Rules Deployment Script for NCERT Chapter Loading Fix
# This script deploys the updated firestore.rules to fix PERMISSION_DENIED errors

echo "================================"
echo "Deploying Firestore Rules"
echo "================================"
echo ""
echo "This will fix the NCERT chapter loading issue by deploying"
echo "updated security rules that allow read access to curriculum books."
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Check if authenticated
echo "Checking Firebase authentication..."
firebase projects:list &> /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not authenticated. Please run: firebase login"
    exit 1
fi

echo "✅ Authenticated"
echo ""
echo "Deploying firestore.rules..."
firebase deploy --only firestore:rules

if [ $? -eq 0 ]; then
    echo ""
    echo "================================"
    echo "✅ Deployment Successful!"
    echo "================================"
    echo ""
    echo "The Firestore rules have been updated. NCERT chapters should now"
    echo "load without PERMISSION_DENIED errors."
    echo ""
    echo "Next steps:"
    echo "1. Restart the backend server (Ctrl+C then 'npm run dev')"
    echo "2. Hard refresh the frontend in your browser (Ctrl+Shift+R)"
    echo "3. Try loading an NCERT chapter again"
else
    echo ""
    echo "================================"
    echo "❌ Deployment Failed"
    echo "================================"
    echo ""
    echo "Please check the error message above and ensure you have"
    echo "deployment permissions for the Firebase project."
fi
