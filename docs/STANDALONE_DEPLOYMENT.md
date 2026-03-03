# Standalone Deployment Guide

This guide explains how to deploy the AI ERP System as a completely standalone application without any dependency on manus.ai or external authentication providers.

## Overview

The AI ERP System is now fully self-contained and can be deployed on any platform that supports Node.js applications. No external OAuth provider is required - the system includes built-in email/password authentication.

## Prerequisites

- Node.js 18+ runtime environment
- MySQL database (can be hosted anywhere - Railway, PlanetScale, AWS RDS, etc.)
- A server or platform to run the Node.js application

## Supported Platforms

### Railway (Recommended)

Railway is the easiest deployment option with automatic builds and deployments.

1. **Connect Your Repository:**
   - Go to [Railway.app](https://railway.app)
   - Create a new project from your GitHub repository
   - Railway will auto-detect the Node.js application

2. **Add MySQL Database:**
   - In your Railway project, click "New" → "Database" → "MySQL"
   - Railway will automatically set the `DATABASE_URL` environment variable

3. **Configure Environment Variables:**
   ```
   JWT_SECRET=your-very-secure-random-string-min-32-chars
   NODE_ENV=production
   ```

4. **Deploy:**
   - Railway will automatically build and deploy when you push to your main branch
   - Build command: `npm run build`
   - Start command: `npm run start`

5. **Create First User:**
   - Visit your Railway URL (e.g., `https://your-app.railway.app`)
   - You'll be redirected to `/login`
   - Sign up with your email and password
   - The first user automatically gets admin access

### Vercel + PlanetScale

1. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Set up PlanetScale Database:**
   - Create a database at [planetscale.com](https://planetscale.com)
   - Get your connection string
   - Add to Vercel environment variables:
     ```
     DATABASE_URL=mysql://...@...planetscale.com/ai_erp_system?sslaccept=strict
     JWT_SECRET=your-very-secure-random-string-min-32-chars
     NODE_ENV=production
     ```

3. **Run Database Migrations:**
   ```bash
   # Set DATABASE_URL in local .env
   echo "DATABASE_URL=your-mysql-connection-string" > .env
   
   # Run migrations to create all tables
   npm run db:push
   ```

4. **Accessing Your Deployment:**
   - Your app will be at: `https://[your-project].vercel.app`
   - Visit the URL in your browser
   - You'll be redirected to `/login`
   - Click "Sign up" to create your first user
   - **The first user automatically gets admin role**
   - You're now logged in and ready to use the system!

   **Need detailed help?** See the [Vercel Access Guide](./VERCEL_ACCESS_GUIDE.md) for:
   - Finding your deployment URL
   - Troubleshooting common issues
   - Setting up custom domains
   - Database configuration
   
   **Want the quick version?** See [QUICK_START_VERCEL.md](../QUICK_START_VERCEL.md)

### AWS/DigitalOcean/Heroku

For traditional hosting platforms:

1. **Clone and Install:**
   ```bash
   git clone <your-repo>
   cd ai_erp_system
   npm install --production
   ```

2. **Set Environment Variables:**
   ```bash
   export DATABASE_URL="mysql://user:password@host:3306/database"
   export JWT_SECRET="your-very-secure-random-string-min-32-chars"
   export NODE_ENV="production"
   export PORT="8080"
   ```

3. **Run Database Migrations:**
   ```bash
   npm run db:push
   ```

4. **Build and Start:**
   ```bash
   npm run build
   npm run start
   ```

5. **Optional: Use PM2 for Process Management:**
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name ai-erp
   pm2 save
   pm2 startup
   ```

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build application
RUN pnpm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["pnpm", "run", "start"]
```

Build and run:
```bash
docker build -t ai-erp-system .
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://..." \
  -e JWT_SECRET="your-secret" \
  -e NODE_ENV="production" \
  ai-erp-system
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:3306/dbname` |
| `JWT_SECRET` | Session signing key (32+ chars) | `a8f9d7e6c5b4a3b2c1d0e9f8a7b6c5d4` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `APP_URL` | Public application URL | `http://localhost:3000` |
| `SENDGRID_API_KEY` | SendGrid for transactional emails | - |
| `SENDGRID_FROM_EMAIL` | Default sender email | - |
| `GOOGLE_CLIENT_ID` | Google OAuth/Drive integration | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | - |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks integration | - |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks secret | - |
| `SHOPIFY_CLIENT_ID` | Shopify integration | - |
| `SHOPIFY_CLIENT_SECRET` | Shopify secret | - |

## Post-Deployment Steps

### 1. Create Admin User

After deployment, visit your application URL. You'll be redirected to the login page.

1. Click "Sign up"
2. Enter your email and password
3. The first user created automatically receives admin privileges

### 2. Configure Integrations (Optional)

If you plan to use integrations:

1. Log in as admin
2. Go to Settings → Integrations
3. Configure QuickBooks, Shopify, Google Drive, etc.

### 3. Set Up SendGrid (Optional, but recommended)

For transactional emails (password resets, notifications):

1. Create a SendGrid account
2. Get your API key
3. Add to environment variables:
   ```
   SENDGRID_API_KEY=SG.xxx
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```

### 4. Invite Team Members

1. Go to Settings → Team
2. Click "Invite Team Member"
3. Enter email and select role
4. Team member receives an invitation email (if SendGrid is configured)

## Security Recommendations

### 1. Strong JWT Secret

Generate a cryptographically secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. HTTPS in Production

Always use HTTPS in production. Most platforms (Railway, Vercel) provide this automatically.

### 3. Database Security

- Use strong database passwords
- Enable SSL/TLS for database connections
- Restrict database access to your application's IP

### 4. Regular Updates

Keep dependencies updated:
```bash
npm update
npm audit fix
```

## Troubleshooting

### "Database not available"

Check that:
1. `DATABASE_URL` is set correctly
2. Database is accessible from your deployment environment
3. Database credentials are correct

### "Invalid session cookie"

This usually means:
1. `JWT_SECRET` changed after users logged in
2. Cookies are being blocked (check CORS/SameSite settings)

### Build Fails

Common issues:
1. Missing environment variables during build
2. Incompatible Node.js version (use 18+)
3. Try `npm install --legacy-peer-deps` if peer dependency conflicts occur

## Monitoring & Maintenance

### Database Backups

Set up automated backups for your MySQL database:
- Railway: Automatic daily backups (paid plans)
- PlanetScale: Built-in backup branches
- Self-hosted: Use `mysqldump` or database-specific backup tools

### Application Logs

Monitor application logs for errors:
```bash
# Railway
railway logs

# PM2
pm2 logs ai-erp

# Docker
docker logs <container-id>
```

### Health Checks

The application includes built-in health check endpoints:
- `/api/health` - Basic health check
- `/api/trpc/health` - tRPC connectivity check

## Migration from manus.ai

If you're migrating from a manus.ai deployment:

1. Existing users with manus.ai OAuth will need to create new accounts using email/password
2. Export data from your existing deployment
3. Import data into the new standalone deployment
4. All application features and data structures remain the same

## Support

For issues or questions:
1. Check the main [README.md](../README.md) for general documentation
2. Review [Environment Variables](#environment-variables-reference)
3. Check deployment platform documentation
4. Open an issue on GitHub

---

**Note:** This system is completely self-contained and does not require any external authentication service like manus.ai. All authentication is handled internally using industry-standard security practices (PBKDF2 password hashing, JWT sessions, secure HTTP-only cookies).
