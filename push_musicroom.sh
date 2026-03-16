#!/bin/bash

# ------------------------------------------
# Auto Git Add, Commit & Push Script
# For Music Room Project
# Path: C:/Users/SURYA/Documents/Music Room
# Repo: https://github.com/vsurya2011/Music-Room.git
# ------------------------------------------

# Navigate to your project folder
cd "/c/Users/SURYA/Documents/1. Music Room" || { echo "❌ Project path not found!"; exit 1; }

# Remove leftover Git lock file if any
if [ -f ".git/index.lock" ]; then
    echo "⚠️ Removing leftover Git lock file..."
    rm -f .git/index.lock
fi

# Default commit message (or use user-provided one)
COMMIT_MSG=${1:-"🎵 Update Music Room project files"}

# Add all changes (new, modified, deleted)
echo "📦 Adding all files..."
git add -A

# Commit changes
echo "📝 Committing changes..."
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "⚠️ No new changes to commit."

# 1. Sync with GitHub first to avoid "rejected" errors
echo "🔄 Pulling latest changes from GitHub..."
git pull origin main --rebase

# 2. Now try to push
echo "🚀 Pushing changes to GitHub..."
git push origin main
# Done
echo "✅ All files pushed to GitHub successfully!"
echo "🌐 Render will automatically detect and redeploy your Music Room app."
