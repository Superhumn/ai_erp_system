# Deployment Setup Guide

This guide walks through configuring the CI/CD pipeline for the AI ERP System.

## Workflows Overview

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **CI** | `.github/workflows/ci.yml` | PRs to `main`, pushes to `main` | Type-check, test, and build |
| **Deploy to Staging** | `.github/workflows/deploy-staging.yml` | Push to `main` | Run CI, migrate, deploy staging |
| **Deploy to Production** | `.github/workflows/deploy-production.yml` | Manual dispatch (type `deploy` to confirm) | Migrate and deploy production |
| **Deploy to Production (gated)** | `.github/workflows/deploy-production-auto.yml` | After each successful *Deploy to Staging* run on `main` | Promote the exact staging commit to production once a required reviewer approves; refuses to run until the staging tier exists (see `DEPLOYMENT.md` → "Staging tier") |
| **Delete Branches** | `.github/workflows/delete-merged-branches.yml` | PR closed (merged) | Clean up merged branches |

## CI Pipeline

Runs automatically on every PR and push to `main`:

```
typecheck ──┐
            ├──→ build
test ───────┘
```

- **Type Check** and **Test** run in parallel
- **Build** only runs if both pass
- Duplicate runs are cancelled via concurrency groups

## Deploy Pipeline

On every push to `main`:

```
CI ──→ Deploy Staging ──→ Deploy Production (gated)
```

- **Deploy to Staging** calls the CI workflow first (reusable workflow), then migrates and deploys
  the staging service automatically.
- **Deploy to Production (gated)** starts after each successful staging deploy and pauses on the
  `production` environment's **Required reviewers** approval. On approval it promotes the exact
  commit staging deployed. Until the staging tier exists (second Railway service +
  `STAGING_SERVICE_ID` repository variable — see `DEPLOYMENT.md` → "Staging tier"), its guard
  refuses to deploy before any migrations run.
- **Deploy to Production** (manual dispatch) remains available for ad-hoc production deploys; it
  shares a concurrency group with the gated workflow so the two can never race.

## GitHub Environment Setup

You must configure two environments in the GitHub repository settings.

### 1. Create Environments

Go to **Settings → Environments** in your GitHub repository and create:

#### `staging`
- No protection rules needed (auto-deploys after CI)
- Add the following secrets and variables:
  - **Secret:** `RAILWAY_TOKEN` — Railway deploy token for the staging project
  - **Variable:** `RAILWAY_SERVICE_ID` — Railway service ID for the staging service

#### `production`
- **Required reviewers:** Add at least one team member who must approve production deploys
- **Branch restrictions:** Limit to `main` branch only
- **Wait timer:** (Optional) Add a 5-minute wait to allow for last-minute cancellation
- Add the following secrets and variables:
  - **Secret:** `RAILWAY_TOKEN` — Railway deploy token for the production project
  - **Variable:** `RAILWAY_SERVICE_ID` — Railway service ID for the production service

### 2. Get Railway Tokens

For each Railway project/environment:

1. Go to your Railway project dashboard
2. Navigate to **Settings → Tokens**
3. Create a new **Deploy Token** (scoped to that project)
4. Copy the token and add it as the `RAILWAY_TOKEN` secret in the corresponding GitHub environment

### 3. Get Railway Service IDs

1. Go to your Railway project dashboard
2. Click on the service
3. The service ID is in the URL: `railway.app/project/.../service/<SERVICE_ID>`
4. Add it as the `RAILWAY_SERVICE_ID` variable in the corresponding GitHub environment

## Manual Deployment

To trigger a production deployment manually (e.g., for a hotfix):

1. Go to **Actions → Deploy to Production** in your GitHub repository
2. Click **Run workflow**
3. Type `deploy` in the confirmation input and run it
4. The workflow type-checks, builds, migrates the production DB, and deploys the production service
   (pausing first on any protection rules configured for the `production` environment)

## Local Development

```bash
pnpm install          # Install dependencies
pnpm run dev          # Start dev server
pnpm run check        # Type check
pnpm run test         # Run tests
pnpm run build        # Build for production
pnpm run format       # Format code with Prettier
```
