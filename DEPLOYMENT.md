# Deployment Guide

Comprehensive guide for deploying the AI ERP System. Covers Railway + PlanetScale + Cloudflare R2 (recommended), Docker, and manual hosting.

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- pnpm 10.4.1+
- MySQL 8.0+ database
- An Anthropic API key for LLM features (`LLM_API_KEY`)

---

## Recommended: Railway + PlanetScale + Cloudflare R2

This is the fastest path to production with zero infrastructure management.

### Step 1 — PlanetScale (Database)

1. Create a free account at [planetscale.com](https://planetscale.com)
2. Create a new database (e.g. `ai-erp`) — choose the region closest to your Railway deployment
3. In the database dashboard, go to **Connect** → select **Node.js** driver
4. Copy the connection string — it looks like:
   ```
   mysql://username:password@host.aws.connect.psdb.cloud/ai-erp?ssl={"rejectUnauthorized":true}
   ```
5. Keep this handy — you'll paste it as `DATABASE_URL` in Railway

> **PlanetScale tip:** New databases start in **development** mode (no foreign keys enforced). Before going live, promote a branch to production and enable safe migrations in the PlanetScale dashboard. The app's Drizzle schema uses Vitess-compatible FK references, so both modes work.

### Step 2 — Cloudflare R2 (File Storage)

R2 is already the top-priority storage backend in the codebase — you just need to supply the credentials.

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com) → **R2 Object Storage**
2. Create a bucket (e.g. `ai-erp-files`)
3. Under **Manage R2 API Tokens**, create a token with **Object Read & Write** on your bucket
4. Note the **Account ID**, **Access Key ID**, and **Secret Access Key**
5. *(Optional)* For public file access, enable **Public access** on the bucket and note the public URL (e.g. `https://pub-xxxx.r2.dev`)

### Step 3 — Railway (App Server)

1. Create a free account at [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo** → select this repository
3. Railway auto-detects `nixpacks.toml` and uses it for the build; `railway.json` configures the health check and start command — no changes needed
4. In the Railway service, open **Variables** and add all required env vars (see table below)
5. Click **Deploy**

Railway will:
- Install dependencies with `pnpm install`
- Build with `pnpm run build`
- Start with `node dist/_core/index.js`
- Run pending Drizzle migrations automatically on first boot
- Poll `/api/health` every 60 seconds

#### Required Environment Variables

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | PlanetScale → Connect → Node.js |
| `JWT_SECRET` | Run `openssl rand -hex 32` in your terminal |
| `NODE_ENV` | Set to `production` |
| `APP_URL` | Your Railway public URL (e.g. `https://your-app.up.railway.app`) |
| `PUBLIC_URL` | Same as `APP_URL` |
| `LLM_PROVIDER` | `anthropic` |
| `LLM_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |

#### Cloudflare R2 Variables

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → Account ID |
| `R2_ACCESS_KEY_ID` | From the R2 API token you created |
| `R2_SECRET_ACCESS_KEY` | From the R2 API token you created |
| `R2_BUCKET` | Your bucket name (e.g. `ai-erp-files`) |
| `R2_PUBLIC_URL` | *(Optional)* Public bucket URL (e.g. `https://pub-xxxx.r2.dev`) |

See `.env.example` for the full list of optional integrations (email, Google OAuth, Shopify, etc.).

### Step 4 — First-Time Setup

1. Visit your Railway URL — you'll be redirected to `/login`
2. Click **Sign up**
3. Enter name, email, and password (8+ characters)
4. The first user automatically gets **admin** role
5. Invite teammates: **Settings → Team → Invite Team Member**

### CI/CD (Auto-Deploy on Push)

The included `.github/workflows/deploy-staging.yml` deploys to Railway staging automatically when you push to `main`.
Production is deliberately manual — run the **Deploy to Production** workflow and type `deploy` to confirm.
You need these per environment (GitHub → Settings → Secrets and variables → Actions):

| GitHub Secret | Value |
|---|---|
| `RAILWAY_TOKEN` | Railway dashboard → Account → API Tokens |
| `RAILWAY_SERVICE_ID` | Railway dashboard → Service → Settings → Service ID |

Create two environments in GitHub (**Settings → Environments**): `staging` and `production`, each with their own `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID`.

> **Check this.** `RAILWAY_SERVICE_ID` set only at the repository level resolves to the *same* value in both
> environments, which points a "production" deploy at the staging service. Define it as an
> environment-scoped variable under each environment, not repo-wide.

---

## Quick Start with Docker

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET, LLM_API_KEY, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD

docker compose up -d
docker compose exec app npx drizzle-kit generate
docker compose exec app npx drizzle-kit migrate
```

This starts the Node.js app on port 3000, MySQL on 3306, and nginx on 80/443. Visit `http://localhost`, click "Sign up", and the first user becomes admin automatically.

## Quick Start without Docker

```bash
pnpm install
cp .env.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, LLM_API_KEY
pnpm run db:push
pnpm run dev
```

Visit `http://localhost:3000` and sign up. First user gets admin role.

## Manual Hosting

```bash
git clone <your-repo>
cd ai_erp_system
pnpm install --frozen-lockfile

export DATABASE_URL="mysql://user:password@host:3306/database"
export JWT_SECRET="$(openssl rand -hex 32)"
export NODE_ENV="production"

pnpm run db:push
pnpm run build
pnpm run start
```

Optional: use PM2 for process management (`pm2 start dist/_core/index.js --name ai-erp`).

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string (e.g., `mysql://user:pass@host:3306/ai_erp_system`) |
| `JWT_SECRET` | Secure secret, minimum 32 characters. Generate with `openssl rand -hex 32` |

### Recommended

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Server port | `3000` |
| `APP_URL` | Public URL for email links | `http://localhost:3000` |

### LLM Configuration

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `anthropic` |
| `LLM_API_KEY` | Your Anthropic API key |
| `LLM_MODEL` | Model name (default: `claude-sonnet-4-20250514`) |

### Optional Integrations

| Variable | Description |
|---|---|
| `SENDGRID_API_KEY` | Transactional email |
| `QUICKBOOKS_CLIENT_ID` / `_SECRET` | QuickBooks sync |
| `SHOPIFY_CLIENT_ID` / `_SECRET` | Shopify sync |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Workspace |
| `IMAP_HOST` / `_USER` / `_PASSWORD` | Email inbox scanning |

See `.env.example` for the full list.

## First-Time Setup

1. Visit your deployment URL — you'll be redirected to `/login`
2. Click "Sign up" at the bottom
3. Enter name, email, and password (8+ characters)
4. First user automatically gets **admin** role
5. Invite team: Settings → Team → Invite Team Member

## SSL / HTTPS

Railway provides HTTPS automatically. For Docker/manual:

**Let's Encrypt:**

```bash
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/
docker compose restart nginx
```

**Cloudflare:** Point domain to Cloudflare, set SSL to "Full", use origin certificates.

## Troubleshooting

**"Cannot connect to database"** — Verify `DATABASE_URL` is set and the database is accessible. Format: `mysql://user:password@host:3306/database`. For PlanetScale, make sure the URL includes `?ssl={"rejectUnauthorized":true}`. Redeploy after changing env vars.

**"Invalid session cookie" / immediate logout** — `JWT_SECRET` is missing or too short. Must be 32+ characters. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Redeploy after setting.

**404 on direct navigation** — Ensure your hosting platform serves `index.html` for all routes (SPA routing). For Railway this is handled automatically.

**Seeing raw code instead of the app** — Build may not have run. Check that `pnpm run build` completed and `dist/public/` was created.

**Page loads but looks broken** — Build may have failed. Check deployment logs. Verify `dist/public/` was created.

**Slow first load** — Normal for cold starts (3-5s). Keep warm with health check pings. Ensure database is in the same region.

## Production Checklist

- [ ] `NODE_ENV=production`
- [ ] Strong `JWT_SECRET` (32+ chars, never committed to git)
- [ ] `APP_URL` set to your domain
- [ ] SSL/HTTPS enabled
- [ ] Database backups configured
- [ ] SendGrid configured for transactional emails
- [ ] Firewall rules (allow 80, 443, SSH only)

## Health Check

```
GET /api/health
```

Returns `{"status":"ok","timestamp":"..."}`. Docker containers and Railway poll this automatically.

