#!/bin/bash

# -------------------------------
# Auto Git Add, Commit & Push
# For Music Room App
# Path: C:/Users/SURYA/Documents/musicapp
# -------------------------------

# Navigate to project folder
cd /c/Users/SURYA/Documents/musicapp || { echo "❌ Project path not found!"; exit 1; }

# Remove leftover lock file if it exists
if [ -f ".git/index.lock" ]; then
    echo "⚠️ Removing leftover Git lock file..."
    rm -f .git/index.lock
fi

# Default commit message
COMMIT_MSG=${1:-"Update all project files"}

# Add all files (new, modified, deleted)
echo "📦 Adding all files..."
git add -A

# Commit changes
echo "📝 Committing changes..."
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "No changes to commit."

# Push to GitHub main branch
echo "🚀 Pushing to GitHub..."
git push origin main

# Done
echo "✅ All files pushed to GitHub! Render will auto-deploy."
