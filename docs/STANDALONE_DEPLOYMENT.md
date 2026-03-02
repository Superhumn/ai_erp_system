# Standalone Deployment Guide

This guide covers deploying the AI ERP System without any external OAuth providers, using the built-in email/password authentication.

## Overview

The system supports two authentication modes:
1. **Local Authentication** (default) - Email/password stored locally
2. **OAuth Authentication** - External OAuth provider (configure `OAUTH_SERVER_URL`)

## Quick Start (Local Auth)

### 1. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
```env
DATABASE_URL=mysql://user:password@localhost:3306/ai_erp_system
JWT_SECRET=your-secret-key-here-min-32-chars-long
NODE_ENV=production
APP_URL=https://your-domain.com
```

### 2. Database Setup

```bash
pnpm install
pnpm db:push
```

### 3. Build and Start

```bash
pnpm build
pnpm start
```

## Authentication Endpoints

### Sign Up
```
POST /api/auth/signup
Body: { email, password, name }
```

### Sign In
```
POST /api/auth/login
Body: { email, password }
```

### Change Password
```
POST /api/auth/change-password
Body: { currentPassword, newPassword }
Headers: Cookie with session token
```

## Security Features

- **Password Hashing**: PBKDF2 with SHA-512, 100,000 iterations
- **Rate Limiting**: 5 attempts per 15 minutes per IP
- **Session Tokens**: JWT-based, 1-year expiry
- **HTTPS**: Required in production

## Deployment Options

### Railway

1. Create a new Railway project
2. Add MySQL database plugin
3. Set environment variables
4. Deploy from GitHub

### Vercel

The `vercel.json` is configured for SPA routing. For the backend, deploy separately to Railway or similar.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm build
CMD ["pnpm", "start"]
```
