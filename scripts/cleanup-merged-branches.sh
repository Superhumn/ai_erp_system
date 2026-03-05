#!/usr/bin/env bash

# Script to clean up merged branches
# This helps clean up branches that were merged before the automatic deletion workflow was in place

set -e

echo "🧹 Branch Cleanup Script"
echo "======================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_green() {
    echo -e "${GREEN}$1${NC}"
}

print_yellow() {
    echo -e "${YELLOW}$1${NC}"
}

print_red() {
    echo -e "${RED}$1${NC}"
}

# Ensure we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_red "Error: Not in a git repository"
    exit 1
fi

# Fetch latest changes
print_yellow "Fetching latest changes from remote..."
git fetch --prune

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
print_yellow "Current branch: $CURRENT_BRANCH"
echo ""

# Default base branch is main
BASE_BRANCH=${1:-main}

# Check if base branch exists
if ! git show-ref --verify --quiet refs/heads/$BASE_BRANCH; then
    print_red "Error: Base branch '$BASE_BRANCH' does not exist"
    exit 1
fi

print_yellow "Finding branches merged into $BASE_BRANCH..."
echo ""

# Find local merged branches (excluding current, main, and develop)
MERGED_BRANCHES=$(git branch --merged $BASE_BRANCH | grep -v "^\*" | grep -v "$BASE_BRANCH" | grep -v "develop" || true)

if [ -z "$MERGED_BRANCHES" ]; then
    print_green "✓ No local merged branches to delete"
else
    echo "The following local branches have been merged into $BASE_BRANCH:"
    echo "$MERGED_BRANCHES"
    echo ""
    
    read -p "Delete these local branches? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "$MERGED_BRANCHES" | while read branch; do
            branch=$(echo "$branch" | xargs) # trim whitespace
            if [ -n "$branch" ]; then
                git branch -d "$branch"
                print_green "✓ Deleted local branch: $branch"
            fi
        done
    else
        print_yellow "Skipped local branch deletion"
    fi
fi

echo ""
print_yellow "Checking remote merged branches..."
echo ""

# Find remote merged branches
REMOTE_MERGED=$(git branch -r --merged $BASE_BRANCH | grep -v "HEAD" | grep -v "$BASE_BRANCH" | grep "origin/" || true)

if [ -z "$REMOTE_MERGED" ]; then
    print_green "✓ No remote merged branches to delete"
else
    echo "The following remote branches have been merged into $BASE_BRANCH:"
    echo "$REMOTE_MERGED"
    echo ""
    
    print_yellow "Note: This will permanently delete these branches from the remote repository!"
    read -p "Delete these remote branches? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "$REMOTE_MERGED" | while read remote_branch; do
            remote_branch=$(echo "$remote_branch" | xargs) # trim whitespace
            if [ -n "$remote_branch" ]; then
                # Extract branch name (remove origin/ prefix)
                branch_name=${remote_branch#origin/}
                git push origin --delete "$branch_name"
                print_green "✓ Deleted remote branch: $branch_name"
            fi
        done
    else
        print_yellow "Skipped remote branch deletion"
    fi
fi

echo ""
print_green "✓ Branch cleanup complete!"
echo ""
echo "Future branches will be automatically deleted after merging thanks to the"
echo "GitHub Actions workflow in .github/workflows/delete-merged-branches.yml"
