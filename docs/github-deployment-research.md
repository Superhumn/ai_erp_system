# GitHub Deployment Research

> Research compiled March 2, 2026 — evaluating GitHub's deployment capabilities for the AI ERP System.

## Summary

GitHub provides a comprehensive deployment ecosystem. For a full-stack application like this AI ERP system (React 19 + Express + MySQL + tRPC), the most relevant options are **GitHub Actions** for CI/CD, **GitHub Environments** for staged rollouts, and **GitHub Container Registry (GHCR)** for image hosting.

---

## 1. GitHub Actions (CI/CD)

GitHub Actions is the primary CI/CD platform built into GitHub. Workflows are defined as YAML files in `.github/workflows/` and triggered by events (push, PR, manual dispatch, schedule, etc.).

**Key capabilities:**
- **Reusable workflows** (`workflow_call`) — share pipeline templates across repos, reducing duplication by up to 70%
- **Matrix builds** — test across multiple OS/Node versions simultaneously
- **Concurrency controls** — prevent conflicting deployments with `concurrency` groups
- **Manual triggers** (`workflow_dispatch`) — controlled production deploys with input parameters
- **Self-hosted runners** — run on your own infrastructure for custom environments
- **GitHub-hosted runners** — managed VMs including ARM64, GPU, macOS 15, Windows 2025

**Scale (2026):** GitHub Actions now powers 71 million jobs per day. 62% of developers use it for personal projects, 41% in organizations.

**Upcoming:** Parallel steps support expected mid-2026; timezone support for scheduled jobs in Q1 2026.

### Example: Deploy to Railway

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run check
      - run: pnpm run test
      - run: pnpm run build

  deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/github-action@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 2. GitHub Environments & Deployment Protection Rules

Environments are a first-class concept for controlling deployment targets (e.g., `staging`, `production`).

**Built-in protection rules:**
- **Required reviewers** — human approval before production deploys (self-review prevention available)
- **Wait timers** — delay deployments by 1 to 43,200 minutes (up to 30 days)
- **Branch/tag restrictions** — limit which branches can deploy to an environment
- **Admin bypass control** — can be disabled to enforce rules universally

**Environment-scoped secrets and variables:**
Each environment can have its own secrets (e.g., different `DATABASE_URL` for staging vs production), only available to jobs referencing that environment.

**Custom deployment protection rules (public preview):**
Third-party services (Datadog, Honeycomb, Sentry, ServiceNow) can evaluate deployment readiness and approve/reject via the API. Up to 6 custom rules per environment.

**Plan availability:** Free for public repos. Private repos require GitHub Pro, Team, or Enterprise for wait timers and required reviewers.

---

## 3. GitHub Packages / Container Registry (GHCR)

GitHub's container registry (`ghcr.io`) hosts Docker and OCI images alongside your source code.

**Key features:**
- **Granular permissions** tied to GitHub identity
- **Seamless Actions integration** — use `GITHUB_TOKEN` for authentication, no separate credentials
- **Multi-registry support** — also hosts npm, Maven, NuGet, and RubyGems packages

**2025 change:** The legacy Docker registry (`docker.pkg.github.com`) was deprecated February 2025. All container hosting now uses `ghcr.io`.

**2026 development — Trusted Publishing:** npm now requires OIDC-based trusted publishing. GitHub Actions workflows request `id-token: write`, and npm verifies the workflow identity — no static tokens required.

**Pricing:** Free for public packages. Private packages get free storage/transfer based on account plan.

---

## 4. GitHub Deployments API

A REST API for programmatic deployment tracking, independent of any CI/CD tool.

**Endpoints:**
- `POST /repos/{owner}/{repo}/deployments` — create deployment records for a ref
- `POST /repos/{owner}/{repo}/deployments/{id}/statuses` — update status (`pending`, `in_progress`, `success`, `failure`, `error`, `inactive`)
- `GET /repos/{owner}/{repo}/environments` — list/manage environments

**Use cases:**
- External CI/CD systems reporting status back to GitHub
- Custom dashboards querying deployment history
- ChatOps bots triggering deployments
- Audit and compliance tracking

---

## 5. Cloud Provider Integrations

### OIDC Authentication (Recommended)

OIDC has become the standard for authenticating GitHub Actions to cloud providers, replacing long-lived static secrets:
1. Workflow requests `id-token: write` permission
2. GitHub's OIDC provider generates a JWT
3. Cloud provider validates token and issues short-lived credentials

**Benefits:** No cloud credentials stored as GitHub secrets; tokens expire automatically; granular IAM scoping.

### Provider-Specific Actions

| Provider | Auth Action | Deploy Targets |
|----------|-------------|---------------|
| **AWS** | `aws-actions/configure-aws-credentials` | ECS, EC2, Lambda, S3, EKS, CloudFormation |
| **Azure** | `azure/login` (Workload Identity Federation) | App Service, AKS, Functions, Container Instances |
| **GCP** | `google-github-actions/auth` | Cloud Run, GKE, Cloud Functions, App Engine |
| **Railway** | `railwayapp/github-action` | Direct deploy |
| **Vercel** | Built-in Git integration | Auto-deploy on push |
| **Fly.io** | `superfly/flyctl-actions` | Fly.io machines |

### Infrastructure as Code

- **Terraform + GitHub Actions** is the most common multi-cloud pattern (plan on PR, apply on merge)
- **Pulumi**, **AWS CDK**, and **Azure Bicep** are also commonly orchestrated through Actions
- 2026 best practices emphasize modular, component-based Terraform architectures

---

## 6. GitHub Pages

GitHub Pages hosts **static sites only** from a repository.

**Features:**
- Free HTTPS/SSL with automatic certificate provisioning
- CDN-backed global delivery
- Custom domain support
- Jekyll built-in; any static site generator via Actions

**Limitations:**
- No server-side processing or databases
- 1 GB repo size limit; 100 GB/month bandwidth
- Public repos only on free tier

**Verdict for this project:** Not suitable for the ERP application (which requires a backend), but could host project documentation or a marketing site.

---

## 7. Other Relevant Features

### GitOps with ArgoCD / Flux
GitHub repos serve as the source of truth for Kubernetes manifests. ArgoCD/Flux continuously monitor for drift and auto-sync. GitHub Actions builds images and pushes manifests.

### GitHub Releases
Automatically package software with release notes and binary assets on tag push. Can trigger downstream deployments.

### Dependabot
Automatically opens PRs to update dependencies. In 2026: supports grouped updates across directories and OIDC for private registries.

### Audit Logging
Immutable logs for Actions workflow runs and configuration changes, supporting compliance requirements.

---

## Recommendation for AI ERP System

Given our stack (React 19 + Express + MySQL + tRPC) and current Railway deployment:

| Priority | Action | Benefit |
|----------|--------|---------|
| **1** | Add GitHub Actions CI workflow | Automated build, type-check, and test on every PR |
| **2** | Add GitHub Actions CD workflow | Automated deploy to Railway on merge to `main` |
| **3** | Set up GitHub Environments | Separate `staging` and `production` with protection rules |
| **4** | Containerize with Docker + GHCR | Consistent deployments, easy rollback |
| **5** | Configure OIDC for cloud auth | Eliminate static credentials from secrets |

### Current State
- One workflow exists: `delete-merged-branches.yml` (branch cleanup only)
- No CI/CD pipeline for build/test/deploy
- Railway is the recommended hosting platform (per README)
- 21+ test suites available for CI validation

---

## Sources

- [GitHub Blog: Build a CI/CD Pipeline in Four Steps](https://github.blog/enterprise-software/ci-cd/build-ci-cd-pipeline-github-actions-four-steps/)
- [GitHub Docs: Continuous Deployment](https://docs.github.com/en/actions/get-started/continuous-deployment)
- [GitHub Blog: Let's Talk About GitHub Actions](https://github.blog/news-insights/product-news/lets-talk-about-github-actions/)
- [GitHub Docs: Reusing Workflow Configurations](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations)
- [GitHub Docs: Managing Environments for Deployment](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Docs: Custom Deployment Protection Rules](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/configuring-custom-deployment-protection-rules)
- [GitHub Docs: Introduction to GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github-packages)
- [GitHub Docs: Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub Docs: OpenID Connect](https://docs.github.com/en/actions/concepts/security/openid-connect)
- [GitHub Docs: REST API for Deployments](https://docs.github.com/en/rest/deployments)
- [Shipyard: Choosing a Container Registry in 2026](https://shipyard.build/blog/container-registries/)
- [Northflank: Best CI/CD Tools for 2026](https://northflank.com/blog/best-ci-cd-tools)
