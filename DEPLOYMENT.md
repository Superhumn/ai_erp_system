# Deployment Guide

Comprehensive guide for deploying the AI ERP System. Covers Docker, Railway, and manual hosting.

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- pnpm 10.4.1+
- MySQL 8.0+ database
- An Anthropic API key for LLM features (`LLM_API_KEY`)

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

## Platform-Specific Instructions

### Railway (Recommended)

1. Connect your GitHub repository at [railway.app](https://railway.app)
2. Add a MySQL database: New → Database → MySQL
3. Set environment variables: `JWT_SECRET`, `NODE_ENV=production`
4. Railway auto-detects build/start commands from `package.json`
5. Visit `https://[your-app].railway.app`, sign up as first user

### AWS / DigitalOcean / Manual Hosting

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

Optional: use PM2 for process management (`pm2 start dist/index.js --name ai-erp`).

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

## CI/CD Pipeline

See `docs/deployment-setup.md` for GitHub Actions CI/CD configuration with staging/production environments on Railway.

## Troubleshooting

**"Cannot connect to database"** — Verify `DATABASE_URL` is set and the database is accessible. Format: `mysql://user:password@host:3306/database`. Redeploy after changing env vars.

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

Returns `{"status":"ok","timestamp":"..."}`. Docker containers auto-poll this every 30 seconds.
