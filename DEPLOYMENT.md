# Independent Deployment Guide

This guide covers deploying the AI ERP System independently (off the Manus.ai platform).

## Prerequisites

- Docker & Docker Compose (or Node.js 20+ and MySQL 8+)
- A domain name (for production with SSL)
- An LLM API key (OpenAI, Kimi/Moonshot, or any OpenAI-compatible provider)

## Quick Start with Docker

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum, set:

```env
JWT_SECRET=<run: openssl rand -hex 32>
LLM_API_KEY=sk-your-openai-key
MYSQL_PASSWORD=your-secure-db-password
MYSQL_ROOT_PASSWORD=your-secure-root-password
```

### 2. Start everything

```bash
docker compose up -d
```

This starts:
- **app** — Node.js server on port 3000
- **db** — MySQL 8 on port 3306
- **nginx** — Reverse proxy on port 80/443

### 3. Run database migrations

```bash
docker compose exec app npx drizzle-kit generate
docker compose exec app npx drizzle-kit migrate
```

### 4. Create your first admin user

Open `http://localhost` in your browser, click "Create one" on the login page, and register. Then promote yourself to admin:

```bash
docker compose exec db mysql -u erp_user -p ai_erp_system \
  -e "UPDATE users SET role='admin' WHERE email='you@company.com';"
```

## Quick Start without Docker

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up MySQL

Create a database:
```sql
CREATE DATABASE ai_erp_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'erp_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON ai_erp_system.* TO 'erp_user'@'localhost';
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, JWT_SECRET, and LLM_API_KEY
```

### 4. Run migrations and start

```bash
pnpm run db:push
pnpm run dev        # Development
# OR
pnpm run build && pnpm run start  # Production
```

## LLM Configuration

The system supports any OpenAI-compatible API. Set these in `.env`:

| Provider | LLM_API_URL | LLM_MODEL | LLM_API_KEY |
|----------|-------------|-----------|-------------|
| **OpenAI** (default) | *(leave empty)* | `gpt-4o` | `sk-...` |
| **Kimi / Moonshot** | `https://api.moonshot.cn` | `moonshot-v1-128k` | Your Moonshot key |
| **Azure OpenAI** | `https://your-resource.openai.azure.com` | `gpt-4o` | Your Azure key |
| **Local (Ollama)** | `http://localhost:11434` | `llama3` | `ollama` |

## SSL / HTTPS Setup

### Option A: Let's Encrypt (recommended)

```bash
# Install certbot
apt install certbot

# Get certificate
certbot certonly --standalone -d yourdomain.com

# Copy certs
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/
```

Then uncomment the SSL lines in `nginx/nginx.conf` and restart:
```bash
docker compose restart nginx
```

### Option B: Cloudflare (easiest)

Point your domain to Cloudflare, set SSL mode to "Full", and use Cloudflare's origin certificates.

## Production Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Generate a strong `JWT_SECRET` (min 32 chars): `openssl rand -hex 32`
- [ ] Set `PUBLIC_APP_URL` to your domain (for email links)
- [ ] Configure SSL/HTTPS
- [ ] Set up database backups (cron + `mysqldump`)
- [ ] Configure SendGrid for transactional emails
- [ ] Set strong MySQL passwords
- [ ] Enable firewall (allow only 80, 443, and SSH)

## File Storage

For file uploads, configure AWS S3 or an S3-compatible service:

```env
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-erp-bucket
```

S3-compatible alternatives: MinIO (self-hosted), Cloudflare R2, Backblaze B2.

## Monitoring

The health check endpoint is available at:
```
GET /api/health
```

Returns `{"status":"ok","timestamp":"..."}` when the server is running.

For Docker, the container includes a built-in healthcheck that polls this endpoint every 30 seconds.
