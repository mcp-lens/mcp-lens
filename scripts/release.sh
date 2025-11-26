#!/bin/bash
set -e

# Release script for mcp-lens
# Usage: ./scripts/release.sh [patch|minor|major]

RELEASE_TYPE=${1:-patch}

if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Release type must be patch, minor, or major"
  exit 1
fi

echo "📦 Creating $RELEASE_TYPE release..."

# Bump version
npm version $RELEASE_TYPE --no-git-tag-version

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "✅ Bumped version to $NEW_VERSION"

# Create branch
BRANCH_NAME="release/v$NEW_VERSION"
git checkout -b "$BRANCH_NAME"

# Commit
git add package.json
git commit -m "chore: release v$NEW_VERSION"

# Push
git push origin "$BRANCH_NAME"

echo ""
echo "✅ Created branch: $BRANCH_NAME"
echo ""
echo "Next steps:"
echo "1. Create PR: https://github.com/mcp-lens/mcp-lens/compare/$BRANCH_NAME"
echo "2. After PR is merged, run: git tag v$NEW_VERSION && git push origin v$NEW_VERSION"
echo "3. The tag push will automatically publish to VS Code Marketplace"
