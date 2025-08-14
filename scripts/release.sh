#!/bin/bash

# LiveTS Release Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 LiveTS Release Script${NC}"

# Check if we're on main branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo -e "${RED}❌ Error: Must be on main branch to release. Current branch: $BRANCH${NC}"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Error: Working directory is not clean. Please commit all changes.${NC}"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}📦 Current version: $CURRENT_VERSION${NC}"

# Ask for new version
echo -e "${YELLOW}Enter new version (or press Enter to keep current):${NC}"
read NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    NEW_VERSION=$CURRENT_VERSION
    echo -e "${YELLOW}Using current version: $NEW_VERSION${NC}"
fi

# Update version in all package.json files
echo -e "${GREEN}📝 Updating version to $NEW_VERSION...${NC}"
npm version $NEW_VERSION --no-git-tag-version
npm version $NEW_VERSION --no-git-tag-version --workspaces

# Build everything
echo -e "${GREEN}🔨 Building all packages...${NC}"
npm run clean
npm install
npm run build

# Run tests
echo -e "${GREEN}🧪 Running tests...${NC}"
npm test

# Run linting
echo -e "${GREEN}🔍 Running linting...${NC}"
npm run lint

echo -e "${GREEN}✅ All checks passed!${NC}"

# Create git tag and commit
echo -e "${GREEN}📝 Creating git commit and tag...${NC}"
git add .
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo -e "${GREEN}🎉 Release v$NEW_VERSION is ready!${NC}"
echo ""
echo -e "${YELLOW}To publish:${NC}"
echo -e "  git push origin main"
echo -e "  git push origin v$NEW_VERSION"
echo ""
echo -e "${YELLOW}GitHub Actions will automatically:${NC}"
echo -e "  ✅ Build for all platforms"
echo -e "  ✅ Publish to npm"
echo -e "  ✅ Create GitHub release"