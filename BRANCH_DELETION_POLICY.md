# Branch Deletion Policy

## Overview

This repository is now configured to automatically delete branches after they are merged to the main branch. This helps keep the repository clean and organized by removing feature branches that are no longer needed.

## How It Works

### Automatic Deletion

When a pull request is merged to the main branch, a GitHub Actions workflow automatically deletes the source branch. This workflow:

1. **Triggers on PR merge**: Only runs when a pull request is successfully merged (not just closed)
2. **Deletes the branch**: Automatically removes the merged branch from the repository
3. **Provides feedback**: Logs the deletion action in the workflow run

### Workflow Details

The automatic branch deletion is handled by the `.github/workflows/delete-merged-branches.yml` workflow file.

**Key Features:**
- ✅ Only deletes branches from merged PRs (not closed without merging)
- ✅ Uses GitHub's built-in authentication
- ✅ Provides clear logging of deletion actions
- ✅ Requires no manual intervention

## Configuration

### GitHub Repository Settings

To ensure branches are deletable after merging, you may also want to configure the following in your GitHub repository settings:

1. **Enable automatic branch deletion (recommended):**
   - Go to your repository on GitHub
   - Navigate to Settings → General
   - Scroll to the "Pull Requests" section
   - Check "Automatically delete head branches"

   This provides a UI-based option that complements the workflow.

2. **Branch Protection Rules:**
   - You can still protect important branches (like `main`) from deletion
   - The workflow only deletes feature/topic branches that have been merged

### Manual Deletion

If you need to manually delete a branch after merging:

```bash
# Delete a local branch
git branch -d branch-name

# Delete a remote branch
git push origin --delete branch-name
```

## Best Practices

1. **Create feature branches from main**: Always branch from the latest main branch
2. **Use descriptive branch names**: Use prefixes like `feature/`, `fix/`, `chore/`, etc.
3. **Merge via Pull Requests**: Always merge through PRs to trigger the automatic deletion
4. **Keep branches short-lived**: Merge frequently to avoid long-lived feature branches
5. **Clean up stale branches**: Periodically review and delete any old branches that weren't merged

## Existing Branches

If you have many existing branches that have already been merged, you can clean them up manually:

```bash
# List merged branches (excluding main)
git branch --merged main | grep -v "^\*\|main"

# Delete all local branches that have been merged to main
git branch --merged main | grep -v "^\*\|main" | xargs git branch -d

# List remote branches
git branch -r --merged main | grep -v "^\*\|main"

# To delete remote branches, you'll need to do this manually:
git push origin --delete branch-name
```

## Exceptions

Some branches may need to remain even after merging:

- **Release branches**: Long-term release branches like `v1.x`, `v2.x`
- **Environment branches**: Branches tied to specific deployments like `staging`, `production`
- **Protected branches**: Branches with special significance should be configured with branch protection rules

These can be protected from automatic deletion by:
1. Setting up branch protection rules in GitHub
2. Modifying the workflow to exclude specific branch patterns

## Troubleshooting

### Branch not deleted after merge

If a branch wasn't deleted automatically:

1. Check the Actions tab to see if the workflow ran
2. Verify the workflow has proper permissions (should have `contents: write`)
3. Ensure the PR was merged (not just closed)
4. Check for any error messages in the workflow logs

### Accidentally deleted branch

If a branch was deleted and you need to recover it:

```bash
# Find the commit SHA of the deleted branch
git reflog

# Recreate the branch from that commit
git checkout -b branch-name <commit-sha>
git push origin branch-name
```

## Related Files

- `.github/workflows/delete-merged-branches.yml` - The automated deletion workflow
- `BRANCH_CONSOLIDATION.md` - Historical branch consolidation documentation
- `ALL_BRANCHES_MERGED.md` - Previous branch merge documentation

## Summary

With this configuration, branches are now automatically deletable after merging to main. The workflow handles this automatically, keeping your repository clean and organized without manual intervention.
